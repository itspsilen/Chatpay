# ChatPay

An onchain AI agent for Arc — chat naturally to send, bridge, and swap USDC; schedule recurring payments; and batch-send to multiple addresses, all with explicit confirm-before-sign safety on Circle's Arc network.

Built with [Arc Studio](https://studio.arc.io)

---

## Tech stack

- React + Vite + TypeScript, Tailwind CSS (dark theme)
- wagmi + viem + ConnectKit (wallet connection)
- Supabase (auth and data, optional — falls back to local storage in demo mode)
- Google Gemini (AI, server-side only — `GEMINI_API_KEY` never reaches the browser)
- Bun backend server on port 3001, proxied through Vite at `/api/*`

---

## Development

### Prerequisites

- [Bun](https://bun.sh) 1.0+

### Install

```bash
bun install
```

### Environment variables

Copy `env.example` to `.env` and fill in the values you want to use:

| Variable | Purpose | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | No — app runs in demo mode without it |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | No |
| `GEMINI_API_KEY` | Google Gemini API key (server-side only) | No — mock replies used without it |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID (get one free at cloud.walletconnect.com) | No — MetaMask injected connector only without it |
| `ARC_RPC_URL` | Arc Testnet RPC endpoint | No — defaults to https://rpc.testnet.arc.io |
| `ARC_CHAIN_ID` | Arc Testnet chain ID | No — defaults to 5042002 |
| `ARC_EXPLORER_URL` | Arc Testnet explorer URL | No — defaults to https://explorer.testnet.arc.io |

The app runs without any environment variables set (demo mode). Everything is stored in local storage.

### Run

Start the Vite frontend (port 5173) and the API server (port 3001) separately:

```bash
# Terminal 1 — frontend
bun run dev

# Terminal 2 — backend
bun run server
```

Or together (requires `concurrently`):

```bash
bun run start
```

### Build

```bash
bun run build   # (not in package.json yet — use bunx vite build)
```

### Lint and typecheck

```bash
bun run check
```

---

## Modes

- **Chat-Pay (LIVE):** Research tokens, look up NFTs, and preview transactions on Arc. Backed by the Gemini API with an onchain data service. Returns clearly labeled mock data until real Arc explorer endpoints are wired up.
- **Chat-Life (Coming soon):** Daily life automation — bills, subscriptions, DCA, savings goals. Locked with a "Notify me" sheet.

---

## Safety model

- All transactions require an explicit **Confirm** tap on a preview card — the agent never executes anything autonomously.
- Per-trade and daily USDC caps are enforced in the preview card and block the Confirm button when exceeded.
- All content the agent reads (web pages, token names, NFT metadata, uploaded files) is treated as untrusted data and cannot trigger actions.
- Private keys are never stored or requested.

---

## Data model (Supabase)

Tables: `users`, `wallets`, `memories`, `messages`, `transactions`, `settings`

SQL migrations are not included yet — apply them manually or use Supabase's table editor.
