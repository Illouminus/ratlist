/**
 * Client wrapper around the `fetch-url-meta` Edge Function.
 *
 * The function lives in `supabase/functions/fetch-url-meta` and is
 * automatically deployed alongside the rest of the Supabase project. In
 * dev we hit the local endpoint exposed by `supabase functions serve`.
 */
import { supabase } from '../lib/supabase';

export interface UrlMetadata {
  title?: string;
  image_url?: string;
  site_name?: string;
  price_text?: string;
  description?: string;
}

export type FetchUrlMetaResult =
  | { kind: 'ok'; data: UrlMetadata }
  | { kind: 'error'; code: string };

/**
 * POSTs to the function and shapes the response into a discriminated
 * union. Network failures and HTTP errors are mapped to short `code`
 * strings that the UI can localise.
 */
export async function fetchUrlMeta(url: string): Promise<FetchUrlMetaResult> {
  const { data, error } = await supabase.functions.invoke<UrlMetadata | { error: string }>(
    'fetch-url-meta',
    { body: { url } },
  );

  if (error) {
    return { kind: 'error', code: error.message || 'invoke_failed' };
  }
  if (!data) {
    return { kind: 'error', code: 'no_data' };
  }
  if ('error' in data && typeof data.error === 'string') {
    return { kind: 'error', code: data.error };
  }
  return { kind: 'ok', data: data as UrlMetadata };
}
