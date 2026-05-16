/**
 * App router. Keeps route declarations in one place so adding/removing
 * routes is a quick scan rather than a hunt.
 *
 * Three layers of chrome:
 *   1. public        no auth required — login / auth callback / invite
 *   2. pre-onboarding auth required, but no app chrome — onboarding
 *   3. full          auth + onboarding done, wrapped in <AppLayout>
 *                    (sidebar on desktop, bottom tab bar on mobile)
 */
import { type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { LoginScreen } from './screens/LoginScreen';
import { AuthCallbackScreen } from './screens/AuthCallbackScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { MyListScreen } from './screens/items/MyListScreen';
import { ItemDetailScreen } from './screens/items/ItemDetailScreen';
import { AddItemScreen } from './screens/items/AddItemScreen';
import { EditItemScreen } from './screens/items/EditItemScreen';
import { GroupsScreen } from './screens/groups/GroupsScreen';
import { InviteAcceptScreen } from './screens/groups/InviteAcceptScreen';
import { PeopleScreen } from './screens/people/PeopleScreen';
import { FriendListScreen } from './screens/people/FriendListScreen';
import { SantaListScreen } from './screens/santa/SantaListScreen';
import { SantaEventScreen } from './screens/santa/SantaEventScreen';

/** Wrap a screen in the full auth-required + AppLayout chrome. */
function appRoute(screen: ReactNode): ReactNode {
  return (
    <RequireAuth>
      <AppLayout>{screen}</AppLayout>
    </RequireAuth>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/auth/callback" element={<AuthCallbackScreen />} />
        <Route path="/invite/:token" element={<InviteAcceptScreen />} />

        {/* Authenticated but pre-onboarding (no app chrome) */}
        <Route
          path="/onboarding"
          element={
            <RequireAuth allowPreOnboarding>
              <OnboardingScreen />
            </RequireAuth>
          }
        />

        {/* Authenticated + onboarded (full app chrome) */}
        <Route path="/" element={appRoute(<MyListScreen />)} />
        <Route path="/add" element={appRoute(<AddItemScreen />)} />
        <Route path="/i/:itemId" element={appRoute(<ItemDetailScreen />)} />
        <Route path="/i/:itemId/edit" element={appRoute(<EditItemScreen />)} />
        <Route path="/groups" element={appRoute(<GroupsScreen />)} />
        <Route path="/people" element={appRoute(<PeopleScreen />)} />
        <Route path="/p/:userId" element={appRoute(<FriendListScreen />)} />
        <Route path="/santa" element={appRoute(<SantaListScreen />)} />
        <Route path="/santa/:eventId" element={appRoute(<SantaEventScreen />)} />

        {/* Unknown path → home (and let RequireAuth decide where they go). */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
