# Крысиные желания / Rat List

A private wishlist + Secret Santa app for our friend group. Built on top of a
hand-drawn editorial design from Claude Design (see `wish-list-app/` locally —
gitignored).

## Stack

- **Frontend:** Vite + React + TypeScript, vanilla CSS with design tokens
- **Backend:** Supabase (Auth, Postgres + RLS, Storage, Edge Functions, Realtime)
- **Hosting:** TBD — own VPS or Vercel/Fly

## Layout

```
/
├── app/            # Vite + React + TS — the web app
├── supabase/       # migrations, config, edge functions
├── ARCHITECTURE.md # data model, RLS policies, Secret Santa flow
└── README.md
```

## Local dev

```sh
# 1. Start Supabase locally (runs on shifted ports 544xx so it can coexist
#    with another Supabase instance on default 543xx ports)
supabase start

# 2. Run the web app
cd app && npm run dev
```

Supabase Studio: http://localhost:54423
API:             http://localhost:54421
DB:              postgresql://postgres:postgres@localhost:54422/postgres
Mailpit:         http://localhost:54424
