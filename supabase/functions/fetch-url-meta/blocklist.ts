/**
 * Host blocklist for the URL-metadata fetcher.
 *
 * The point isn't to be a content-moderation system — that's
 * impossible without an actual classifier — but to close the one
 * obvious abuse vector: a user pastes a porn URL into the "add
 * item" form, we cheerfully extract its og:image, and that
 * thumbnail then renders on a publicly-shareable wishlist or
 * Secret Santa drawer. The blocklist hits the well-known sites
 * that would obviously trigger this; everything else is either
 * spotted by the operator via `public.reports` or is acceptable
 * (false negatives are tolerable, false positives — politely
 * declining to fetch a *legit* URL — are nearly free in cost
 * since the user can paste an item title manually).
 *
 * Update policy: only add domains we'd be confident saying "we
 * don't want item previews from here". Don't add anything
 * ambiguous (e.g. Reddit, even though some subreddits are NSFW)
 * — the operator can deal with edge cases in the report queue.
 *
 * If this list starts changing weekly, promote it to a DB table
 * so updates don't require a function redeploy.
 */

const NSFW_HOSTS: ReadonlySet<string> = new Set([
  // Tube sites — the top of any adult-content list.
  'pornhub.com',
  'xvideos.com',
  'xhamster.com',
  'xnxx.com',
  'youporn.com',
  'redtube.com',
  'tube8.com',
  'youjizz.com',
  'spankbang.com',
  'eporner.com',
  'beeg.com',
  'tnaflix.com',
  'porntrex.com',
  'porn5f.com',
  'thumbzilla.com',
  'porn.com',
  'sex.com',
  // Creator / cam platforms.
  'onlyfans.com',
  'fansly.com',
  'manyvids.com',
  'chaturbate.com',
  'cam4.com',
  'bongacams.com',
  'stripchat.com',
  'livejasmin.com',
  // Image / clip boards focused on adult content.
  'erome.com',
  'rule34.xxx',
  'rule34.xyz',
  'e621.net',
  'motherless.com',
]);

/**
 * Top-level domains where the *only* common use is adult content.
 * Conservative — TLDs like `.tube` and `.cam` have legitimate
 * non-adult uses so they stay off this list.
 */
const NSFW_TLDS: ReadonlySet<string> = new Set(['xxx', 'adult', 'porn', 'sex', 'sexy']);

/**
 * True when `hostname` should be refused metadata extraction.
 * Matches the host exactly or as a subdomain (so cdn.pornhub.com
 * is caught, while not-pornhub.com is not).
 */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  for (const blocked of NSFW_HOSTS) {
    if (host === blocked || host.endsWith('.' + blocked)) return true;
  }
  const tld = host.split('.').pop();
  if (tld && NSFW_TLDS.has(tld)) return true;
  return false;
}
