// supabase/tests/integration/helpers/env.ts
//
// Sanity guard for integration tests. Imported by every test file
// (transitively via client.ts). Aborts the suite immediately if the
// env points at anything other than a local Supabase instance.
//
// Env var names come from `supabase status --output env`:
//   API_URL, ANON_KEY, SERVICE_ROLE_KEY, JWT_SECRET
// Also accepts the SUPABASE_* prefixed variants for CI compatibility.

const rawUrl =
  process.env.SUPABASE_URL ??
  process.env.API_URL;

if (!rawUrl || !(rawUrl.startsWith('http://127.0.0.1:') || rawUrl.startsWith('http://localhost:'))) {
  throw new Error(
    `integration tests refuse to run against ${rawUrl ?? '(unset)'} — local Supabase only. ` +
      `Run \`supabase status --output env\` and export the result.`,
  );
}

const required = {
  SUPABASE_URL: rawUrl,
  SUPABASE_ANON_KEY:
    process.env.SUPABASE_ANON_KEY ??
    process.env.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SERVICE_ROLE_KEY,
  SUPABASE_JWT_SECRET:
    process.env.SUPABASE_JWT_SECRET ??
    process.env.JWT_SECRET,
};

for (const [k, v] of Object.entries(required)) {
  if (!v) throw new Error(`integration tests missing env: ${k}`);
}

export const SUPABASE_URL = required.SUPABASE_URL;
export const ANON_KEY = required.SUPABASE_ANON_KEY!;
export const SERVICE_ROLE_KEY = required.SUPABASE_SERVICE_ROLE_KEY!;
export const JWT_SECRET = required.SUPABASE_JWT_SECRET!;
