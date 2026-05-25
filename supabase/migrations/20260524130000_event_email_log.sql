-- ============================================================================
-- event_email_log — idempotency log for transactional emails on events.
-- ============================================================================
-- One row per (event_id, recipient_id, email_type). The UNIQUE constraint is
-- the dedup primitive: the Edge Function inserts FIRST (claims the slot),
-- then sends; if the INSERT returns 23505 the recipient already got this
-- email type and the send is skipped. sent_at is updated after a confirmed
-- delivery; null means "attempted but no confirmation" — useful for triage.
--
-- Differs from santa_events.{draw,start}_emailed_at: that flag is per-event
-- (single-claim, all-or-nothing), this table is per-recipient (each invitee
-- has independent retry state). Events fan out to N recipients individually.
--
-- No RLS policies: service-role inserts only; end-users never read.
-- ============================================================================

create table public.event_email_log (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  recipient_id  uuid not null references auth.users(id) on delete cascade,
  email_type    text not null check (email_type in ('invite')),
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (event_id, recipient_id, email_type)
);

create index event_email_log_event_idx on public.event_email_log(event_id);

alter table public.event_email_log enable row level security;
-- No policies — default-deny. Service-role bypasses RLS for inserts/updates.
