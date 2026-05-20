// app/src/lib/mangopay.ts
//
// Browser-side Mangopay helper — used ONLY for card tokenisation.
// All money operations (PayIns, PayOuts, Refunds, Wallets) run from
// Edge Functions, not the browser. See supabase/functions/_shared/mangopay.ts.
//
// PCI-DSS scope: by posting card details directly to Mangopay from the
// browser (never to our backend), we stay out of PCI-DSS scope. Our
// backend only sees the registered card's opaque Mangopay CardId.

const MANGOPAY_ENV = import.meta.env.VITE_MANGOPAY_ENV ?? 'sandbox';

export const MANGOPAY_HOST =
  MANGOPAY_ENV === 'production'
    ? 'https://api.mangopay.com'
    : 'https://api.sandbox.mangopay.com';

/** Card registration object returned by the server-side createCardRegistration
 *  call. The browser uses it to POST card details to Mangopay's CardRegistrationURL. */
export type CardRegistrationData = {
  cardRegistrationId: string;
  preregistrationData: string;
  accessKey: string;
  cardRegistrationUrl: string;
};

/** Posts the card details to Mangopay's hosted endpoint. Returns the
 *  registration-data string that the caller's backend should pass to
 *  Mangopay's UpdateCardRegistration API to finalise the card.
 *
 *  Card data flow:
 *    1. Browser calls our Edge Function `cagnotte-contribute` → it returns
 *       a fresh CardRegistration (Id + AccessKey + URL + PreregistrationData).
 *    2. Browser calls this function with the card number + expiration + CVC
 *       — submits directly to Mangopay (never to our backend).
 *    3. Mangopay returns a string like "data=xyz123" — the registration data.
 *    4. Browser POSTs that string back to our `cagnotte-contribute` Edge
 *       Function, which calls UpdateCardRegistration to get the CardId,
 *       then immediately CreatePayIn to charge the card.
 *
 *  Note: this function does NOT validate the card number — Mangopay does that
 *  server-side and returns errors in the response body if invalid.
 */
export async function submitCardToMangopay(
  reg: CardRegistrationData,
  cardNumber: string,
  cardExpiration: string,  // MMYY format, e.g. "1226" for Dec 2026
  cardCvx: string,
): Promise<string> {
  const body = new URLSearchParams({
    data: reg.preregistrationData,
    accessKeyRef: reg.accessKey,
    cardNumber,
    cardExpirationDate: cardExpiration,
    cardCvx,
  });

  const resp = await fetch(reg.cardRegistrationUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await resp.text();
  if (!text.startsWith('data=')) {
    // Mangopay returns "errorCode=…&errorMessage=…" on failures.
    // Surface the raw response so the caller can route to a friendly error.
    throw new Error(`mangopay_card_register_failed: ${text}`);
  }
  return text;
}
