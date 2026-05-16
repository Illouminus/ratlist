/**
 * Tiny relative-time helper. Returns a short, human-readable label like
 * "2д", "только что", "3 mo" — both languages share the same buckets
 * but use different short labels.
 *
 * Why not Intl.RelativeTimeFormat? Because we only ever render this in
 * a margin caveat and the default browser output is verbose ("два дня
 * назад"). The hand-tuned labels here match the design's understated
 * "updated 2 days ago" / «обновлено вчера» feel.
 *
 * Edge cases:
 *   - `null` returns null so callers can hide the row entirely
 *   - future timestamps (clock skew) collapse to "только что"
 *   - anything older than ~year is rendered with the absolute date
 *     (no "11 mo ago" rounding noise).
 */
type Lang = 'ru' | 'en';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatRelativeTime(iso: string | null, lang: Lang): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = Math.max(0, Date.now() - then);

  if (diff < MINUTE) return lang === 'ru' ? 'только что' : 'just now';
  if (diff < HOUR) {
    const n = Math.floor(diff / MINUTE);
    return lang === 'ru' ? `${n} мин` : `${n}m`;
  }
  if (diff < DAY) {
    const n = Math.floor(diff / HOUR);
    return lang === 'ru' ? `${n} ч` : `${n}h`;
  }
  if (diff < WEEK) {
    const n = Math.floor(diff / DAY);
    return lang === 'ru' ? `${n} д` : `${n}d`;
  }
  if (diff < MONTH) {
    const n = Math.floor(diff / WEEK);
    return lang === 'ru' ? `${n} нед` : `${n}w`;
  }
  if (diff < YEAR) {
    const n = Math.floor(diff / MONTH);
    return lang === 'ru' ? `${n} мес` : `${n}mo`;
  }

  // Older than a year — fall back to an absolute month/year label, so
  // we don't try to render "13 months ago".
  const d = new Date(iso);
  const locale = lang === 'ru' ? 'ru-RU' : 'en-GB';
  return d.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
}
