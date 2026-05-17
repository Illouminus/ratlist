/**
 * Upload a profile avatar to Supabase Storage and return its public URL.
 *
 * Same layout convention as `uploadItemImage`: every user owns a folder
 * under the bucket named after their auth UUID, and our storage RLS
 * only permits writes where the first folder segment matches
 * `auth.uid()`. A new random filename per upload means switching
 * avatars never invalidates a cached URL elsewhere.
 *
 * The `avatars` bucket is configured public with a 2 MB limit and the
 * usual png/jpeg/webp allow-list — see migration 20260516120000_init.sql.
 */
import { supabase } from '../lib/supabase';

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Mirrors the bucket's file_size_limit so we fail fast client-side. */
const MAX_SIZE = 2 * 1024 * 1024;

export type UploadResult = { url: string; path: string } | { error: string };

export async function uploadAvatar(file: File, userId: string): Promise<UploadResult> {
  const ext = EXT_BY_MIME[file.type];
  if (!ext) return { error: 'unsupported_type' };
  if (file.size > MAX_SIZE) return { error: 'file_too_large' };

  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return { url: data.publicUrl, path };
}
