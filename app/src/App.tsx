/**
 * App root — composes the global providers (auth, i18n is wired in main.tsx)
 * around the router. Anything that needs to be available everywhere should
 * be added here.
 */
import { AuthProvider } from './auth/AuthProvider';
import { AppRouter } from './Router';
import { RatDefs } from './components/rats';
import { ToastProvider } from './components/Toast';

export default function App() {
  return (
    <AuthProvider>
      {/* Defines the shared `#ratWobble` SVG filter every rat illustration
          references. Mount once near the root so it's always available. */}
      <RatDefs />
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </AuthProvider>
  );
}
