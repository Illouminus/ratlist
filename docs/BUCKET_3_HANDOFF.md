# Bucket 3 — Realtime debounce + polish (handoff)

Date: 2026-05-18
Status: NOT STARTED. Brainstorm + spec + plan + implementation all pending.

## Context

Third and final bucket from the 2026-05-17 full-project audit. Buckets 1 (edge security hardening) and 2 (test foundation) are shipped — see `docs/superpowers/specs/2026-05-17-edge-security-hardening-design.md` and `docs/superpowers/specs/2026-05-18-test-foundation-design.md`.

The audit's tier-3 findings (low impact, easy wins):

### 1. Events realtime spam (MED severity from audit)

`app/src/events/useEvents.ts` (and likely `useEvent.ts`) subscribes to three tables — `events`, `event_circles`, `event_items` — all with `event: '*'`. Any change to any of these triggers a full `refresh()` that re-runs the `get_my_events()` RPC. At ~100+ events per user this becomes wasteful.

Two fixes worth considering:
- **Server-side filter**: scope the subscriptions to the user's own rows via `filter: 'honoree_id=eq.<uid>'` (or analogous), so they only fire for events the user can see.
- **Client-side debounce**: collect change events for 200-500ms before triggering `refresh()`. Cheap to add.

Probably do both. The audit estimate was ~1h.

### 2. Skip-link to main content (a11y, LOW)

The audit noted no skip-link exists. Standard pattern: a visually-hidden `<a href="#main">skip to main content</a>` at the top of the document that becomes visible on focus. Pair with `id="main"` on the primary `<main>` landmark. Looks like ~15 minutes.

### 3. Prerender chunk in client bundle (LOW)

`vite.config.ts` uses `vite-prerender-plugin`. Per the audit (and a comment in `vite.config.ts`), a `prerender-<hash>.js` chunk (~10 KB gzip) ends up in the client bundle even though clients don't need it. The fix landing in Rolldown / Vite 9. Worth checking the current Vite version — if it's already Vite 9 with Rolldown, may already be resolved. Otherwise note and defer.

## Open operational items (not bucket 3 work, just don't lose them)

- **2026-05-24**: remove the temporary `console.warn('[fetch-url-meta] blocked', ...)` in `supabase/functions/fetch-url-meta/index.ts:369`. Added 2026-05-17 to monitor false-positive rate during edge-security rollout.
- **Branch protection** in GitHub UI: settings/branches → require `lint-build`, `frontend-tests`, `integration-tests`, `Vercel` for merge to main. (May already be done.)
- **Vite 9 / Rolldown lands**: drop the ~10 KB-gzip `prerender-<hash>.js` chunk from the client bundle. The plugin's `manualChunks` hook should start being honored for entry inputs once Rolldown handles entry chunk merging; verify the chunk is gone after upgrade. Comment in `app/vite.config.ts` documents the current state.

## How to start the fresh session

Tell the next session: "пора браться за bucket 3 из аудита от 2026-05-17". Then:

1. They'll read `CLAUDE.md` (project conventions + state).
2. Memory at `~/.claude/projects/-Users-edouard-dev-wishlist/memory/MEMORY.md` auto-loads with user-preference context.
3. Point them at this file for the bucket 3 scope.
4. They invoke `/superpowers:brainstorming` and go through spec → plan → execute.

## Why a small bucket but still a full brainstorm cycle

Even tiny work goes through brainstorm → spec → plan because (a) it surfaces the strategic questions (e.g. server-side filter vs client debounce), (b) the user reviews and gates each phase, and (c) implementation happens via subagent dispatch with isolated context. The pattern produces small, atomic, reviewable commits.

If the next session feels brainstorm is overkill for a 1-2h work, they should still write a short spec (the brainstorming skill explicitly says "every project, even simple ones, gets a design doc").
