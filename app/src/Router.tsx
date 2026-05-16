/**
 * App router. Keeps route declarations in one place so adding/removing
 * routes is a quick scan rather than a hunt.
 *
 * Three layers of chrome:
 *   1. public        no auth required — login / auth callback / invite
 *   2. pre-onboarding auth required, but no app chrome — onboarding
 *   3. full          auth + onboarding done, wrapped in <AppLayout>
 *                    (sidebar on desktop, bottom tab bar on mobile)
 *
 * Code-splitting: every authenticated route is loaded via React.lazy
 * so the initial JS bundle stays small. The pre-auth screens
 * (LoginScreen, AuthCallback, OnboardingScreen, InviteAcceptScreen)
 * stay eager because they're tiny and on the critical path — the user
 * lands on `/login` first and we don't want a spinner there.
 */
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/useAuth';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { LoginScreen } from './screens/LoginScreen';
import { AuthCallbackScreen } from './screens/AuthCallbackScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { InviteAcceptScreen } from './screens/groups/InviteAcceptScreen';
import { PublicListScreen } from './screens/PublicListScreen';
import { LandingScreen } from './screens/LandingScreen';

/**
 * Helper to lazy-load a module whose export is named rather than
 * default. React.lazy expects `{ default: Component }`; our screens
 * are named exports so each loader re-wraps the module shape.
 *
 * Inlined here rather than imported from a util — it's a one-liner
 * and used only at the route declaration site.
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

// One lazy import per route — Vite/rolldown creates a separate chunk
// per `import()` call, so this directly controls the chunk graph.
const MyListScreen = lazyNamed(() => import('./screens/items/MyListScreen'), 'MyListScreen');
const ItemDetailScreen = lazyNamed(
  () => import('./screens/items/ItemDetailScreen'),
  'ItemDetailScreen',
);
const AddItemScreen = lazyNamed(() => import('./screens/items/AddItemScreen'), 'AddItemScreen');
const EditItemScreen = lazyNamed(
  () => import('./screens/items/EditItemScreen'),
  'EditItemScreen',
);
const GroupsScreen = lazyNamed(() => import('./screens/groups/GroupsScreen'), 'GroupsScreen');
const PeopleScreen = lazyNamed(() => import('./screens/people/PeopleScreen'), 'PeopleScreen');
const FriendListScreen = lazyNamed(
  () => import('./screens/people/FriendListScreen'),
  'FriendListScreen',
);
const SantaListScreen = lazyNamed(
  () => import('./screens/santa/SantaListScreen'),
  'SantaListScreen',
);
const SantaEventScreen = lazyNamed(
  () => import('./screens/santa/SantaEventScreen'),
  'SantaEventScreen',
);

/** Render a small "…" while a lazy chunk is loading. Sits inside the
 *  AppLayout so the surrounding chrome doesn't blink. */
function ChunkFallback() {
  return (
    <div
      className="mono-meta"
      style={{ color: 'var(--ink-3)', padding: 'var(--page-pad-y) var(--page-pad-x)' }}
    >
      …
    </div>
  );
}

/** Wrap a screen in the full auth-required + AppLayout chrome.
 *  Suspense lives inside the layout so the sidebar/bottom-bar are
 *  visible during the chunk fetch. */
function appRoute(screen: ReactNode): ReactNode {
  return (
    <RequireAuth>
      <AppLayout>
        <Suspense fallback={<ChunkFallback />}>{screen}</Suspense>
      </AppLayout>
    </RequireAuth>
  );
}

/** Root path is shared between anonymous and authenticated users:
 *  anons get the marketing landing page, authed users land straight on
 *  their list. We deliberately don't redirect — the URL stays `/` for
 *  both so deep-link sharing and bookmarks "just work". */
function HomeRoute() {
  const { status } = useAuth();
  if (status === 'loading') return null;
  if (status === 'anonymous') return <LandingScreen />;
  return appRoute(<MyListScreen />);
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/auth/callback" element={<AuthCallbackScreen />} />
        <Route path="/invite/:token" element={<InviteAcceptScreen />} />
        <Route path="/share/:token" element={<PublicListScreen />} />

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
        <Route path="/" element={<HomeRoute />} />
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
