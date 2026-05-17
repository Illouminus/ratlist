# Moderation — operator runbook

User-facing flagging lives in `public.reports`. UI triggers are on:

- `/share/<token>` — footer link, **anonymous-friendly** (no sign-in
  required, `reporter_id` is null in those rows)
- `/p/:userId` — bottom link, only shown when the viewer ≠ the
  target user

The reporter picks one of five reasons (`spam`, `nsfw`, `harassment`,
`illegal`, `other`) and optionally adds up to 1000 characters of
context. RLS allows everyone to INSERT; nobody can SELECT through the
client. The operator reads via service-role (Supabase Studio or
psql).

## Daily queue review

Open Supabase Studio → Table Editor → `reports`. Filter
`status = 'open'`, order by `created_at desc`. Or via psql:

```sql
select
  r.id,
  r.created_at,
  r.target_type,
  r.target_id,
  r.reason,
  r.note,
  coalesce(p.display_name, '(anonymous)') as reporter
from public.reports r
left join public.profiles p on p.id = r.reporter_id
where r.status = 'open'
order by r.created_at desc;
```

For each row you'll usually want to look at the reported content
first — most reports are obvious one way or the other.

### Inspect a share-token report

```sql
-- The share token IS the target_id for target_type='share'.
-- Pull the owner + every visible item the way the public page does:
select * from public.get_public_list('<paste target_id here>');
```

### Inspect a profile report

```sql
-- target_id is a UUID. Look at the profile and the user's items.
select id, display_name, handle, avatar_url, onboarded_at, created_at
from public.profiles where id = '<paste target_id>';

select id, title, occasion, status, created_at
from public.items where owner_id = '<paste target_id>'
order by created_at desc
limit 50;
```

## Closing out a report

Four statuses, set manually:

| `status`    | When                                                       |
| ----------- | ---------------------------------------------------------- |
| `open`      | freshly filed, default                                     |
| `reviewed`  | looked at, no action yet (e.g. waiting on a follow-up)    |
| `actioned`  | took action (deleted content, warned user, banned user)   |
| `dismissed` | not abusive — false positive or harmless                  |

```sql
update public.reports
set status = 'actioned', resolved_at = now(), resolved_by = '<your-user-id>'
where id = '<report-id>';
```

## Actions

Soft tools available right now:

```sql
-- Soft-disable an account. Their share-token (if any) starts
-- returning `invite_not_found` to crawlers and viewers — kills the
-- public-facing abuse surface without destroying their data. The
-- user can still log in and see their own content; nothing is
-- removed. To re-enable just set disabled_at back to null.
update public.profiles set disabled_at = now() where id = '<user-id>';
update public.profiles set disabled_at = null  where id = '<user-id>'; -- undo

-- Disable share specifically (keeps the rest of the account active):
update public.profiles set share_token = null where id = '<user-id>';

-- Delete a single item:
delete from public.items where id = '<item-id>';
```

Group-member visibility is intentionally NOT yet filtered by
`disabled_at` — friends inside the same circle keep seeing each
other. The exposure surface there is trusted-only by design. If a
disabled user is also a nuisance inside a circle, the circle's
admin can remove them through the existing UI.

For account bans, use Supabase Studio → Authentication → Users →
find user → "Ban user" sets `auth.users.banned_until`. Doesn't
touch the public schema, so their content stays in the DB until
you delete it explicitly. Combine with `disabled_at` if you want
"can't log in AND public surface is dead".

## Looking for trends

A few queries that surface common abuse patterns:

```sql
-- Targets with multiple open reports — escalation candidates:
select target_type, target_id, count(*) as open_reports
from public.reports
where status = 'open'
group by target_type, target_id
having count(*) >= 2
order by open_reports desc;

-- Reporters filing a lot (could be the abuse pattern itself):
select reporter_id, count(*) as filed, count(*) filter (where status = 'dismissed') as bogus
from public.reports
where reporter_id is not null
group by reporter_id
having count(*) >= 5
order by filed desc;

-- Reason mix this week:
select reason, count(*)
from public.reports
where created_at > now() - interval '7 days'
group by reason
order by count(*) desc;
```

## What's deliberately *not* here yet

- **Rate limiting** — anonymous reports are unauthenticated and
  could be spammed. If we see abuse in the queue, drop a Postgres
  trigger that throttles inserts per IP / per fingerprint.
- **Notifier** — no email or Telegram ping when a new report
  arrives. Operator pulls the queue on a schedule. Add an Edge
  Function that fans out to a webhook the day this becomes a load
  problem.
- **Admin UI** — every operation above is a SQL paste. A thin
  in-app `/admin` screen could come later, gated on a boolean
  `profiles.is_operator` column. For v1 the SQL surface is fine.
