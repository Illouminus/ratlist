/**
 * Centralised error mapping for the whole app.
 *
 * Every place that catches an error from Supabase (PostgrestError,
 * AuthError, FunctionsError, plain `throw`) should funnel it through
 * `errorMessage(t, err)` instead of stuffing the raw message into the
 * UI. The mapper translates known Postgres SQLSTATEs, RAISE EXCEPTION
 * payloads from our SECURITY DEFINER functions, and a handful of
 * well-known message fragments into a stable, localised string.
 *
 * When you add a new CHECK constraint, RPC exception, or expected
 * failure mode — update `errorCode()` here, add the i18n key under
 * `errors.*`, and the rest of the codebase stays untouched.
 *
 * Postgres SQLSTATEs we care about:
 *   23502 not_null_violation
 *   23503 foreign_key_violation
 *   23505 unique_violation       (e.g. handle already taken)
 *   23514 check_violation        (e.g. items_title_check)
 *   42501 insufficient_privilege (RLS denial)
 *   P0001 raise_exception        (anything thrown by plpgsql)
 */

/** Stable codes the UI knows how to translate. */
export type AppErrorCode =
  | 'generic'
  | 'network'
  | 'notAuthenticated'
  | 'permissionDenied'
  | 'duplicate'
  // items
  | 'titleTooLong'
  | 'titleRequired'
  | 'foreignKey'
  // profiles / onboarding
  | 'handleTaken'
  | 'handleInvalidFormat'
  | 'displayNameRequired'
  // invites
  | 'inviteNotFound'
  | 'inviteExpired'
  | 'inviteUsed'
  // groups
  | 'lastAdmin'
  | 'soleAdminGroups'
  // santa
  | 'santaTooFew'
  | 'santaNoValid'
  | 'santaWrongStatus'
  | 'santaNotOrganiser'
  | 'santaCannotReveal'
  // storage / photos
  | 'photoTooLarge'
  | 'photoBadType';

/**
 * Minimal duck-typed shape we accept. Supabase's PostgrestError,
 * AuthError, FunctionsError all expose at least `message` and
 * (sometimes) `code`. We never depend on the actual class.
 */
interface KnownErrorShape {
  code?: string;
  message?: string;
}

function isErrorObject(v: unknown): v is KnownErrorShape {
  return typeof v === 'object' && v !== null;
}

/** Maps any error-ish value to one of our stable codes. */
export function errorCode(err: unknown): AppErrorCode {
  if (err === null || err === undefined) return 'generic';
  if (typeof err === 'string') return matchMessage(err);

  if (!isErrorObject(err)) return 'generic';

  const code = typeof err.code === 'string' ? err.code : undefined;
  const message = typeof err.message === 'string' ? err.message : '';

  // SQLSTATE-driven matching first — it's the most reliable signal.
  if (code === '23514') {
    if (message.includes('items_title_check')) return 'titleTooLong';
    if (message.includes('profiles_handle_format')) return 'handleInvalidFormat';
    return 'generic';
  }
  if (code === '23505') {
    if (message.includes('profiles_handle_key')) return 'handleTaken';
    return 'duplicate';
  }
  if (code === '23503') return 'foreignKey';
  if (code === '42501') return 'permissionDenied';

  // RAISE EXCEPTION from our plpgsql functions
  if (code === 'P0001') return matchMessage(message);

  // No code → fall through to message-based matching
  return matchMessage(message);
}

/** Same as `errorCode` but ready to drop into JSX. */
export function errorMessage(
  t: (key: string) => string,
  err: unknown,
): string {
  return t(`errors.${errorCode(err)}`);
}

// ─────────────────────────── message matcher ───────────────────────────

/**
 * Pattern-match well-known fragments. Order matters: more specific
 * matches first. Keep the list short — if you find yourself adding
 * dozens of strings, add a SQLSTATE or named exception instead.
 */
function matchMessage(message: string): AppErrorCode {
  if (!message) return 'generic';
  const m = message;

  // Our RPC RAISE EXCEPTION payloads (the exception text becomes the
  // PostgrestError message).
  if (m.includes('invite_not_found')) return 'inviteNotFound';
  if (m.includes('invite_expired')) return 'inviteExpired';
  if (m.includes('invite_already_used')) return 'inviteUsed';

  if (m.includes('last_admin')) return 'lastAdmin';
  if (m.includes('sole_admin_of_groups')) return 'soleAdminGroups';

  if (m.includes('too_few_participants')) return 'santaTooFew';
  if (m.includes('no_valid_assignment')) return 'santaNoValid';
  if (m.includes('wrong_status')) return 'santaWrongStatus';
  if (m.includes('not_organiser') || m.includes('not_organizer')) return 'santaNotOrganiser';
  if (m.includes('cannot_reveal')) return 'santaCannotReveal';

  if (m.includes('display_name_required')) return 'displayNameRequired';

  // Constraint name fragments (when the SQLSTATE happened not to
  // arrive — e.g. via a stringified message)
  if (m.includes('items_title_check')) return 'titleTooLong';
  if (m.includes('profiles_handle_format')) return 'handleInvalidFormat';

  // Storage / upload errors from our own utility
  if (m.includes('file_too_large')) return 'photoTooLarge';
  if (m.includes('unsupported_type')) return 'photoBadType';

  // RLS denial without a SQLSTATE (rare, but defensive)
  if (m.toLowerCase().includes('row-level security')) return 'permissionDenied';

  // Network / fetch failures
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'network';

  if (m.includes('not authenticated')) return 'notAuthenticated';

  return 'generic';
}
