/**
 * App root — composes the global providers (auth, i18n is wired in main.tsx)
 * around the router. Anything that needs to be available everywhere should
 * be added here.
 */
import { AuthProvider } from './auth/AuthProvider';
import { AppRouter } from './Router';

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
