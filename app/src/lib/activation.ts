/**
 * Persistence for the first-run activation checklist (see
 * `components/ActivationChecklist`). A single localStorage flag marks the
 * account as graduated (all three steps done) or explicitly dismissed, so
 * the checklist — and its hooks + realtime subscription — never re-mount
 * on future visits.
 */
// Keyed per user id, not a single global key: localStorage is per browser
// origin, so a shared key leaked the "graduated" state across accounts —
// log in as a second user in the same browser and the checklist stayed
// hidden because the first user had completed it.
function keyFor(userId: string): string {
  return `kryska.activationDone.${userId}`;
}

export function isActivationDone(userId: string): boolean {
  try {
    return localStorage.getItem(keyFor(userId)) === '1';
  } catch {
    return false;
  }
}

export function markActivationDone(userId: string): void {
  try {
    localStorage.setItem(keyFor(userId), '1');
  } catch {
    /* private mode / storage disabled — the checklist just won't persist */
  }
}
