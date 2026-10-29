// ---- Chat ----
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: number
  isMock?: boolean
  error?: boolean
  toolCall?: AgentToolCall
  previewCard?: TransactionPreview
  schedulePreview?: SchedulePreview   // set when agent calls createSchedule
  batchPreview?: BatchPreview         // set when agent calls previewBatch
}

// ---- Token balance (returned from /rpc/balances) ----
export interface TokenBalance {
  address: string
  symbol: string
  name: string
  decimals: number
  balance: string
  balanceRaw: string
  valueUsd?: string
  priceUsd?: number
  verified: boolean
  error?: string
}

// ---- Agent tools ----
export type AgentToolName =
  | 'lookupToken'
  | 'listNewTokens'
  | 'lookupNFT'
  | 'upcomingMints'
  | 'webSearch'
  | 'previewTransaction'
  | 'getWalletBalance'
  | 'lookupBalances'
  | 'getPortfolio'
  | 'getTxHistory'
  | 'getTxStatus'
  | 'estimateGas'
  | 'getReceiveInfo'
  | 'checkAddress'
  | 'prepareBridge'
  | 'prepareSwap'
  | 'createSchedule'
  | 'listSchedules'
  | 'cancelSchedule'
  | 'previewBatch'

export interface AgentToolCall {
  name: AgentToolName
  args: Record<string, unknown>
}

// ---- Transaction preview ----
export type TxAction = 'buy' | 'sell' | 'swap' | 'send' | 'mint' | 'bridge'

export interface TransactionPreview {
  id: string
  action: TxAction
  token: string
  amount: string
  estimatedPrice?: string
  slippage?: string
  fees?: string
  feeToken?: string         // which token the fee is paid in (e.g. 'USDC' for CCTP)
  destination?: string
  contract?: string
  network: string
  riskWarnings: string[]
  perTradeCap: number
  dailyCap: number
  dailySpent: number
  // Bridge-specific
  sourceChain?: string      // App Kit chain identifier
  destinationChain?: string // App Kit chain identifier
  estimatedTime?: string    // e.g. '~20 seconds (FAST)'
  swapQuote?: {             // present when action === 'swap'
    amountIn: string
    amountOut: string
    amountOutMin: string
    priceImpact: string
    path: `0x${string}`[]
    fromToken: string
    toToken: string
    fromDecimals: number
    toDecimals: number
  }
}

// ---- Memory ----
export interface Memory {
  id: string
  text: string
  createdAt: number
}

// ---- User / settings ----
export interface AppSettings {
  perTradeCap: number
  dailyCap: number
  confirmEvery: boolean
  language: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  perTradeCap: 50,
  dailyCap: 100,
  confirmEvery: true,
  language: 'en',
}

// ---- App user ----
export interface AppUser {
  id: string
  email?: string
  isDemoMode: boolean
}

// ---- Wallet modes ----
export type WalletMode = 'connected' | 'demo' | 'watchOnly' | 'testnet'

export interface WalletInfo {
  mode: WalletMode
  address?: string
  label?: string
}

// ---- Scheduled payments ----
export type ScheduleFrequency = 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly'
export type ScheduleStatus = 'active' | 'paused' | 'cancelled' | 'completed'
export type ScheduleRunStatus = 'pending' | 'confirmed' | 'skipped' | 'failed'
export type ScheduleAction = 'send' | 'swap' | 'bridge'

export interface Schedule {
  id: string
  userId: string
  label?: string           // user-provided name, e.g. "Ada weekly"
  action: ScheduleAction   // 'send' | 'swap' | 'bridge'
  token: string            // input token, e.g. 'USDC'
  amount: string           // human-readable, e.g. '10.00'
  // send / bridge
  recipient?: string       // full 0x address — present for send; undefined for swap
  recipientLabel?: string  // resolved name for display only
  // swap
  swapFromToken?: string   // e.g. 'USDC'
  swapToToken?: string     // e.g. 'EURC'
  slippageBps?: number     // e.g. 50 = 0.5%
  // bridge
  bridgeDestChain?: string // App Kit chain identifier, e.g. 'Base_Sepolia'
  frequency: ScheduleFrequency
  rule: string             // human-readable rule, e.g. 'every Friday at 09:00'
  nextRun: number          // epoch ms
  endsAt?: number          // epoch ms; undefined = indefinite
  maxRuns?: number         // stop after N runs; undefined = indefinite
  runsCompleted: number
  status: ScheduleStatus
  createdAt: number
  lastRun?: number
  lastRunStatus?: ScheduleRunStatus
  lastRunReason?: string   // skip/fail reason
  lastRunHash?: string     // tx hash of the last confirmed run
}

/** Preview card the agent shows before saving a schedule */
export interface SchedulePreview {
  id: string               // ephemeral — real ID assigned on confirm
  action: ScheduleAction
  token: string            // input token
  amount: string
  // send / bridge
  recipient?: string
  recipientLabel?: string
  // swap
  swapFromToken?: string
  swapToToken?: string
  slippageBps?: number
  /** Fresh quote fetched at preview time — re-fetched again at run time */
  swapQuotePreview?: {
    amountOut: string
    priceImpact: string
    rate: string           // e.g. '1 USDC ≈ 0.9983 EURC'
  }
  // bridge
  bridgeDestChain?: string
  estimatedBridgeTime?: string
  frequency: ScheduleFrequency
  rule: string
  firstRun: number
  endsAt?: number
  maxRuns?: number
  riskWarnings: string[]
  perTradeCap: number
  dailyCap: number
}

// ---- Batch transactions ----
export interface BatchRecipient {
  address: string
  amount: string           // per-recipient amount
  label?: string           // optional name/note from the CSV
  status?: 'pending' | 'signing' | 'success' | 'failed' | 'skipped'
  txHash?: string
  errorMsg?: string
}

export interface BatchPreview {
  id: string
  token: string
  recipients: BatchRecipient[]  // max 50
  totalAmount: string
  perRecipientAmount: string
  fees: string
  riskWarnings: string[]
  perTradeCap: number
  dailyCap: number
  dailySpent: number
}

// ---- In-app notifications ----
export interface AppNotification {
  id: string
  type: 'schedule_due' | 'schedule_skipped' | 'batch_done' | 'batch_partial' | 'info' | 'error'
  title: string
  body: string
  scheduleId?: string
  read: boolean
  createdAt: number
}

// ---- App route ----
export type AppRoute =
  | 'landing'
  | 'signin'
  | 'wallet-setup'
  | 'safety-setup'
  | 'mode-select'
  | 'chat-pay'
  | 'settings'
  | 'memory'
  | 'scheduled'
