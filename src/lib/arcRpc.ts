/**
 * Read-only Arc Testnet RPC helpers.
 * All calls go through the backend proxy (/api/rpc/*) so the RPC URL
 * is never hardcoded in browser code and can be swapped server-side.
 */

export interface TokenBalance {
  address: string
  symbol: string
  name: string
  decimals: number
  balance: string   // formatted
  balanceRaw: string // bigint as string
  valueUsd?: string
}

export interface TxRecord {
  hash: string
  from: string
  to: string
  value: string
  timestamp: number
  status: 'success' | 'failed' | 'pending'
  gasUsed?: string
  gasPrice?: string
  input?: string
  explorerUrl: string
}

export interface AddressInfo {
  address: string
  isContract: boolean
  balance: string
  firstSeen?: string
  txCount?: number
  riskFlags: string[]
}

/** Fetch USDC + all token balances for an address via backend */
export async function fetchBalances(address: string): Promise<TokenBalance[]> {
  const res = await fetch(`/api/rpc/balances?address=${encodeURIComponent(address)}`)
  if (!res.ok) throw new Error(`Balance fetch failed: ${res.status}`)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return res.json()
}

/** Fetch recent transactions */
export async function fetchTxHistory(address: string, limit = 20): Promise<TxRecord[]> {
  const res = await fetch(`/api/rpc/txhistory?address=${encodeURIComponent(address)}&limit=${limit}`)
  if (!res.ok) throw new Error(`TX history failed: ${res.status}`)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return res.json()
}

/** Look up a single transaction by hash */
export async function fetchTxStatus(hash: string): Promise<TxRecord> {
  const res = await fetch(`/api/rpc/txstatus?hash=${encodeURIComponent(hash)}`)
  if (!res.ok) throw new Error(`TX status failed: ${res.status}`)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return res.json()
}

/** Check gas estimate for a send */
export async function estimateGas(from: string, to: string, amountUsdc: string): Promise<{ gasCost: string; hasEnough: boolean; walletBalance: string }> {
  const res = await fetch(`/api/rpc/estimategas?from=${from}&to=${to}&amount=${amountUsdc}`)
  if (!res.ok) throw new Error(`Gas estimate failed: ${res.status}`)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return res.json()
}

/** Check an address or contract */
export async function checkAddress(address: string): Promise<AddressInfo> {
  const res = await fetch(`/api/rpc/checkaddress?address=${encodeURIComponent(address)}`)
  if (!res.ok) throw new Error(`Address check failed: ${res.status}`)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return res.json()
}

/** Explain a transaction in plain language (backend uses Gemini) */
export async function explainTx(hash: string): Promise<{ explanation: string }> {
  const res = await fetch('/api/rpc/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash }),
  })
  if (!res.ok) throw new Error(`TX explain failed: ${res.status}`)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return res.json()
}
