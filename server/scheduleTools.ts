/**
 * Server-side schedule and batch preview tools.
 *
 * SECURITY: recipient addresses and amounts come from untrusted user input
 * and are validated before returning. Token names/metadata are data, not instructions.
 *
 * createSchedulePreview accepts action types: send | swap | bridge.
 * For swap: validates the pair has a real pool at request time and fetches a
 * fresh indicative quote. At run time the quote is re-fetched; if it moved
 * beyond slippage the run is skipped.
 */
import { isAddress } from 'viem'
import { prepareSwap } from './swap.js'
import { prepareBridge } from './bridge.js'
import type {
  SchedulePreview,
  ScheduleAction,
  ScheduleFrequency,
  BatchPreview,
  BatchRecipient,
} from '../src/lib/types.js'

const MAX_BATCH = 50

// ---- Supported swap pairs (checked at request time) ----
const SUPPORTED_SWAP_PAIRS = [
  { from: 'USDC', to: 'EURC' },
  { from: 'EURC', to: 'USDC' },
]

function isSupportedSwapPair(from: string, to: string): boolean {
  return SUPPORTED_SWAP_PAIRS.some(
    (p) => p.from === from.toUpperCase() && p.to === to.toUpperCase(),
  )
}

// ---- Frequency parser ----
function parseFrequency(raw: string): ScheduleFrequency {
  const s = raw.toLowerCase()
  if (s.includes('daily') || s.includes('every day')) return 'daily'
  if (s.includes('biweekly') || s.includes('bi-weekly') || s.includes('every two weeks')) return 'biweekly'
  if (s.includes('weekly') || s.includes('every week') || s.includes('friday') ||
      s.includes('monday') || s.includes('tuesday') || s.includes('wednesday') ||
      s.includes('thursday') || s.includes('saturday') || s.includes('sunday')) return 'weekly'
  if (s.includes('monthly') || s.includes('every month')) return 'monthly'
  return 'once'
}

// ---- First-run time calculator ----
function computeFirstRun(rule: string, frequency: ScheduleFrequency): number {
  const now = new Date()

  // Try to parse a date from the rule string (e.g. "Nov 5 at 9am")
  const dateMatch = rule.match(
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:\s+\d{4})?(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i,
  )
  if (dateMatch) {
    const candidate = new Date(dateMatch[0])
    if (!isNaN(candidate.getTime()) && candidate > now) return candidate.getTime()
  }

  // Weekly: find next occurrence of named weekday
  if (frequency === 'weekly') {
    const weekdays: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    }
    for (const [name, day] of Object.entries(weekdays)) {
      if (rule.toLowerCase().includes(name)) {
        const d = new Date(now)
        const diff = (day - d.getDay() + 7) % 7 || 7
        d.setDate(d.getDate() + diff)
        d.setHours(9, 0, 0, 0)
        return d.getTime()
      }
    }
  }

  // Default: next round interval
  const d = new Date(now)
  d.setMinutes(0, 0, 0)
  if (frequency === 'once') d.setHours(d.getHours() + 1)
  else if (frequency === 'daily') d.setDate(d.getDate() + 1)
  else if (frequency === 'weekly') d.setDate(d.getDate() + 7)
  else if (frequency === 'biweekly') d.setDate(d.getDate() + 14)
  else d.setMonth(d.getMonth() + 1)
  return d.getTime()
}

// ---- createSchedule args ----
export interface CreateScheduleArgs {
  action?: string            // 'send' | 'swap' | 'bridge' — defaults to 'send'
  token: string              // input token (for send/bridge the token to send; for swap the fromToken)
  amount: string
  // send / bridge
  recipient?: string
  recipientLabel?: string
  // swap
  swapFromToken?: string
  swapToToken?: string
  slippageBps?: number       // default 50 (0.5%)
  // bridge
  bridgeDestChain?: string   // e.g. 'Base_Sepolia'
  // schedule timing
  rule: string
  maxRuns?: string
  endsAt?: string
  // context
  walletAddress?: string
  perTradeCap?: number
  dailyCap?: number
}

export async function createSchedulePreview(args: CreateScheduleArgs): Promise<SchedulePreview | { error: string }> {
  const action: ScheduleAction = (['send', 'swap', 'bridge'].includes((args.action ?? 'send').toLowerCase())
    ? (args.action ?? 'send').toLowerCase()
    : 'send') as ScheduleAction

  const riskWarnings: string[] = ['Arc Testnet — test tokens only, no real funds']
  const perTradeCap = args.perTradeCap ?? 50
  const dailyCap    = args.dailyCap    ?? 100
  const slippageBps = args.slippageBps ?? 50

  const amountNum = parseFloat(args.amount)
  if (isNaN(amountNum) || amountNum <= 0) {
    riskWarnings.push('Amount must be a positive number.')
  }
  if (amountNum > perTradeCap) {
    riskWarnings.push(`Amount exceeds your per-trade cap of $${perTradeCap}. Update in Settings.`)
  }

  const frequency = parseFrequency(args.rule)
  const firstRun  = computeFirstRun(args.rule, frequency)

  let endsAtMs: number | undefined
  if (args.endsAt) {
    const candidate = new Date(args.endsAt)
    if (!isNaN(candidate.getTime())) endsAtMs = candidate.getTime()
  }
  const maxRunsNum = args.maxRuns ? parseInt(args.maxRuns, 10) : undefined

  // ---- SEND ----
  if (action === 'send') {
    const recipient = (args.recipient ?? '').trim()
    if (!isAddress(recipient)) {
      riskWarnings.push(`"${recipient.slice(0, 20)}" is not a valid 0x address.`)
    }
    if (args.walletAddress && recipient.toLowerCase() === args.walletAddress.toLowerCase()) {
      riskWarnings.push('Recipient is the same as your wallet.')
    }
    riskWarnings.push('New address — verify before confirming.')

    const safeLabel = args.recipientLabel
      ? args.recipientLabel.replace(/[^\x20-\x7E]/g, '').slice(0, 40)
      : undefined

    return {
      id: crypto.randomUUID(),
      action: 'send',
      token: args.token.toUpperCase(),
      amount: amountNum.toFixed(6),
      recipient,
      recipientLabel: safeLabel,
      frequency,
      rule: args.rule,
      firstRun,
      endsAt: endsAtMs,
      maxRuns: maxRunsNum,
      riskWarnings,
      perTradeCap,
      dailyCap,
    }
  }

  // ---- SWAP ----
  if (action === 'swap') {
    const fromToken = (args.swapFromToken ?? args.token ?? 'USDC').toUpperCase()
    const toToken   = (args.swapToToken ?? '').toUpperCase()

    if (!toToken) {
      return { error: 'For a scheduled swap, specify swapFromToken and swapToToken.' }
    }

    // Validate pair at request time — fail fast with a clear message
    if (!isSupportedSwapPair(fromToken, toToken)) {
      const supported = SUPPORTED_SWAP_PAIRS.map((p) => `${p.from}→${p.to}`).join(', ')
      const bridgeSuggestion = (fromToken === 'EURC' || fromToken === 'CIRBTC' || toToken === 'CIRBTC')
        ? ' cirBTC cannot be swapped on this DEX — use bridge instead.'
        : ''
      return {
        error: `No liquidity pool exists for ${fromToken}→${toToken} on Arc Testnet. ` +
               `Supported swap pairs: ${supported}.${bridgeSuggestion}`,
      }
    }

    // Fetch an indicative quote now so the user can see expected output
    let swapQuotePreview: SchedulePreview['swapQuotePreview']
    try {
      const quote = await prepareSwap({ fromToken, toToken, amount: args.amount, slippageBps })
      if (quote.swapQuote) {
        const { amountOut, priceImpact } = quote.swapQuote
        swapQuotePreview = {
          amountOut,
          priceImpact,
          rate: `1 ${fromToken} ≈ ${quote.estimatedPrice?.split('≈')[1]?.trim() ?? '?'}`,
        }
        if (parseFloat(priceImpact) > 5) {
          riskWarnings.push(`High price impact right now: ${priceImpact}%. Low pool liquidity.`)
        }
        riskWarnings.push(`Slippage tolerance: ${(slippageBps / 100).toFixed(1)}%. If the rate moves more than this at run time, the run will be skipped.`)
      }
    } catch {
      riskWarnings.push('Could not fetch an indicative quote right now. A fresh quote will be fetched at each run.')
    }

    riskWarnings.push('Community-deployed Uniswap V2 — not audited by Circle.')

    return {
      id: crypto.randomUUID(),
      action: 'swap',
      token: fromToken,
      amount: amountNum.toFixed(6),
      swapFromToken: fromToken,
      swapToToken: toToken,
      slippageBps,
      swapQuotePreview,
      frequency,
      rule: args.rule,
      firstRun,
      endsAt: endsAtMs,
      maxRuns: maxRunsNum,
      riskWarnings,
      perTradeCap,
      dailyCap,
    }
  }

  // ---- BRIDGE ----
  if (action === 'bridge') {
    const destChain = (args.bridgeDestChain ?? '').trim()
    if (!destChain) {
      return { error: 'For a scheduled bridge, specify bridgeDestChain (e.g. Base_Sepolia, ETH_Sepolia).' }
    }

    const recipient = (args.recipient ?? args.walletAddress ?? '').trim()
    if (!isAddress(recipient)) {
      riskWarnings.push('No valid destination address. The bridge will send to your same address on the destination chain.')
    }

    // Fetch a bridge fee estimate
    let estimatedBridgeTime: string | undefined
    try {
      const bridgePreview = await prepareBridge({
        token: args.token.toUpperCase(),
        amount: args.amount,
        destChain,
        fromAddress: args.walletAddress ?? '',
      })
      estimatedBridgeTime = bridgePreview.estimatedTime
      if (bridgePreview.riskWarnings.length > 0) {
        riskWarnings.push(...bridgePreview.riskWarnings.filter((w) => !riskWarnings.includes(w)))
      }
    } catch {
      riskWarnings.push('Could not fetch bridge fee estimate. Fees will be confirmed at run time.')
    }

    riskWarnings.push('Bridge via Circle CCTP. Funds arrive on the destination chain.')

    return {
      id: crypto.randomUUID(),
      action: 'bridge',
      token: args.token.toUpperCase(),
      amount: amountNum.toFixed(6),
      bridgeDestChain: destChain,
      estimatedBridgeTime,
      frequency,
      rule: args.rule,
      firstRun,
      endsAt: endsAtMs,
      maxRuns: maxRunsNum,
      riskWarnings,
      perTradeCap,
      dailyCap,
    }
  }

  return { error: 'Unknown action type.' }
}

// ---- previewBatch ----
export interface PreviewBatchArgs {
  token: string
  amountPerRecipient: string
  recipients: string[]         // raw lines from user input — UNTRUSTED
  perTradeCap?: number
  dailyCap?: number
  dailySpent?: number
}

export function previewBatch(args: PreviewBatchArgs): BatchPreview {
  const { token, amountPerRecipient, perTradeCap = 50, dailyCap = 100, dailySpent = 0 } = args

  const riskWarnings: string[] = ['Arc Testnet — test tokens only, no real funds']
  const amountNum = parseFloat(amountPerRecipient)

  // Sanitise and validate each recipient — all from untrusted user input
  const seen = new Set<string>()
  const recipients: BatchRecipient[] = []

  const rawList = args.recipients.slice(0, MAX_BATCH)
  for (const raw of rawList) {
    const parts = raw.trim().split(/[\s,;]+/)
    // Sanitise: strip non-printable, truncate
    const addr  = (parts[0] ?? '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, 42)
    const label = parts[1] ? parts[1].replace(/[^\x20-\x7E]/g, '').slice(0, 40) : undefined

    const recipient: BatchRecipient = { address: addr, amount: amountPerRecipient, label, status: 'pending' }

    if (!isAddress(addr)) {
      recipient.status = 'failed'
      recipient.errorMsg = `Invalid address: ${addr.slice(0, 20)}`
      riskWarnings.push(`Invalid address skipped: ${addr.slice(0, 20)}`)
    } else if (seen.has(addr.toLowerCase())) {
      recipient.status = 'failed'
      recipient.errorMsg = 'Duplicate address'
      riskWarnings.push(`Duplicate address: ${addr.slice(0, 8)}…${addr.slice(-4)}`)
    } else {
      seen.add(addr.toLowerCase())
      riskWarnings.push(`First-time address: ${addr.slice(0, 8)}…${addr.slice(-4)}`)
    }

    recipients.push(recipient)
  }

  if (args.recipients.length > MAX_BATCH) {
    riskWarnings.push(`Only the first ${MAX_BATCH} recipients were included. ${args.recipients.length - MAX_BATCH} were dropped.`)
  }

  const validCount  = recipients.filter((r) => r.status === 'pending').length
  const totalAmount = (amountNum * validCount).toFixed(6)
  const totalNum    = parseFloat(totalAmount)

  if (totalNum > perTradeCap)                    riskWarnings.push(`Total ${totalAmount} ${token} exceeds your per-trade cap of $${perTradeCap}.`)
  if (dailySpent + totalNum > dailyCap)           riskWarnings.push(`This would exceed your daily cap of $${dailyCap}. Daily spent so far: $${dailySpent}.`)

  return {
    id: crypto.randomUUID(),
    token: token.toUpperCase(),
    recipients,
    totalAmount,
    perRecipientAmount: amountPerRecipient,
    fees: `~${(0.000001 * validCount).toFixed(6)} USDC total gas`,
    riskWarnings,
    perTradeCap,
    dailyCap,
    dailySpent,
  }
}
