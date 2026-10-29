# ChatPay — Agent Memory

> Built with Arc Studio

Chat-to-pay AI agent on Arc Testnet. Natural-language send, bridge (CCTP), swap (Uniswap V2), scheduled payments, and batch sends. All money-moving actions require explicit user confirmation — no auto-signing ever.

---

## What This App Does

ChatPay is a conversational crypto wallet for Arc Testnet. Users type natural language to send USDC/EURC/cirBTC, bridge cross-chain via Circle CCTP, swap on a community Uniswap V2 pool, create recurring scheduled payments, and batch-send to up to 50 addresses at once.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev       # frontend (port 5173)
bun run server    # backend (port 3001)
```

## Supabase setup (optional — app runs in localStorage without it)

Run once in the Supabase SQL editor to create the `schedules` table and enable Row Level Security:

```sql
create table if not exists schedules (
  id uuid primary key,
  user_id uuid not null,
  label text,
  token text not null,
  amount text not null,
  recipient text not null,
  recipient_label text,
  frequency text not null,
  rule text not null,
  next_run timestamptz not null,
  ends_at timestamptz,
  max_runs int,
  runs_completed int default 0,
  status text not null default 'active',
  created_at timestamptz default now(),
  last_run timestamptz,
  last_run_status text,
  last_run_reason text,
  last_run_hash text,
  -- swap/bridge action support (added in v2)
  action text not null default 'send',
  swap_from_token text,
  swap_to_token text,
  slippage_bps int,
  bridge_dest_chain text
);

alter table schedules enable row level security;
create policy "own schedules" on schedules
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

If you already have the `schedules` table from a previous version, add the new columns:
```sql
alter table schedules add column if not exists action text not null default 'send';
alter table schedules add column if not exists swap_from_token text;
alter table schedules add column if not exists swap_to_token text;
alter table schedules add column if not exists slippage_bps int;
alter table schedules add column if not exists bridge_dest_chain text;
```
