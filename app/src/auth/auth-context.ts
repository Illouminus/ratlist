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
   */
  signInWithMagicLink: (email: string) => Promise<string | null>;
  /**
   * Start the Google OAuth flow. Resolves immediately if the request to
   * Supabase was accepted (the browser then navigates to Google); returns
   * a stable error code if Supabase refused the request.
   */
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
