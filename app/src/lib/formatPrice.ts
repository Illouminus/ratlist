/**
 * Normalize price strings into "€XX,XX" with comma decimal and two
 * decimal places, defaulting to EUR for bare numeric input. Strings
 * that carry a non-EUR currency marker (`$`, `£`, `₽`, …) are passed
 * through untouched; free-text inputs we can't confidently interpret
 * as a single number are also passed through.
 *
 * The eurozone default is deliberate: the friend playtest (2026-05-27)
 * surfaced that most owners type amounts as "50" / "180" and expect
 * them rendered as "€50,00" / "€180,00". The earlier
 * "only-normalise-if-€-or-EUR-is-present" rule (PR #32) was too
 * conservative and missed the common case.
 *
 * Examples:
 *   '€109.00'     → '€109,00'
 *   '€22,99'      → '€22,99'
 *   '€39'         → '€39,00'
 *   '109.00 EUR'  → '€109,00'
 *   '50'          → '€50,00'   (bare number → default EUR)
 *   '180'         → '€180,00'  (bare number → default EUR)
 *   '$54'         → '$54'      (explicit non-EUR currency)
 *   '600₽'        → '600₽'     (explicit non-EUR currency)
 *   '£40.50'      → '£40.50'   (explicit non-EUR currency)
 *   '50 USD'      → '50 USD'   (explicit non-EUR currency code)
 *   'approx 60'   → 'approx 60' (free text, can't normalise safely)
 */
export function formatPrice(raw: string | null | undefined): string {
  if (raw == null) return '';
  const s = raw.trim();
  if (!s) return s;

  // Bail on explicit non-EUR currency markers (symbol or 3-letter code).
  // Leaves anything we're not sure is a euro amount untouched.
  if (/[$£¥₽₩₪₴₺]|\b(usd|gbp|jpy|rub|cad|aud|chf|cny|sek|nok|dkk|pln)\b/i.test(s)) {
    return s;
  }

  // Pull out the first numeric run. If there isn't one — return as is.
  const numMatch = s.match(/[\d.,]+/);
  if (!numMatch) return s;

  // The string must be ONLY a number (with optional € / EUR / whitespace).
  // Anything else — "approx 60", "70-80", "5 штук" — is free text we
  // shouldn't fabricate a euro amount from.
  const stripped = s.replace(/€|EUR|eur|\s/g, '');
  if (stripped !== numMatch[0]) return s;

  const num = parseAmount(numMatch[0]);
  if (num === null) return s;

  return `€${num.toFixed(2).replace('.', ',')}`;
}

/**
 * Parse a localised number where the decimal separator may be `.` or
 * `,` and the thousands separator may be the other. Heuristic: the
 * LAST separator wins as decimal, the rest are thousands.
 */
function parseAmount(s: string): number | null {
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalized: string;
  if (lastDot === -1 && lastComma === -1) {
    normalized = s;
  } else if (lastDot > lastComma) {
    normalized = s.replace(/,/g, '');
  } else {
    normalized = s.replace(/\./g, '').replace(',', '.');
  }
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : null;
}
