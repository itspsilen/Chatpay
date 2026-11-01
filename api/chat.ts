/**
 * POST /api/chat
 * Vercel serverless function — replaces the Bun server's /chat route.
 * GEMINI_API_KEY is server-side only and never sent to the browser.
 * Max duration: 60 s (Vercel hobby). Long tool chains trimmed to ≤ 3 rounds.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handlePreflight, setCors } from './_cors.js'
import { runChat } from '../server/gemini.js'
import {
  getAllBalances,
  getTxHistory,
  getTxStatus,
  estimateGasForSend,
  checkAddress as checkAddressRpc,
} from '../server/arcClient.js'
import {
  lookupToken,
  listNewTokens,
  lookupNFT,
  upcomingMints,
  webSearch,
} from '../server/dataService.js'
import { prepareBridge } from '../server/bridge.js'
import { prepareSwap } from '../server/swap.js'
import { createSchedulePreview, previewBatch as previewBatchTool } from '../server/scheduleTools.js'
import { KNOWN_TOKENS } from '../src/lib/tokens.js'
import type { TransactionPreview, TxAction } from '../src/lib/types.js'

// Re-export BatchPreview type (used inline below)
type BatchPreview = import('../src/lib/types.js').BatchPreview

const ARC_EXPLORER = 'https://explorer.testnet.arc.io'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return
  setCors(res)

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = req.body as {
    messages: { role: 'user' | 'assistant'; content: string }[]
    userMessage: string
    memories: string[]
    date: string
    timezone: string
    wallet?: {
      address?: string
      balance?: string
      balances?: Array<{ symbol: string; balance: string; valueUsd?: string; decimals: number; verified: boolean }>
      network?: string
      mode?: string
    }
  }

  if (!body?.userMessage) {
    return res.status(400).json({ error: 'userMessage is required' })
  }

  const wallet = body.wallet ?? {}
  const walletAddress = wallet.address

  // Tool handlers — identical logic to server/index.ts, wallet-context injected per request
  const toolHandlers: Record<string, (args: Record<string, string>) => Promise<unknown>> = {
    lookupToken: (args) => lookupToken(args.query ?? ''),
    listNewTokens: (args) => listNewTokens(args.timeWindow ?? '24h'),
    lookupNFT: (args) => lookupNFT(args.collection ?? ''),
    upcomingMints: () => upcomingMints(),
    webSearch: (args) => webSearch(args.query ?? ''),

    lookupBalances: async () => {
      if (!walletAddress) return { error: 'No wallet connected.' }
      const fb = wallet.balances
      if (fb && fb.length > 0) {
        const totalUsd = fb.reduce((s, b) => s + parseFloat(b.valueUsd ?? '0'), 0)
        return { address: walletAddress, network: 'Arc Testnet', balances: fb.map((b) => ({ symbol: b.symbol, balance: b.balance, valueUsd: b.valueUsd ?? 'no price data', verified: b.verified })), totalValueUsd: totalUsd.toFixed(2), note: 'Testnet — test tokens only' }
      }
      try {
        const live = await getAllBalances(walletAddress)
        const totalUsd = live.reduce((s, b) => s + parseFloat(b.valueUsd ?? '0'), 0)
        return { address: walletAddress, network: 'Arc Testnet', balances: live.map((b) => ({ symbol: b.symbol, balance: b.balance, valueUsd: b.valueUsd ?? 'no price data', verified: b.verified, error: b.error })), totalValueUsd: totalUsd.toFixed(2), note: 'Testnet — test tokens only' }
      } catch (err) { return { error: (err as Error).message } }
    },

    getWalletBalance: async () => {
      if (!walletAddress) return { error: 'No wallet connected.' }
      const fb = wallet.balances
      if (fb && fb.length > 0) return { address: walletAddress, network: 'Arc Testnet', balances: fb, note: 'Test tokens only' }
      try { return { address: walletAddress, network: 'Arc Testnet', balances: await getAllBalances(walletAddress), note: 'Test tokens only' } }
      catch (err) { return { error: (err as Error).message } }
    },

    getPortfolio: async () => {
      if (!walletAddress) return { error: 'No wallet connected' }
      const fb = wallet.balances
      if (fb && fb.length > 0) {
        const totalUsd = fb.reduce((s, b) => s + parseFloat(b.valueUsd ?? '0'), 0)
        return { address: walletAddress, network: 'Arc Testnet', balances: fb, totalValueUsd: totalUsd.toFixed(2), note: 'Testnet only' }
      }
      try {
        const live = await getAllBalances(walletAddress)
        const totalUsd = live.reduce((s, b) => s + parseFloat(b.valueUsd ?? '0'), 0)
        return { address: walletAddress, network: 'Arc Testnet', balances: live, totalValueUsd: totalUsd.toFixed(2), note: 'Testnet only' }
      } catch (err) { return { error: (err as Error).message } }
    },

    getTxHistory: async (args) => {
      if (!walletAddress) return { error: 'No wallet connected' }
      const limit = parseInt(args.limit ?? '10', 10)
      try {
        const txs = await getTxHistory(walletAddress, limit)
        if (txs.length === 0) return { transactions: [], message: 'No transactions found yet.' }
        return { transactions: txs, explorerBase: ARC_EXPLORER }
      } catch (err) { return { error: (err as Error).message } }
    },

    getTxStatus: async (args) => {
      const hash = args.hash ?? ''
      if (!hash.startsWith('0x')) return { error: 'Provide a valid transaction hash (0x...)' }
      try { return await getTxStatus(hash) } catch (err) { return { error: (err as Error).message } }
    },

    estimateGas: async (args) => {
      if (!walletAddress) return { error: 'No wallet connected' }
      const to = args.to ?? ''
      if (!to) return { error: 'Provide a destination address' }
      try { return await estimateGasForSend(walletAddress, to, args.amount ?? '0', args.token as `0x${string}` | undefined) }
      catch (err) { return { error: (err as Error).message } }
    },

    checkAddress: async (args) => {
      const address = args.address ?? ''
      if (!address) return { error: 'Provide an address' }
      try { return await checkAddressRpc(address) } catch (err) { return { error: (err as Error).message } }
    },

    getReceiveInfo: async () => {
      if (!walletAddress) return { error: 'No wallet connected' }
      return { address: walletAddress, network: 'Arc Testnet', qrData: `ethereum:${walletAddress}@5042002`, faucetUrl: 'https://faucet.circle.com', note: 'Share this address to receive test USDC on Arc Testnet' }
    },

    createSchedule: async (args) => {
      return createSchedulePreview({
        action: args.action ?? 'send',
        token: args.token ?? args.swapFromToken ?? 'USDC',
        amount: args.amount ?? '0',
        recipient: args.recipient ?? args.to ?? '',
        recipientLabel: args.recipientLabel ?? args.label,
        swapFromToken: args.swapFromToken ?? args.fromToken,
        swapToToken: args.swapToToken ?? args.toToken,
        slippageBps: args.slippageBps ? Number(args.slippageBps) : undefined,
        bridgeDestChain: args.bridgeDestChain ?? args.destChain,
        rule: args.rule ?? args.frequency ?? 'once',
        maxRuns: args.maxRuns,
        endsAt: args.endsAt,
        walletAddress,
        perTradeCap: 50,
        dailyCap: 100,
      })
    },

    listSchedules: async () => ({
      note: 'Schedules are stored in the app. Direct the user to the Scheduled page (calendar icon).',
      walletAddress: walletAddress ?? 'not connected',
    }),

    cancelSchedule: async (args) => {
      const id = args.id ?? args.scheduleId ?? ''
      if (!id) return { error: 'Provide the schedule ID to cancel.' }
      return { note: `To cancel schedule ${id}, go to the Scheduled page and tap Cancel on that row.`, scheduleId: id }
    },

    previewBatch: async (args): Promise<BatchPreview> => {
      const raw = args.recipients ?? args.addresses ?? ''
      const lines = typeof raw === 'string'
        ? raw.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean)
        : []
      return previewBatchTool({ token: args.token ?? 'USDC', amountPerRecipient: args.amountPerRecipient ?? args.amount ?? '0', recipients: lines, perTradeCap: 50, dailyCap: 100, dailySpent: 0 })
    },

    prepareBridge: async (args): Promise<TransactionPreview> => {
      return prepareBridge({ token: args.token ?? 'USDC', amount: args.amount ?? '0', destinationChain: args.destinationChain ?? args.destination ?? '', recipientAddress: args.recipientAddress ?? walletAddress, walletAddress })
    },

    prepareSwap: async (args): Promise<TransactionPreview> => {
      return prepareSwap({ fromToken: args.fromToken ?? 'USDC', toToken: args.toToken ?? 'EURC', amount: args.amount ?? '0', slippageBps: args.slippageBps ? parseInt(args.slippageBps, 10) : 50 })
    },

    previewTransaction: async (args): Promise<TransactionPreview> => {
      const action = (args.action ?? 'send') as TxAction
      if (action === 'bridge') {
        return prepareBridge({ token: args.token ?? 'USDC', amount: args.amount ?? '0', destinationChain: args.destinationChain ?? args.destination ?? '', recipientAddress: args.recipientAddress ?? walletAddress, walletAddress })
      }
      if (action === 'swap') {
        const tokenParts = (args.token ?? 'USDC EURC').split(/[\s\->→]+/)
        return prepareSwap({ fromToken: args.fromToken ?? tokenParts[0] ?? 'USDC', toToken: args.toToken ?? tokenParts[1] ?? 'EURC', amount: args.amount ?? '0' })
      }
      const tokenSymbol = args.token ?? 'USDC'
      const amount = args.amount ?? '0'
      const amountNum = parseFloat(amount)
      const destination = args.destination ?? ''
      const riskWarnings: string[] = ['Arc Testnet — test tokens only, no real funds']
      const knownToken = KNOWN_TOKENS.find((t) => t.name.toUpperCase() === tokenSymbol.toUpperCase() || t.address.toLowerCase() === tokenSymbol.toLowerCase())
      if (destination && destination.startsWith('0x')) {
        try { const addrInfo = await checkAddressRpc(destination); riskWarnings.push(...addrInfo.riskFlags) } catch { /* ignore */ }
      }
      if (amountNum > 100) riskWarnings.push('Large amount — double-check before confirming')
      let gasEstimate = 'Calculating…'
      if (walletAddress && destination && action === 'send' && knownToken) {
        try {
          const gas = await estimateGasForSend(walletAddress, destination, amount, knownToken.address)
          gasEstimate = gas.gasCost
          if (!gas.hasEnough) riskWarnings.push(`Insufficient balance: you have ${gas.walletBalance} but need ${amount} ${gas.token} + gas`)
        } catch { gasEstimate = 'Could not estimate' }
      }
      return {
        id: crypto.randomUUID(), action, token: tokenSymbol,
        amount: `${amountNum.toFixed(knownToken?.name === 'Circle BTC' ? 8 : 2)} ${tokenSymbol}`,
        estimatedPrice: 'Test tokens — $0.00 real value',
        fees: gasEstimate, destination: args.destination, contract: args.contract,
        network: 'Arc Testnet', riskWarnings, perTradeCap: 50, dailyCap: 100, dailySpent: 0,
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
      toolHandlers,
    )
    return res.status(200).json(result)
  } catch (err) {
    const msg = (err as Error).message ?? 'Internal error'
    const isTimeout = msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('timed out')
    console.error('[api/chat] error:', msg)
    return res.status(500).json({
      error: isTimeout
        ? 'The request took too long — please try a shorter question or try again.'
        : msg,
    })
  }
}
