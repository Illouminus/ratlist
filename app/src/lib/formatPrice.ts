/**
 * Normalize EUR price strings into "€XX,XX" with comma decimal and
 * 2 decimal places. Non-EUR prices and unparseable strings are
 * returned unchanged — we only touch what we can confidently identify
 * as a euro amount.
 *
 * Why on the frontend, not at fetch time: the raw `price_text` from
 * `fetch-url-meta` is preserved in the DB so we can still see the
 * original site formatting. Display normalization is a UI concern.
 *
 * Examples:
 *   '€109.00'    → '€109,00'
 *   '€22,99'     → '€22,99'
 *   '€39'        → '€39,00'
 *   '109.00 EUR' → '€109,00'
 *   'EUR 109'    → '€109,00'
 *   '$54'        → '$54'   (other currency)
 *   '600₽'       → '600₽'  (other currency)
 *   '54'         → '54'    (no currency marker)
 */
export function formatPrice(raw: string | null | undefined): string {
  if (raw == null) return '';
  const s = raw.trim();
  if (!s) return s;

  // Three EUR shapes: "€NN", "EUR NN", "NN EUR". Capture the number
  // group in one of three alternatives. Case-insensitive for "EUR".
  const match = s.match(/(?:€\s*([\d.,]+))|(?:eur\s*([\d.,]+))|(?:([\d.,]+)\s*eur)/i);
  if (!match) return s;

  const numberStr = match[1] ?? match[2] ?? match[3];
  if (!numberStr) return s;

  const num = parseAmount(numberStr);
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
