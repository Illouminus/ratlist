/**
 * `<RequireAuth>` — route guard. Wrap a route element with this to require
 * a signed-in user. Anonymous visitors are bounced to `/login`. While the
 * initial session is still loading, renders nothing (avoids flashing the
 * login page for already-authed returning users).
 *
 * Once authenticated, if the user hasn't completed onboarding (no
 * `onboarded_at`), they're sent to `/onboarding` — unless they're already
 * there.
 */
import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';

interface RequireAuthProps {
  children: ReactNode;
  /**
   * If `true`, allow access without a completed onboarding. Used by the
   * onboarding screen itself (otherwise it would redirect to itself).
   */
  allowPreOnboarding?: boolean;
}

export function RequireAuth({ children, allowPreOnboarding = false }: RequireAuthProps) {
  const { status } = useAuth();
  const { query } = useProfile();
  const location = useLocation();

  if (status === 'loading') return null;

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // status === 'authenticated' beyond this point.
  switch (query.status) {
    case 'loading':
    case 'anonymous':
      // 'anonymous' here would mean useProfile saw a transient gap between
      // the auth state changing and the profile fetch starting. Render
      // nothing rather than flash a wrong UI.
      return null;
    case 'error':
      // Profile fetch failed — surface a minimal message rather than render
      // an inconsistent app. Real error UI lives in the layout later.
      return (
        <div style={{ padding: 'var(--s-7)' }}>
          <p>не получилось загрузить профиль: {query.error}</p>
        </div>
      );
    case 'ready': {
      if (!query.profile.onboarded_at && !allowPreOnboarding) {
        return <Navigate to="/onboarding" replace />;
      }
      return <>{children}</>;
    }
  }
}
