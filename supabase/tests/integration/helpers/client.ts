// supabase/tests/integration/helpers/client.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY } from './env.ts';
import { mintUserJwt } from './mintJwt.ts';

export async function clientFor(userId: string): Promise<SupabaseClient> {
  const jwt = await mintUserJwt(userId);
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
