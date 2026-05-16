/**
 * App router. Keeps route declarations in one place so adding/removing
 * routes is a quick scan rather than a hunt.
 *
 * Auth-gating is centralised on `<RequireAuth>`:
 *   - `/login`, `/auth/callback`, `/invite/:token` are public (the last
 *     handles its own anonymous-visitor message).
 *   - `/onboarding` requires auth but allows pre-onboarding users.
 *   - everything else requires auth + completed onboarding.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { LoginScreen } from './screens/LoginScreen';
import { AuthCallbackScreen } from './screens/AuthCallbackScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { MyListScreen } from './screens/items/MyListScreen';
import { GroupsScreen } from './screens/groups/GroupsScreen';
import { InviteAcceptScreen } from './screens/groups/InviteAcceptScreen';
import { PeopleScreen } from './screens/people/PeopleScreen';
import { FriendListScreen } from './screens/people/FriendListScreen';
import { SantaListScreen } from './screens/santa/SantaListScreen';
import { SantaEventScreen } from './screens/santa/SantaEventScreen';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/auth/callback" element={<AuthCallbackScreen />} />
        <Route path="/invite/:token" element={<InviteAcceptScreen />} />

        {/* Authenticated but pre-onboarding */}
        <Route
          path="/onboarding"
          element={
            <RequireAuth allowPreOnboarding>
              <OnboardingScreen />
            </RequireAuth>
          }
        />

        {/* Authenticated + onboarded */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <MyListScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/groups"
          element={
            <RequireAuth>
              <GroupsScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/people"
          element={
            <RequireAuth>
              <PeopleScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/p/:userId"
          element={
            <RequireAuth>
              <FriendListScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/santa"
          element={
            <RequireAuth>
              <SantaListScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/santa/:eventId"
          element={
            <RequireAuth>
              <SantaEventScreen />
            </RequireAuth>
          }
        />

        {/* Unknown path → home (and let RequireAuth decide where they go). */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
