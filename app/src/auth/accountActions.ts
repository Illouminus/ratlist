/**
 * Thin client wrappers around the two account self-management RPCs
 * defined in migration 20260516150000_account_self_management.sql.
 *
 * Both functions need careful UI handling — delete must signOut and
 * redirect, export must turn the JSON into a downloadable file — so
 * they're factored here as plain functions the screen can compose with
 * its own loading / toast / dialog state.
 */
import { supabase } from '../lib/supabase';

// ─────────────────────────── export ───────────────────────────

export type ExportResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/**
 * Calls the `export_my_data` RPC and returns the JSON blob.
 *
 * The Postgres function runs as SECURITY INVOKER and is RLS-scoped —
 * claims on the caller's own items are deliberately omitted to preserve
 * the owner-blind invariant even in a self-export.
 */
export async function exportMyData(): Promise<ExportResult> {
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/**
 * Trigger a browser download for an arbitrary JSON-serialisable blob.
 * Filename includes the date so successive exports don't clobber each
 * other in the user's Downloads folder.
 */
export function downloadJson(blob: unknown, filenamePrefix: string): void {
  const json = JSON.stringify(blob, null, 2);
  const file = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Let the browser hold the blob until the click handler finishes, then free it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─────────────────────────── delete ───────────────────────────

/** Stable codes the UI can branch on. */
export type DeleteFailure =
  | { code: 'soleAdmin'; groups: string[] }
  | { code: 'generic'; message: string };

export type DeleteResult = { ok: true } | { ok: false; failure: DeleteFailure };

/**
 * Calls the `delete_my_account` RPC. The function refuses when the
 * caller is the sole admin of any group that has other members — we
 * parse that payload into a list of group names so the UI can point
 * the user at exactly the groups they need to deal with first.
 *
 * On success the auth row is gone but the client still holds a (now
 * stale) JWT — the caller is responsible for `signOut()` + redirect.
 */
export async function deleteMyAccount(): Promise<DeleteResult> {
  const { error } = await supabase.rpc('delete_my_account');
  if (!error) return { ok: true };

  const message = error.message ?? '';
  const match = /sole_admin_of_groups:\s*(.+)$/.exec(message);
  if (match) {
    const list = (match[1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return { ok: false, failure: { code: 'soleAdmin', groups: list } };
  }
  return { ok: false, failure: { code: 'generic', message } };
}
