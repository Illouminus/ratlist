/**
 * Persistence for the first-run activation checklist (see
 * `components/ActivationChecklist`). A single localStorage flag marks the
 * account as graduated (all three steps done) or explicitly dismissed, so
 * the checklist — and its hooks + realtime subscription — never re-mount
 * on future visits.
 */
const DONE_KEY = 'kryska.activationDone';

export function isActivationDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markActivationDone(): void {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    /* private mode / storage disabled — the checklist just won't persist */
  }
}
