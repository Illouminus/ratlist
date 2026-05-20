/**
 * `mangopay-kyc-light` — one-time KYC LIGHT collection for new cagnotte
 * coordinators.
 *
 * Idempotent on re-call: returns the existing mangopay_user_id if a
 * `mangopay_users` row already exists for this user (no duplicate Mangopay
 * resources created).
 *
 * Flow:
 *   1. Caller authenticated via Supabase JWT (Authorization header)
 *   2. If mangopay_users row exists → return it (idempotent)
 *   3. Else: create Mangopay NATURAL User → create BankAccount → insert
 *      mangopay_users row → return new mangopay_user_id
 *
 * KYC LIGHT is sufficient for receiving up to €2,500 lifetime payouts.
 * REGULAR KYC (document upload) is Phase 2+ work.
 *
 * Error paths:
 *   401 — missing or invalid JWT
 *   400 — validation_failed (missing/malformed fields) | invalid_json
 *   500 — persistence_failed (Mangopay resources created but DB write failed;
 *          orphaned Mangopay resources are logged — manual cleanup; acceptable
 *          for v1 since this is a one-time per-user call)
 *   502 — mangopay error (message surfaced to client for rendering)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { bindCors } from '../_shared/cors.ts';
import { createNaturalUser, createBankAccount } from '../_shared/mangopay.ts';

interface RequestBody {
  firstName: string;
  lastName: string;
  birthday: string;           // YYYY-MM-DD
  nationality: string;        // ISO 3166-1 alpha-2 (e.g. "FR")
  countryOfResidence: string; // ISO 3166-1 alpha-2
  iban: string;
  addressLine1: string;
  city: string;
  postalCode: string;
  country: string;            // ISO alpha-2
}

/** ISO 3166-1 alpha-2 — two uppercase letters. */
const ISO2_RE = /^[A-Z]{2}$/;

/**
 * Loose IBAN format check (stripped of spaces): two uppercase letters for
 * country code, two digits for check digits, then 1-30 alphanumeric chars.
 * Mangopay does the strict mod-97 validation server-side.
 */
const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/;

function validateBody(
  b: Partial<RequestBody>,
): b is RequestBody {
  return (
    typeof b.firstName === 'string' && b.firstName.trim().length > 0 &&
    typeof b.lastName === 'string' && b.lastName.trim().length > 0 &&
    typeof b.birthday === 'string' && !isNaN(Date.parse(b.birthday)) &&
    typeof b.nationality === 'string' && ISO2_RE.test(b.nationality) &&
    typeof b.countryOfResidence === 'string' && ISO2_RE.test(b.countryOfResidence) &&
    typeof b.iban === 'string' && IBAN_RE.test(b.iban.replace(/\s+/g, '')) &&
    typeof b.addressLine1 === 'string' && b.addressLine1.trim().length > 0 &&
    typeof b.city === 'string' && b.city.trim().length > 0 &&
    typeof b.postalCode === 'string' && b.postalCode.trim().length > 0 &&
    typeof b.country === 'string' && ISO2_RE.test(b.country)
  );
}

Deno.serve(async (req) => {
  const cors = bindCors(req);
  if (req.method === 'OPTIONS') return cors.preflight();
  if (req.method !== 'POST') return cors.json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return cors.json({ error: 'server_misconfigured' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return cors.json({ error: 'unauthenticated' }, 401);

  // Identify the caller from the JWT. Use the anon-key client so getUser()
  // validates the token against Supabase Auth without service-role privileges.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userResult, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userResult.user) {
    return cors.json({ error: 'unauthenticated' }, 401);
  }
  const user = userResult.user;

  // Service-role client for all DB reads/writes (RLS bypassed).
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Idempotency: return existing mapping if already created.
  const { data: existing } = await admin
    .from('mangopay_users')
    .select('mangopay_user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    return cors.json(
      { mangopay_user_id: existing.mangopay_user_id as string, already_exists: true },
    );
  }

  // Parse body.
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return cors.json({ error: 'invalid_json' }, 400);
  }

  // Validate all required fields before touching Mangopay.
  if (!validateBody(rawBody as Partial<RequestBody>)) {
    return cors.json({ error: 'validation_failed' }, 400);
  }
  const body = rawBody as RequestBody;

  try {
    const mpUser = await createNaturalUser({
      email: user.email!,
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      birthday: new Date(body.birthday),
      nationality: body.nationality,
      countryOfResidence: body.countryOfResidence,
    });

    const bank = await createBankAccount(mpUser.Id, {
      ownerName: `${body.firstName.trim()} ${body.lastName.trim()}`,
      iban: body.iban.replace(/\s+/g, ''),
      ownerAddress: {
        addressLine1: body.addressLine1.trim(),
        city: body.city.trim(),
        postalCode: body.postalCode.trim(),
        country: body.country,
      },
    });

    const { error: insertErr } = await admin.from('mangopay_users').insert({
      user_id: user.id,
      mangopay_user_id: mpUser.Id,
      kyc_level: 'LIGHT',
      bank_account_id: bank.Id,
    });

    if (insertErr) {
      // Mangopay resources were created but the DB write failed. Log the
      // Mangopay User ID for manual reconciliation. The idempotency check
      // won't catch orphaned Mangopay entries on the next call because
      // there's no DB row — acceptable for v1 (one-time per-user call).
      console.error(
        'mangopay_users insert failed after Mangopay resource creation',
        { mangopay_user_id: mpUser.Id, bank_account_id: bank.Id, detail: insertErr.message },
      );
      return cors.json(
        { error: 'persistence_failed', mangopay_user_id: mpUser.Id },
        500,
      );
    }

    return cors.json({ mangopay_user_id: mpUser.Id, already_exists: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('mangopay-kyc-light failed', message);
    return cors.json({ error: message }, 502);
  }
});
