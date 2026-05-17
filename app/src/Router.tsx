/**
 * App router. Keeps route declarations in one place so adding/removing
 * routes is a quick scan rather than a hunt.
 *
 * Three layers of chrome:
 *   1. public         no auth required — login / auth callback / invite
 *   2. pre-onboarding auth required, but no app chrome — onboarding
 *   3. full           auth + onboarding done, wrapped in <AppLayout>
 *                     (sidebar on desktop, bottom tab bar on mobile)
 *
 * Shared layout: every authed-and-onboarded route renders under a single
 * `<AuthedShell>` parent route. The shell mounts <AppLayout> once and
 * uses <Outlet/> to swap the inner screen. Without that nesting, every
 * navigation re-mounted Sidebar / MobileTopBar / BottomTabBar, producing
 * a visible flash on every link click.
 *
 * Code-splitting: only the rare screens are lazy-loaded. The four routes
 * that live in Sidebar / BottomTabBar (MyList, Groups, People, Santa)
 * are eager imports — users tab between them constantly and the
 * Suspense fallback was the other half of the flash. Lazy stays for
 * detail and full-screen form routes where one extra round-trip on
 * cold-nav is fine.
 */
import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/useAuth';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { LoginScreen } from './screens/LoginScreen';
import { AuthCallbackScreen } from './screens/AuthCallbackScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { InviteAcceptScreen } from './screens/groups/InviteAcceptScreen';
import { PublicListScreen } from './screens/PublicListScreen';
import { LandingScreen } from './screens/LandingScreen';

// Eager: the four screens that live in Sidebar / BottomTabBar. Users
// flip between them constantly so a Suspense flash hurts every tab.
import { MyListScreen } from './screens/items/MyListScreen';
import { GroupsScreen } from './screens/groups/GroupsScreen';
import { PeopleScreen } from './screens/people/PeopleScreen';
import { SantaListScreen } from './screens/santa/SantaListScreen';

/**
 * Helper to lazy-load a module whose export is named rather than
 * default. React.lazy expects `{ default: Component }`; our screens
 * are named exports so each loader re-wraps the module shape.
 */
function lazyNamed<T extends ComponentType<object>>(
  loader: () => Promise<Record<string, ComponentType<object>>>,
  exportName: string,
) {
  return lazy(async () => {
    const m = await loader();
    return { default: m[exportName] as T };
  });
}

// Lazy: rare or deep-link routes. One extra round-trip on cold nav is
// acceptable here; the saved bundle size on first paint is worth more.
const ItemDetailScreen = lazyNamed(
  () => import('./screens/items/ItemDetailScreen'),
  'ItemDetailScreen',
);
const AddItemScreen = lazyNamed(() => import('./screens/items/AddItemScreen'), 'AddItemScreen');
const EditItemScreen = lazyNamed(
  () => import('./screens/items/EditItemScreen'),
  'EditItemScreen',
);
const FriendListScreen = lazyNamed(
  () => import('./screens/people/FriendListScreen'),
  'FriendListScreen',
);
const SantaEventScreen = lazyNamed(
  () => import('./screens/santa/SantaEventScreen'),
  'SantaEventScreen',
);

/**
 * Single shared frame for every authed-and-onboarded screen. Mounts the
 * AppLayout once and renders the active child via <Outlet/>. Suspense
 * fallback is null on purpose — for the few remaining lazy routes a
 * blank flash is less jarring than a visible "…" placeholder, and the
 * common routes don't suspend at all.
 */
function AuthedShell() {
  return (
    <RequireAuth>
      <AppLayout>
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </AppLayout>
    </RequireAuth>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

/**
 * Routes split by auth status so `/` can serve different content to
 * anonymous (landing) vs authed (MyList) without redirecting. Both keep
 * the same URL — deep-link sharing and bookmarks "just work".
 *
 * For authed users the entire authed surface lives under AuthedShell so
 * the chrome doesn't remount on every navigation.
 */
function AppRoutes() {
  const { status } = useAuth();
  if (status === 'loading') return null;

  return (
    <Routes>
      {/* Public — no auth required */}
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/auth/callback" element={<AuthCallbackScreen />} />
      <Route path="/invite/:token" element={<InviteAcceptScreen />} />
      <Route path="/share/:token" element={<PublicListScreen />} />

      {/* Authed but pre-onboarding — no app chrome */}
      <Route
        path="/onboarding"
        element={
          <RequireAuth allowPreOnboarding>
            <OnboardingScreen />
          </RequireAuth>
        }
      />

      {status === 'anonymous' ? (
        <Route path="/" element={<LandingScreen />} />
      ) : (
        <Route element={<AuthedShell />}>
          <Route path="/" element={<MyListScreen />} />
          <Route path="/add" element={<AddItemScreen />} />
          <Route path="/i/:itemId" element={<ItemDetailScreen />} />
          <Route path="/i/:itemId/edit" element={<EditItemScreen />} />
          <Route path="/groups" element={<GroupsScreen />} />
          <Route path="/people" element={<PeopleScreen />} />
          <Route path="/p/:userId" element={<FriendListScreen />} />
          <Route path="/santa" element={<SantaListScreen />} />
          <Route path="/santa/:eventId" element={<SantaEventScreen />} />
        </Route>
      )}

      {/* Unknown path → home (and let RequireAuth decide where they go). */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
