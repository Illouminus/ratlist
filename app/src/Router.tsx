/**
 * App router. Keeps route declarations in one place so adding/removing
 * routes is a quick scan rather than a hunt.
 *
 * Auth-gating is centralised on `<RequireAuth>`. The onboarding route
 * passes `allowPreOnboarding` so the guard doesn't redirect back to itself.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { LoginScreen } from './screens/LoginScreen';
import { AuthCallbackScreen } from './screens/AuthCallbackScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { HomeScreen } from './screens/HomeScreen';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/auth/callback" element={<AuthCallbackScreen />} />

        <Route
          path="/onboarding"
          element={
            <RequireAuth allowPreOnboarding>
              <OnboardingScreen />
            </RequireAuth>
          }
        />

        <Route
          path="/"
          element={
            <RequireAuth>
              <HomeScreen />
            </RequireAuth>
          }
        />

        {/* Unknown path → home (and let RequireAuth decide where they go). */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
