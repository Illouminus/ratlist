/**
 * Upload an item cover image to Supabase Storage and return its public URL.
 *
 * Storage layout: every user gets a folder under the `items` bucket named
 * after their auth UUID, and our storage RLS only allows writes where the
 * first folder segment matches `auth.uid()`. We generate a random
 * filename per upload so the user can replace a cover without churning
 * URLs in other places (e.g. if we ever cache them).
 *
 * The `items` bucket is configured as public, so the returned URL works
 * without a signed link. Acceptable for v0.1 — image URLs are unguessable
 * UUIDs, the contents are not particularly sensitive (just product
 * photos), and bypassing presigning keeps the frontend simpler.
 */
import { supabase } from '../lib/supabase';

/** Mime → extension map. Limit to what our Storage policy accepts. */
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const MAX_SIZE = 8 * 1024 * 1024; // mirrors the bucket's file_size_limit

export type UploadResult = { url: string; path: string } | { error: string };

/**
 * Upload a single image file. Returns a public URL + the storage path
 * (the latter is useful if we ever want to delete the old file when a
 * user replaces a cover).
 */
export async function uploadItemImage(file: File, userId: string): Promise<UploadResult> {
  const ext = EXT_BY_MIME[file.type];
  if (!ext) return { error: 'unsupported_type' };
  if (file.size > MAX_SIZE) return { error: 'file_too_large' };

  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from('items').upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from('items').getPublicUrl(path);
  return { url: data.publicUrl, path };
}
