/**
 * `mangopay` — server-side Mangopay v2.01 REST client.
 *
 * Used by every cagnotte-* Edge Function in Phase 4. All money operations
 * live here, never in the browser.
 *
 * Auth: HTTP Basic with CLIENT_ID:API_KEY (Mangopay's standard convention).
 * All endpoints are scoped under /v2.01/{CLIENT_ID}/...
 *
 * Env vars (set in supabase/.env, never committed):
 *   MANGOPAY_ENV            'sandbox' | 'production'  (default: 'sandbox')
 *   MANGOPAY_CLIENT_ID      from Mangopay dashboard
 *   MANGOPAY_API_KEY        from Mangopay dashboard
 *   MANGOPAY_WEBHOOK_SECRET for HMAC verification (Phase 4 webhook handler)
 *
 * The low-level `mangopay()` helper throws on non-2xx with the response body
 * in the message — callers should catch and map to their own error codes.
 * Higher-level helpers (createWallet, createCardDirectPayIn, …) wrap it with
 * typed inputs + outputs matching Mangopay's documented JSON shapes.
 */

const ENV = Deno.env.get('MANGOPAY_ENV') ?? 'sandbox';
const HOST =
  ENV === 'production'
    ? 'https://api.mangopay.com'
    : 'https://api.sandbox.mangopay.com';
const CLIENT_ID = Deno.env.get('MANGOPAY_CLIENT_ID') ?? '';
const API_KEY = Deno.env.get('MANGOPAY_API_KEY') ?? '';

function authHeader(): string {
  return 'Basic ' + btoa(`${CLIENT_ID}:${API_KEY}`);
}

/** Low-level wrapper. Throws on non-2xx responses with body in message. */
async function mangopay<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<T> {
  if (!CLIENT_ID || !API_KEY) {
    throw new Error(
      'mangopay_credentials_missing — set MANGOPAY_CLIENT_ID and MANGOPAY_API_KEY',
    );
  }
  const resp = await fetch(`${HOST}/v2.01/${CLIENT_ID}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`mangopay_${resp.status}: ${text}`);
  }
  return resp.json() as Promise<T>;
}

// ── Users (NATURAL — individual persons) ─────────────────────────────────────

export type MangopayUser = {
  Id: string;
  PersonType: 'NATURAL' | 'LEGAL';
  Email: string;
  FirstName?: string;
  LastName?: string;
  Birthday?: number;
  Nationality?: string;
  CountryOfResidence?: string;
  KYCLevel: 'LIGHT' | 'REGULAR';
};

export async function createNaturalUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  birthday: Date;
  nationality: string;         // ISO 3166-1 alpha-2 (e.g. "FR")
  countryOfResidence: string;  // ISO 3166-1 alpha-2
}): Promise<MangopayUser> {
  return mangopay<MangopayUser>('POST', '/users/natural', {
    Email: input.email,
    FirstName: input.firstName,
    LastName: input.lastName,
    Birthday: Math.floor(input.birthday.getTime() / 1000),
    Nationality: input.nationality,
    CountryOfResidence: input.countryOfResidence,
  });
}

// ── Bank accounts (IBAN) ──────────────────────────────────────────────────────

export type MangopayBankAccount = {
  Id: string;
  UserId: string;
  IBAN: string;
  BIC?: string;
  OwnerName: string;
};

export async function createBankAccount(
  userId: string,
  input: {
    ownerName: string;
    iban: string;
    ownerAddress: {
      addressLine1: string;
      city: string;
      postalCode: string;
      country: string;  // ISO alpha-2
    };
  },
): Promise<MangopayBankAccount> {
  return mangopay<MangopayBankAccount>('POST', `/users/${userId}/bankaccounts/iban`, {
    OwnerName: input.ownerName,
    IBAN: input.iban,
    OwnerAddress: {
      AddressLine1: input.ownerAddress.addressLine1,
      City: input.ownerAddress.city,
      PostalCode: input.ownerAddress.postalCode,
      Country: input.ownerAddress.country,
    },
  });
}

// ── Wallets ───────────────────────────────────────────────────────────────────

export type MangopayWallet = {
  Id: string;
  Owners: string[];
  Currency: string;
  Balance: { Amount: number; Currency: string };
  Description?: string;
};

export async function createWallet(input: {
  ownerIds: string[];
  description: string;
}): Promise<MangopayWallet> {
  return mangopay<MangopayWallet>('POST', '/wallets', {
    Owners: input.ownerIds,
    Description: input.description,
    Currency: 'EUR',
  });
}

// ── Card registrations + PayIns ───────────────────────────────────────────────

export type CardRegistration = {
  Id: string;
  UserId: string;
  Status: 'CREATED' | 'VALIDATED' | 'ERROR';
  PreregistrationData: string;
  AccessKey: string;
  CardRegistrationURL: string;
  CardId?: string;
};

export async function createCardRegistration(
  userId: string,
): Promise<CardRegistration> {
  return mangopay<CardRegistration>('POST', '/cardregistrations', {
    UserId: userId,
    Currency: 'EUR',
    CardType: 'CB_VISA_MASTERCARD',
  });
}

export async function updateCardRegistration(
  regId: string,
  registrationData: string,
): Promise<CardRegistration> {
  return mangopay<CardRegistration>('PUT', `/cardregistrations/${regId}`, {
    RegistrationData: registrationData,
  });
}

export type PayIn = {
  Id: string;
  Status: 'CREATED' | 'SUCCEEDED' | 'FAILED';
  CreditedFunds: { Amount: number; Currency: string };
  SecureModeRedirectURL?: string;
  ResultCode?: string;
  ResultMessage?: string;
};

export async function createCardDirectPayIn(input: {
  authorId: string;
  cardId: string;
  creditedWalletId: string;
  amountCents: number;
  returnUrl: string;
}): Promise<PayIn> {
  return mangopay<PayIn>('POST', '/payins/card/direct', {
    AuthorId: input.authorId,
    CardId: input.cardId,
    CreditedWalletId: input.creditedWalletId,
    DebitedFunds: { Amount: input.amountCents, Currency: 'EUR' },
    Fees: { Amount: 0, Currency: 'EUR' },
    SecureMode: 'FORCE',  // PSD2 / 3DS always
    SecureModeReturnURL: input.returnUrl,
  });
}

// ── PayOuts ───────────────────────────────────────────────────────────────────

export type PayOut = {
  Id: string;
  Status: 'CREATED' | 'SUCCEEDED' | 'FAILED';
  ResultCode?: string;
  ResultMessage?: string;
};

export async function createPayOut(input: {
  authorId: string;
  debitedWalletId: string;
  bankAccountId: string;
  amountCents: number;
}): Promise<PayOut> {
  return mangopay<PayOut>('POST', '/payouts/bankwire', {
    AuthorId: input.authorId,
    DebitedWalletId: input.debitedWalletId,
    BankAccountId: input.bankAccountId,
    DebitedFunds: { Amount: input.amountCents, Currency: 'EUR' },
    Fees: { Amount: 0, Currency: 'EUR' },
    BankWireRef: 'cagnotte',  // appears on the beneficiary's bank statement
  });
}

// ── Refunds ───────────────────────────────────────────────────────────────────

export type Refund = {
  Id: string;
  Status: string;
  InitialTransactionId: string;
};

export async function refundPayIn(
  payInId: string,
  reason:
    | 'deadline_passed'
    | 'cancelled_by_coordinator'
    | 'event_deleted'
    | 'other',
): Promise<Refund> {
  return mangopay<Refund>('POST', `/payins/${payInId}/refunds`, {
    Reason: { RefundReason: 'OTHER', RefundReasonMessage: reason },
  });
}

// ── Wallet-to-wallet transfers ────────────────────────────────────────────────

export async function transferBetweenWallets(input: {
  authorId: string;
  debitedWalletId: string;
  creditedWalletId: string;
  amountCents: number;
}): Promise<{ Id: string; Status: string }> {
  return mangopay<{ Id: string; Status: string }>('POST', '/transfers', {
    AuthorId: input.authorId,
    DebitedWalletId: input.debitedWalletId,
    CreditedWalletId: input.creditedWalletId,
    DebitedFunds: { Amount: input.amountCents, Currency: 'EUR' },
    Fees: { Amount: 0, Currency: 'EUR' },
  });
}

// ── Webhook signature verification ───────────────────────────────────────────

/**
 * Verifies an inbound Mangopay webhook request signature.
 *
 * Mangopay signs the request body with HMAC-SHA256 using the webhook secret
 * configured in the Mangopay dashboard. The signature arrives in the
 * X-Mangopay-Signature header.
 *
 * Returns true if the signature matches the body, false otherwise.
 * Callers should respond with 401 on false.
 *
 * Uses the Web Crypto API (available in Deno). The final comparison is
 * constant-time to protect against timing attacks.
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false;
  const keyData = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const bodyData = new TextEncoder().encode(body);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, bodyData);
  const computed = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time compare — guards against timing side-channel attacks.
  if (computed.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}
