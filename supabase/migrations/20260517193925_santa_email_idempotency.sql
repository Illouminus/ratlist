-- supabase/migrations/20260517193925_santa_email_idempotency.sql
--
-- Idempotency guards for the bulk-email Edge Functions
-- `send-santa-draw` and `send-santa-start`. Set on first successful
-- fan-out, cleared on partial failure so a retry can re-fire. A
-- non-null value means "do not re-send" — the functions use an
-- atomic conditional UPDATE as their claim mechanism.

alter table public.santa_events
  add column draw_emailed_at timestamptz,
  add column start_emailed_at timestamptz;

comment on column public.santa_events.draw_emailed_at is
  'Set by send-santa-draw on successful mass-mail. NULL = not yet sent. Used as an atomic single-claim flag.';
comment on column public.santa_events.start_emailed_at is
  'Set by send-santa-start on successful mass-mail. NULL = not yet sent. Used as an atomic single-claim flag.';
