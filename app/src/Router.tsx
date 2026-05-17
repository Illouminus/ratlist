/**
 * App routes. Keeps route declarations in one place so adding/removing
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
 * The `/` path: lives INSIDE `AuthedShell` so navigation between `/` and
 * other authed routes doesn't remount the chrome. AuthedShell renders
 * `<LandingScreen />` directly (bypassing the AppLayout/Outlet) for
 * anonymous or still-loading auth, which makes the home page renderable
 * by the prerender pipeline without any auth context.
 *
 * Code-splitting: only the rare screens are lazy-loaded. The four routes
 * that live in Sidebar / BottomTabBar (MyList, Groups, People, Santa)
 * are eager imports — users tab between them constantly and the
 * Suspense fallback was the other half of the flash. Lazy stays for
 * detail and full-screen form routes where one extra round-trip on
 * cold-nav is fine.
 *
 * Router itself: not exported here. Each entry (browser vs prerender)
 * wraps `<AppRoutes />` in its own router implementation —
 * `BrowserRouter` for `entry-client.tsx`, `StaticRouter` for
 * `prerender.tsx`.
 */
import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/useAuth';
import { useProfile } from './auth/useProfile';
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
// Eager: the two legal pages. Lazy-loading them produced an empty
// `<Suspense>` boundary in the prerendered HTML (renderToString doesn't
// await `React.lazy` promises), defeating the whole point of
// prerendering for SEO. The 20 KB / 6 KB-gzip cost is worth it.
import { LegalScreen } from './screens/legal/LegalScreen';

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
const SettingsScreen = lazyNamed(
  () => import('./screens/settings/SettingsScreen'),
  'SettingsScreen',
);

/**
 * Single shared frame for every authed-and-onboarded screen.
 *
 * Renders `<LandingScreen />` directly when the visitor is anonymous or
 * still-loading AND they're on `/`. That keeps the home path SSR-safe
 * (the prerender pipeline can render the landing without any client-only
 * auth state) and avoids a hydration mismatch — both server and client
 * paint the landing first, then the client swaps to the authed app
 * after the auth context resolves.
 *
 * For any other path under this shell, behaves like the old `RequireAuth`:
 * redirects to `/login` when anonymous, renders nothing while loading,
 * and goes to `/onboarding` if the profile is unfinished.
 */
function AuthedShell() {
  const { status } = useAuth();
  const location = useLocation();

  // SSR-stable first paint: render Landing for the home path whenever
  // we're not (yet) authenticated. Matches what the prerender writes to
  // dist/index.html so hydration is mismatch-free.
  if (status !== 'authenticated' && location.pathname === '/') {
    return <LandingScreen />;
  }

  if (status === 'loading') return null;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <AuthedShellContent />;
}

/**
 * Inner shell — only mounts when the user is confirmed authenticated.
 * Keeping `useProfile` out of `AuthedShell` means an anonymous visitor
 * never triggers a profile fetch.
 */
function AuthedShellContent() {
  const { query } = useProfile();

  switch (query.status) {
    case 'loading':
    case 'anonymous':
      // 'anonymous' here would mean useProfile saw a transient gap between
      // auth state changing and the profile fetch starting. Render nothing
      // rather than flash a wrong UI.
      return null;
    case 'error':
      return (
        <div style={{ padding: 'var(--s-7)' }}>
          <p>не получилось загрузить профиль: {query.error}</p>
        </div>
      );
    case 'ready':
      if (!query.profile.onboarded_at) {
        return <Navigate to="/onboarding" replace />;
      }
      return (
        <AppLayout>
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </AppLayout>
      );
  }
}

/**
 * Routes definition. Wrap in a Router from the entry point — this
 * component is router-agnostic so it works in both `<BrowserRouter>`
 * (client) and `<StaticRouter>` (prerender).
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* Public — no auth required */}
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/auth/callback" element={<AuthCallbackScreen />} />
      <Route path="/invite/:token" element={<InviteAcceptScreen />} />
      <Route path="/share/:token" element={<PublicListScreen />} />
      <Route path="/legal/privacy" element={<LegalScreen doc="privacy" />} />
      <Route path="/legal/terms" element={<LegalScreen doc="terms" />} />

      {/* Authed but pre-onboarding — no app chrome */}
      <Route
        path="/onboarding"
        element={
          <RequireAuth allowPreOnboarding>
            <OnboardingScreen />
          </RequireAuth>
        }
      />

      {/* Authed + onboarded — shared chrome via AuthedShell. The `/`
          path falls through to a Landing render for anonymous visitors,
          see AuthedShell. */}
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
        <Route path="/settings" element={<SettingsScreen />} />
      </Route>

      {/* Unknown path → home (and let AuthedShell decide where they go). */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
