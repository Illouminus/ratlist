/**
 * Re-exports of table row / insert / update types from the auto-generated
 * `Database` type. Use these throughout the app instead of indexing
 * `Database['public']['Tables']['…']` everywhere.
 *
 * If you add a new table, regenerate types and add the row aliases here.
 *
 *     supabase gen types typescript --local --schema public \
 *         > app/src/types/database.ts
 */
import type { Database } from '../types/database';

export type Tables = Database['public']['Tables'];

export type Profile       = Tables['profiles']['Row'];
export type ProfileInsert = Tables['profiles']['Insert'];
export type ProfileUpdate = Tables['profiles']['Update'];

export type Group        = Tables['groups']['Row'];
export type GroupMember  = Tables['group_members']['Row'];
export type Invite       = Tables['invites']['Row'];

export type Item        = Tables['items']['Row'];
export type ItemInsert  = Tables['items']['Insert'];
export type ItemUpdate  = Tables['items']['Update'];
export type ItemGroup   = Tables['item_groups']['Row'];
export type ItemPhoto   = Tables['item_photos']['Row'];

export type Claim        = Tables['claims']['Row'];
export type ClaimInsert  = Tables['claims']['Insert'];

/**
 * Allowed values for `items.occasion`. Mirrors the CHECK constraint in the
 * init migration — keep in sync if it ever changes.
 */
export const OCCASIONS = ['anytime', 'birthday', 'holidays', 'treat'] as const;
export type Occasion = (typeof OCCASIONS)[number];

/**
 * Allowed values for `items.status`. Mirrors the CHECK constraint.
 */
export const ITEM_STATUSES = ['active', 'received', 'archived'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
