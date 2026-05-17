-- ============================================================================
-- reports — channel for users (and anonymous visitors) to flag abusive
-- content on public surfaces (/share/<token>, /p/:userId, items, groups).
--
-- Moderation workflow for v1 is deliberately low-tech: rows land in this
-- table, and the operator reads / triages them via Supabase Studio (or
-- psql) using the queries documented in docs/MODERATION.md. Once volume
-- justifies it, a thin admin UI can be added without changing the schema.
--
-- Privacy posture:
--   * Anonymous reports are allowed (`reporter_id` is null). The
--     /share/<token> page is reachable without a login, and the report
--     button has to work there or moderation breaks.
--   * Authenticated reporters write their own user id only — the RLS
--     INSERT policy refuses any `reporter_id` other than `auth.uid()`.
--     That stops a logged-in user from forging a report as someone else.
--   * No public SELECT policy. Reporters cannot read other people's
--     reports; only the operator (via service_role) can pull the queue.
--     Reporter-sees-own-reports could come later; for v1 nothing in the
--     UI reads from this table at all.
--
-- target_type / target_id are deliberately untyped (text) so a single
-- table covers every kind of abuse vector. The pair is indexed for the
-- "how many open reports against this user" lookup.
-- ============================================================================

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  -- Nullable: anonymous visitors on /share/<token> have no profile.
  -- ON DELETE SET NULL so deleting a user account preserves the
  -- moderator's audit trail.
  reporter_id  uuid references public.profiles(id) on delete set null,
  -- Discriminator + soft FK. Both columns are text so a share-token
  -- (base64) and a UUID can share the column. Keep the union small —
  -- adding a new type means a new client surface + a new admin query.
  target_type  text not null check (target_type in ('share', 'profile', 'item', 'group')),
  target_id    text not null,
  -- Closed enum so admin queries can group by reason without bucketing
  -- free text. UI maps each option to a localised label.
  reason       text not null check (reason in ('spam', 'nsfw', 'harassment', 'illegal', 'other')),
  -- Optional free-form context from the reporter. Cap is generous but
  -- finite — keeps a bug or a bot from filling the table.
  note         text check (note is null or length(note) between 1 and 1000),
  created_at   timestamptz not null default now(),
  -- Triage state. The operator flips this manually in Studio when
  -- working through the queue.
  status       text not null default 'open'
               check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles(id) on delete set null
);

create index reports_target_idx on public.reports(target_type, target_id);
create index reports_status_idx on public.reports(status, created_at desc);

alter table public.reports enable row level security;

-- Anyone (authed or anon) may file a report. If the caller is logged
-- in we require reporter_id to be either NULL or their own user id —
-- prevents forging "user X reported you" entries.
create policy reports_insert_anyone on public.reports
  for insert with check (
    reporter_id is null or reporter_id = auth.uid()
  );

-- No SELECT/UPDATE/DELETE policies on purpose. Operator reads via
-- service_role (Studio / psql). When a "your reports" history view
-- comes along it'll get its own policy then.

grant insert on public.reports to anon, authenticated;
