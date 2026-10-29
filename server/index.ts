/**
 * ChatPay backend server.
 * Runs on port 3001. The Vite dev server proxies /api/* to this server.
 * Start with: bun run server
 */
import { runChat } from './gemini'
import {
  lookupToken,
  listNewTokens,
  lookupNFT,
  upcomingMints,
  webSearch,
} from './dataService'
import {
  getAllBalances,
  getTokenBalance,
  validateCustomToken,
  getTxHistory,
  getTxStatus,
  estimateGasForSend,
  checkAddress as checkAddressRpc,
} from './arcClient'
import { prepareBridge } from './bridge'
import { prepareSwap } from './swap'
import { createSchedulePreview, previewBatch as previewBatchTool } from './scheduleTools'
import { KNOWN_TOKENS } from '../src/lib/tokens'
import type { TransactionPreview, TxAction } from '../src/lib/types'

const PORT = 3001
const ARC_EXPLORER = 'https://explorer.testnet.arc.io'

// ---- CORS headers ----
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// ---- Static tool handlers (no wallet context needed) ----
const toolHandlers: Record<string, (args: Record<string, string>) => Promise<unknown>> = {
  lookupToken: (args) => lookupToken(args.query ?? ''),
  listNewTokens: (args) => listNewTokens(args.timeWindow ?? '24h'),
  lookupNFT: (args) => lookupNFT(args.collection ?? ''),
  upcomingMints: () => upcomingMints(),
  webSearch: (args) => webSearch(args.query ?? ''),
}

// ---- Request handler ----
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  // ---- Health ----
  if (url.pathname === '/health' && req.method === 'GET') {
    return Response.json({ ok: true, gemini: !!process.env.GEMINI_API_KEY }, { headers: cors })
  }

  // ====================================================
  // RPC READ ROUTES (Phase 1 — read-only, no signing)
  // ====================================================

  // All known token balances for a wallet
  if (url.pathname === '/rpc/balances' && req.method === 'GET') {
    const address = url.searchParams.get('address') ?? ''
    try {
      const balances = await getAllBalances(address)
      return Response.json(balances, { headers: cors })
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400, headers: cors })
    }
  }

  // Single token balance
  if (url.pathname === '/rpc/tokenbalance' && req.method === 'GET') {
    const wallet = url.searchParams.get('wallet') ?? ''
    const token = url.searchParams.get('token') ?? ''
    try {
      const bal = await getTokenBalance(wallet, token)
      return Response.json(bal, { headers: cors })
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400, headers: cors })
    }
  }

  // Validate a custom token address
  if (url.pathname === '/rpc/validatetoken' && req.method === 'GET') {
    const address = url.searchParams.get('address') ?? ''
    try {
      const result = await validateCustomToken(address)
      return Response.json(result, { headers: cors })
    } catch (err) {
      return Response.json({ valid: false, error: (err as Error).message }, { status: 400, headers: cors })
    }
  }

  // Tx history
  if (url.pathname === '/rpc/txhistory' && req.method === 'GET') {
    const address = url.searchParams.get('address') ?? ''
    const limit = parseInt(url.searchParams.get('limit') ?? '20', 10)
    try {
      const txs = await getTxHistory(address, Math.min(limit, 50))
      return Response.json(txs, { headers: cors })
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400, headers: cors })
    }
  }

  // Tx status
  if (url.pathname === '/rpc/txstatus' && req.method === 'GET') {
    const hash = url.searchParams.get('hash') ?? ''
    try {
      const tx = await getTxStatus(hash)
      return Response.json(tx, { headers: cors })
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400, headers: cors })
    }
  }

  // Gas estimate (token-aware)
  if (url.pathname === '/rpc/estimategas' && req.method === 'GET') {
    const from = url.searchParams.get('from') ?? ''
    const to = url.searchParams.get('to') ?? ''
    const amount = url.searchParams.get('amount') ?? '0'
    const tokenAddress = url.searchParams.get('token') ?? undefined
    try {
      const result = await estimateGasForSend(from, to, amount, tokenAddress as `0x${string}` | undefined)
      return Response.json(result, { headers: cors })
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400, headers: cors })
    }
  }

  // Address checker
  if (url.pathname === '/rpc/checkaddress' && req.method === 'GET') {
    const address = url.searchParams.get('address') ?? ''
    try {
      const info = await checkAddressRpc(address)
      return Response.json(info, { headers: cors })
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400, headers: cors })
    }
  }

  // ====================================================
  // CHAT ROUTE
  // ====================================================

  if (url.pathname === '/chat' && req.method === 'POST') {
    let body: {
      messages: { role: 'user' | 'assistant'; content: string }[]
      userMessage: string
      memories: string[]
      date: string
      timezone: string
      wallet?: {
        address?: string
        balance?: string           // human-readable summary e.g. "1.50 USDC ($1.50), 0 EURC"
        balances?: Array<{ symbol: string; balance: string; valueUsd?: string; decimals: number; verified: boolean }>
        network?: string
        mode?: string
      }
    }
    try {
      body = await req.json() as typeof body
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: cors })
    }

    const wallet = body.wallet ?? {}
    const walletAddress = wallet.address

    // Per-request tool handlers that have wallet context
    const requestToolHandlers: Record<string, (args: Record<string, string>) => Promise<unknown>> = {
      ...toolHandlers,

      // ---- Multi-token balance (uses pre-fetched data from frontend, falls back to RPC) ----
      lookupBalances: async (): Promise<unknown> => {
        if (!walletAddress) return { error: 'No wallet connected.' }
        // Use the balances the frontend already fetched (freshest, no extra RPC call)
        const frontendBalances = wallet.balances
        if (frontendBalances && frontendBalances.length > 0) {
          const totalUsd = frontendBalances.reduce((s, b) => s + parseFloat(b.valueUsd ?? '0'), 0)
          return {
            address: walletAddress,
            network: 'Arc Testnet',
            balances: frontendBalances.map((b) => ({
              symbol: b.symbol,
              balance: b.balance,
              valueUsd: b.valueUsd ?? 'no price data',
              verified: b.verified,
            })),
            totalValueUsd: totalUsd.toFixed(2),
            note: 'Testnet — test tokens only, no real value',
          }
        }
        // Fallback: fetch live from RPC
        try {
          const liveBalances = await getAllBalances(walletAddress)
          const totalUsd = liveBalances.reduce((s, b) => s + parseFloat(b.valueUsd ?? '0'), 0)
          return {
            address: walletAddress,
            network: 'Arc Testnet',
            balances: liveBalances.map((b) => ({
              symbol: b.symbol,
              balance: b.balance,
              valueUsd: b.valueUsd ?? 'no price data',
              verified: b.verified,
              error: b.error,
            })),
            totalValueUsd: totalUsd.toFixed(2),
            note: 'Testnet — test tokens only, no real value',
          }
        } catch (err) {
          return { error: (err as Error).message }
        }
      },

      // ---- Single-token / portfolio (also uses frontend-provided balances) ----
      getWalletBalance: async (): Promise<unknown> => {
        if (!walletAddress) return { error: 'No wallet connected.' }
        const frontendBalances = wallet.balances
        if (frontendBalances && frontendBalances.length > 0) {
          return { address: walletAddress, network: 'Arc Testnet', balances: frontendBalances, note: 'Test tokens only — no real value' }
        }
        try {
          const liveBalances = await getAllBalances(walletAddress)
          return { address: walletAddress, network: 'Arc Testnet', balances: liveBalances, note: 'Test tokens only — no real value' }
        } catch (err) {
          return { error: (err as Error).message }
        }
      },

      getPortfolio: async (): Promise<unknown> => {
        if (!walletAddress) return { error: 'No wallet connected' }
        const frontendBalances = wallet.balances
        if (frontendBalances && frontendBalances.length > 0) {
          const totalUsd = frontendBalances.reduce((s, b) => s + parseFloat(b.valueUsd ?? '0'), 0)
          return { address: walletAddress, network: 'Arc Testnet', balances: frontendBalances, totalValueUsd: totalUsd.toFixed(2), note: 'Testnet only' }
        }
        try {
          const liveBalances = await getAllBalances(walletAddress)
          const totalUsd = liveBalances.reduce((s, b) => s + parseFloat(b.valueUsd ?? '0'), 0)
          return { address: walletAddress, network: 'Arc Testnet', balances: liveBalances, totalValueUsd: totalUsd.toFixed(2), note: 'Testnet only' }
        } catch (err) {
          return { error: (err as Error).message }
        }
      },

      getTxHistory: async (args): Promise<unknown> => {
        if (!walletAddress) return { error: 'No wallet connected' }
        const limit = parseInt(args.limit ?? '10', 10)
        try {
          const txs = await getTxHistory(walletAddress, limit)
          if (txs.length === 0) return { transactions: [], message: 'No transactions found yet. Get test USDC from the faucet to start.' }
          return { transactions: txs, explorerBase: ARC_EXPLORER }
        } catch (err) {
          return { error: (err as Error).message }
        }
      },

      getTxStatus: async (args): Promise<unknown> => {
        const hash = args.hash ?? ''
        if (!hash.startsWith('0x')) return { error: 'Provide a valid transaction hash (0x...)' }
        try { return await getTxStatus(hash) } catch (err) { return { error: (err as Error).message } }
      },

      estimateGas: async (args): Promise<unknown> => {
        if (!walletAddress) return { error: 'No wallet connected' }
        const to = args.to ?? ''
        const amount = args.amount ?? '0'
        if (!to) return { error: 'Provide a destination address' }
        try {
          return await estimateGasForSend(walletAddress, to, amount, args.token as `0x${string}` | undefined)
        } catch (err) {
          return { error: (err as Error).message }
        }
      },

      checkAddress: async (args): Promise<unknown> => {
        const address = args.address ?? ''
        if (!address) return { error: 'Provide an address' }
        try { return await checkAddressRpc(address) } catch (err) { return { error: (err as Error).message } }
      },

      getReceiveInfo: async (): Promise<unknown> => {
        if (!walletAddress) return { error: 'No wallet connected' }
        return {
          address: walletAddress,
          network: 'Arc Testnet',
          qrData: `ethereum:${walletAddress}@5042002`,
          faucetUrl: 'https://faucet.circle.com',
          note: 'Share this address to receive test USDC on Arc Testnet',
        }
      },

      // ---- Schedule tools ----
      createSchedule: async (args): Promise<unknown> => {
        return createSchedulePreview({
          action: args.action ?? 'send',
          token: args.token ?? args.swapFromToken ?? 'USDC',
          amount: args.amount ?? '0',
          // send / bridge
          recipient: args.recipient ?? args.to ?? '',
          recipientLabel: args.recipientLabel ?? args.label,
          // swap
          swapFromToken: args.swapFromToken ?? args.fromToken,
          swapToToken: args.swapToToken ?? args.toToken,
          slippageBps: args.slippageBps ? Number(args.slippageBps) : undefined,
          // bridge
          bridgeDestChain: args.bridgeDestChain ?? args.destChain,
          // timing
          rule: args.rule ?? args.frequency ?? 'once',
          maxRuns: args.maxRuns,
          endsAt: args.endsAt,
          walletAddress,
          perTradeCap: 50,
          dailyCap: 100,
        })
      },

      listSchedules: async (): Promise<unknown> => {
        // Schedules are stored client-side — return a stub telling the agent to check the Scheduled page
        return {
          note: 'Schedules are stored in the app. Direct the user to the Scheduled page (calendar icon) to see all schedules.',
          walletAddress: walletAddress ?? 'not connected',
        }
      },

      cancelSchedule: async (args): Promise<unknown> => {
        const id = args.id ?? args.scheduleId ?? ''
        if (!id) return { error: 'Provide the schedule ID to cancel.' }
        return {
          note: `To cancel schedule ${id}, go to the Scheduled page and tap Cancel on that row.`,
          scheduleId: id,
        }
      },

      // ---- Batch preview ----
      previewBatch: async (args): Promise<BatchPreview> => {
        // recipients comes as a newline or comma-separated list
        const raw = args.recipients ?? args.addresses ?? ''
        const lines = typeof raw === 'string'
          ? raw.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean)
          : []
        return previewBatchTool({
          token: args.token ?? 'USDC',
          amountPerRecipient: args.amountPerRecipient ?? args.amount ?? '0',
          recipients: lines,
          perTradeCap: 50,
          dailyCap: 100,
          dailySpent: 0,
        })
      },

      // ---- Bridge tool (CCTP/CCTPx via Circle App Kit) ----
      prepareBridge: async (args): Promise<TransactionPreview> => {
        return prepareBridge({
          token: args.token ?? 'USDC',
          amount: args.amount ?? '0',
          destinationChain: args.destinationChain ?? args.destination ?? '',
          recipientAddress: args.recipientAddress ?? walletAddress,
          walletAddress,
        })
      },

      // ---- Swap tool (community Uniswap V2 on Arc Testnet) ----
      prepareSwap: async (args): Promise<TransactionPreview> => {
        return prepareSwap({
          fromToken: args.fromToken ?? 'USDC',
          toToken: args.toToken ?? 'EURC',
          amount: args.amount ?? '0',
          slippageBps: args.slippageBps ? parseInt(args.slippageBps, 10) : 50,
        })
      },

      // ---- Generic previewTransaction (send, mint, legacy) ----
      previewTransaction: async (args): Promise<TransactionPreview> => {
        // Route bridge and swap to their dedicated tools
        const action = (args.action ?? 'send') as TxAction
        if (action === 'bridge') {
          return prepareBridge({
            token: args.token ?? 'USDC',
            amount: args.amount ?? '0',
            destinationChain: args.destinationChain ?? args.destination ?? '',
            recipientAddress: args.recipientAddress ?? walletAddress,
            walletAddress,
          })
        }
        if (action === 'swap') {
          const tokenParts = (args.token ?? 'USDC EURC').split(/[\s\->→]+/)
          return prepareSwap({
            fromToken: args.fromToken ?? tokenParts[0] ?? 'USDC',
            toToken: args.toToken ?? tokenParts[1] ?? 'EURC',
            amount: args.amount ?? '0',
          })
        }
        const tokenSymbol = args.token ?? 'USDC'
        const amount = args.amount ?? '0'
        const amountNum = parseFloat(amount)
        const destination = args.destination ?? ''

        const riskWarnings: string[] = ['Arc Testnet — test tokens only, no real funds']

        // Find the token the user actually holds
        const knownToken = KNOWN_TOKENS.find(
          (t) => t.name.toUpperCase() === tokenSymbol.toUpperCase() ||
                 t.address.toLowerCase() === tokenSymbol.toLowerCase(),
        )

        // Bridge-specific validation
        if (action === 'bridge') {
          const destChain = args.destinationChain ?? destination
          if (!knownToken) {
            riskWarnings.push(`Token "${tokenSymbol}" is not in the known token list — bridge not available`)
          } else if (!knownToken.cctp) {
            riskWarnings.push(`${tokenSymbol} does not support CCTP bridging from Arc Testnet`)
          } else if (destChain && knownToken.bridgeDestinations && !knownToken.bridgeDestinations.some(
            (d) => d.toLowerCase().includes(destChain.toLowerCase()),
          )) {
            riskWarnings.push(`${tokenSymbol} cannot be bridged to ${destChain}. Supported: ${knownToken.bridgeDestinations.join(', ')}`)
          }
        }

        // Destination address risk check
        if (destination && destination.startsWith('0x') && action !== 'bridge') {
          try {
            const addrInfo = await checkAddressRpc(destination)
            riskWarnings.push(...addrInfo.riskFlags)
          } catch { /* ignore */ }
        }

        if (amountNum > 100) riskWarnings.push('Large amount — double-check before confirming')

        // Gas estimate (for send)
        let gasEstimate = 'Calculating…'
        if (walletAddress && destination && action === 'send' && knownToken) {
          try {
            const gas = await estimateGasForSend(walletAddress, destination, amount, knownToken.address)
            gasEstimate = gas.gasCost
            if (!gas.hasEnough) riskWarnings.push(`Insufficient balance: you have ${gas.walletBalance} but need ${amount} ${gas.token} + gas`)
          } catch { gasEstimate = 'Could not estimate' }
        }

        // Bridge fee info
        if (action === 'bridge') {
          gasEstimate = 'CCTP bridge fee: ~0.01 USDC + gas. Fee paid in USDC (native gas on Arc).'
        }

        return {
          id: crypto.randomUUID(),
          action,
          token: tokenSymbol,
          amount: `${amountNum.toFixed(action === 'bridge' || knownToken?.name === 'Circle BTC' ? 8 : 2)} ${tokenSymbol}`,
          estimatedPrice: 'Test tokens — $0.00 real value',
          slippage: action === 'swap' ? '0.5%' : undefined,
          fees: gasEstimate,
          destination: args.destination,
          contract: args.contract,
          network: 'Arc Testnet',
          riskWarnings,
          perTradeCap: 50,
          dailyCap: 100,
          dailySpent: 0,
        }
      },
    }

    try {
      const result = await runChat(
        body.messages ?? [],
        body.userMessage,
        body.memories ?? [],
        body.date,
        body.timezone,
        wallet,
        requestToolHandlers,
      )
      return Response.json(result, { headers: cors })
    } catch (err) {
      console.error('[chat] error:', err)
      return Response.json({ error: (err as Error).message ?? 'Internal error' }, { status: 500, headers: cors })
    }
  }

  return Response.json({ error: 'Not found' }, { status: 404, headers: cors })
}

// ---- Start ----
console.log(`[ChatPay server] Listening on http://localhost:${PORT}`)
Bun.serve({ port: PORT, fetch: handleRequest })
