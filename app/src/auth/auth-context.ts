/**
 * React context for the auth state. Lives in its own file so the
 * `AuthProvider` module only exports components — required for Vite's
 * fast-refresh to track changes correctly.
 */
import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /**
   * Send a magic link. Returns `null` on success, or a stable error code
   * the UI can map to a localised message. Never throws.
   *
   * `nextPath` (optional) is preserved through the round-trip so the user
   * lands back where they started — used for "sign in to join this event"
   * flows. Only same-origin paths starting with `/` are honored; anything
   * else is dropped to prevent open-redirect attacks.
   */
  signInWithMagicLink: (email: string, nextPath?: string | null) => Promise<string | null>;
  /**
   * Start the Google OAuth flow. Resolves immediately if the request to
   * Supabase was accepted (the browser then navigates to Google); returns
   * a stable error code if Supabase refused the request. `nextPath` works
   * the same way as on `signInWithMagicLink`.
   */
  signInWithGoogle: (nextPath?: string | null) => Promise<string | null>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
