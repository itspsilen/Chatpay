# Deploying ChatPay to Vercel

ChatPay runs as a static Vite front end plus Node.js serverless functions under `api/`.
No long-running server is needed.

---

## Architecture

| Layer | Where it runs |
|---|---|
| React + Vite front end | Vercel CDN (static) |
| `/api/chat` (Gemini) | Vercel serverless function, max 60 s |
| `/api/rpc/*` (Arc RPC) | Vercel serverless functions |
| `/api/cron/schedules` | Vercel cron, every 5 minutes |
| Schedules + messages | Supabase Postgres (optional) |
| Private key (testnet) | Browser `localStorage` — never sent to server |

---

## Step 1 — Push to GitHub

```bash
git init          # if not already a repo
git add .
git commit -m "initial commit"
gh repo create chatpay --public --source=. --push
# or push to an existing repo
```

---

## Step 2 — Import into Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and click **Import Git Repository**.
2. Select your `chatpay` repository.
3. Vercel auto-detects `vercel.json` — no framework override needed.
4. Leave **Root Directory** blank (the project root is `/`).
5. Click **Deploy** — the first build will fail if env vars are missing; that is expected.

---

## Step 3 — Set environment variables

In the Vercel dashboard → **Settings → Environment Variables**, add:

| Variable | Value | Exposed to browser? |
|---|---|---|
| `GEMINI_API_KEY` | Your Gemini key | No |
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | Yes (public) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | Yes (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key | **No** — server only |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID | Yes (public) |
| `ARC_RPC_URL` | `https://rpc.testnet.arc.io` | No |
| `ARC_CHAIN_ID` | `5042002` | No |
| `ARC_EXPLORER_URL` | `https://explorer.testnet.arc.io` | No |
| `CRON_SECRET` | Random string (e.g. `openssl rand -hex 32`) | **No** — server only |

Apply to **Production**, **Preview**, and **Development** environments as needed,
then click **Redeploy** to pick up the new values.

> **Security rule:** `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` must never be
> prefixed with `VITE_`. Vercel injects `VITE_*` values into the browser bundle at
> build time — they are publicly visible.

---

## Step 4 — Add Supabase redirect URL

1. In [Supabase dashboard](https://app.supabase.com) → your project → **Authentication → URL Configuration**.
2. Add your Vercel domain to **Redirect URLs**:
   ```
   https://chatpay-xxx.vercel.app/**
   ```
   Replace `chatpay-xxx` with your actual Vercel deployment URL.
3. If you use a custom domain, add that too.

---

## Step 5 — Supabase schema (if using Supabase)

Run the SQL from `AGENTS.md` in the Supabase SQL editor to create the `schedules` table
and enable Row Level Security.

For the cron notification feature, also create:

```sql
create table if not exists schedule_notifications (
  id uuid primary key,
  user_id uuid not null,
  type text not null default 'schedule_due',
  title text,
  body text,
  schedule_id uuid references schedules(id) on delete cascade,
  read boolean default false,
  created_at timestamptz default now()
);

alter table schedule_notifications enable row level security;
create policy "own notifications" on schedule_notifications
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

---

## Step 6 — Verify

After a successful build and deploy, check each item in the regression checklist:

1. App loads at `https://chatpay-xxx.vercel.app` with no console errors.
2. Send a chat message — you get a real Gemini reply (not `[DEMO MODE]`).
3. "What's my balance?" returns token balances.
4. Send / swap / bridge preview cards appear and require Confirm.
5. Creating a schedule saves to Supabase and appears on the Scheduled page.
6. Magic-link sign-in works via the Vercel URL.

---

## Local development (unchanged)

The Vite dev server still proxies `/api/*` to the Bun server on port 3001:

```bash
# Terminal 1
bun run dev

# Terminal 2
bun run server
```

---

## Files changed in this migration

| File | Change |
|---|---|
| `api/_cors.ts` | New — shared CORS helper |
| `api/chat.ts` | New — replaces `POST /chat` in `server/index.ts` |
| `api/rpc/balances.ts` | New — replaces `GET /rpc/balances` |
| `api/rpc/tokenbalance.ts` | New — replaces `GET /rpc/tokenbalance` |
| `api/rpc/validatetoken.ts` | New — replaces `GET /rpc/validatetoken` |
| `api/rpc/txhistory.ts` | New — replaces `GET /rpc/txhistory` |
| `api/rpc/txstatus.ts` | New — replaces `GET /rpc/txstatus` |
| `api/rpc/estimategas.ts` | New — replaces `GET /rpc/estimategas` |
| `api/rpc/checkaddress.ts` | New — replaces `GET /rpc/checkaddress` |
| `api/rpc/health.ts` | New — replaces `GET /health` |
| `api/cron/schedules.ts` | New — 5-minute cron for due-schedule reminders |
| `vercel.json` | New — build config, rewrites, cron |
| `vite.config.ts` | Comment added (proxy kept for local dev) |
| `env.example` | Updated with all required variables |
| `docs/deploy-vercel.md` | New — this file |
| `server/` | **Unchanged** — still used by local `bun run server` |
| `src/` | **Unchanged** — all fetch calls already use `/api/*` |

## Manual steps required

1. Push to GitHub and import into Vercel (Step 2).
2. Add all environment variables in Vercel dashboard (Step 3).
3. Add Vercel domain to Supabase redirect URLs (Step 4).
4. Run Supabase schema SQL (Step 5), including the new `schedule_notifications` table.
