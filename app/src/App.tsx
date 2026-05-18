/**
 * App root — composes the global providers (auth, toast, confirm) around
 * whatever routing tree the caller passes in as `children`.
 *
 * The Router (BrowserRouter on the client, StaticRouter on the server) is
 * lifted out so the same App component can be hydrated on the browser and
 * rendered to a string at build time by the prerender pipeline. See
 * `entry-client.tsx` and `prerender.tsx` for the two callers.
 *
 * I18nProvider is also lifted out so each entry can pre-set a language
 * appropriate for its environment (server defaults to `en` because there's
 * no localStorage to read from).
 */
import type { ReactNode } from 'react';
import { AuthProvider } from './auth/AuthProvider';
import { RatDefs } from './components/rats';
import { SkipLink } from './components/SkipLink';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmDialog';

export default function App({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      {/* Defines the shared `#ratWobble` SVG filter every rat illustration
          references. Mount once near the root so it's always available. */}
      <RatDefs />
      <SkipLink />
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
