/**
 * Typed Supabase client. Singleton — import `supabase` anywhere and you get
 * the same instance, with autocomplete on tables/columns thanks to the
 * generated `Database` type.
 *
 * Env vars come from `app/.env.local` (gitignored) for dev. In production
 * they'll be injected by the host (Vercel/Fly/VPS).
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and fill in values from `supabase status`.',
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
