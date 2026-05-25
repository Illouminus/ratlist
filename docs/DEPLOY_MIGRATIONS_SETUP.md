# Migrations auto-deploy — one-time setup

The `Deploy migrations to prod` workflow ([`.github/workflows/deploy-migrations.yml`](../.github/workflows/deploy-migrations.yml))
runs on every push to `main` that touches `supabase/migrations/`. It
links the Supabase CLI to the prod project and runs `supabase db push`
so the schema is applied **before** the next user request hits the
frontend.

Required to set up once (Repo → Settings → Secrets and variables → Actions):

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens → "Generate new token". Scope: full account (the CLI needs to read project metadata + push migrations). Treat like a password — anyone with this token can manage every project in your Supabase account. |
| `SUPABASE_DB_PASSWORD` | https://supabase.com/dashboard/project/fiuheufmawxkgbqddwwu/settings/database → "Database password". This is the postgres user's password — used by `supabase db push` to open a session against the prod DB. If you don't remember it, click "Reset database password" and the new value replaces both this secret AND any direct psql credentials anywhere else. |
| `SUPABASE_PROJECT_REF` *(optional)* | The project ref, currently `fiuheufmawxkgbqddwwu`. The workflow falls back to this hardcoded value if the secret isn't set, but storing it as a secret makes rotation cleaner (rename the prod project later → bump one secret instead of editing the workflow). |

Also create a GitHub environment named `production` (Repo → Settings →
Environments → New environment → `production`). The workflow targets
this environment so the run shows up in the deploy audit trail. You
can later attach protection rules (e.g. required reviewer for
destructive schema changes) without touching the workflow.

## Verifying the setup

After adding the secrets, trigger a dry run:

1. **Actions tab → Deploy migrations to prod → Run workflow → main**
2. Watch the three step outputs:
   - `Link to prod project` — should print `Linked project ...`
   - `List pending migrations` — should show local == remote for every row
   - `Push migrations` — should print `Remote database is up to date` (since `main` is already in sync)

If linking fails, the access token is wrong. If push fails with a
password prompt, `SUPABASE_DB_PASSWORD` isn't set.

## When does it run automatically?

- Push to `main`
- AND the push touches `supabase/migrations/**.sql` or the workflow
  file itself

Touching the migrations directory means: adding new migration files via
PR merge. The CI on the PR already ran them against a local Supabase
instance, so the only thing left is to repeat that against prod.

## What happens if a push fails on prod?

The workflow surfaces the error in the Actions tab. Most common cases:

- **Constraint violation** — usually means the migration assumes a data
  shape that doesn't hold on prod (e.g. seed data difference). Fix in a
  follow-up migration; the failed one stays in the local history but
  not the remote one, so `db push` retries automatically next merge.

- **Locked table / long-running query** — the CLI waits with a default
  statement timeout. If you really need to apply during quiet hours,
  re-run via `workflow_dispatch` later.

- **Destructive change blocked by data** — e.g. dropping a NOT NULL
  column that has dependent rows. Resolve the data first (separate
  migration that nulls/cleans), then the schema change.

The link-first migration A.1 deleted all `events` rows on prod
(`delete from public.events`) — that was done by hand BEFORE this
workflow existed, with a manual backup taken first. **Future
destructive migrations should not be merged without a recovery plan in
the PR description.** This workflow doesn't gate destructive pushes —
it just runs whatever's in `supabase/migrations/`.

## Why a separate workflow vs. extending `ci.yml`?

- Different trigger: CI runs on every PR; deploy runs only on
  merge-to-main + path filter.
- Different secret surface: CI needs no production credentials; deploy
  needs both. Keeping them separate makes least-privilege easier later
  (CI can stay public-read; deploy can be gated behind environment
  protection rules).
- Different failure mode: CI failing is fine. Deploy failing means prod
  is in a known-broken state — easier to spot in a dedicated workflow
  name in the Actions tab.
