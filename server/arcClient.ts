/**
 * Viem public client for Arc Testnet + multi-token balance helpers.
 *
 * SECURITY: Token names, symbols, and metadata are untrusted data.
 * They are sanitised before being returned and must never be executed,
 * interpolated into queries, or treated as instructions.
 */
import { createPublicClient, http, erc20Abi, formatUnits, isAddress, parseUnits } from 'viem'
import { arcTestnet } from 'viem/chains'
import {
  KNOWN_TOKENS,
  KNOWN_TOKEN_MAP,
  getKnownPriceUsd,
  USDC_ADDRESS,
} from '../src/lib/tokens'

const ARC_EXPLORER = 'https://explorer.testnet.arc.io'
// Arcscan token-balance API (may return 404 — we degrade gracefully)
const ARCSCAN_API = 'https://explorer.testnet.arc.io/api/v2'

const rpcUrl = process.env.ARC_RPC_URL ?? arcTestnet.rpcUrls.default.http[0]

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(rpcUrl),
})

// ---- Types ----
export interface TokenBalance {
  address: string
  symbol: string        // sanitised — truncated, non-printable chars stripped
  name: string          // sanitised — same
  decimals: number
  balance: string       // human-readable, formatted with token's own decimals
  balanceRaw: string
  valueUsd?: string
  priceUsd?: number
  verified: boolean     // true = in our known-token list
  error?: string        // present if the read failed
}

export interface TxRecord {
  hash: string
  from: string
  to: string
  value: string
  token: string
  timestamp: number
  status: 'success' | 'failed' | 'pending'
  gasUsed?: string
  gasPrice?: string
  explorerUrl: string
}

export interface AddressInfo {
  address: string
  isContract: boolean
  balance: string
  txCount?: number
  riskFlags: string[]
}

// ---- Sanitise untrusted string from chain ----
function sanitise(raw: string, maxLen = 64): string {
  // Strip non-printable chars, limit length. Never execute the value.
  return raw.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen).trim()
}

// ---- Read token info from chain ----
async function readTokenInfo(
  address: `0x${string}`,
): Promise<{ symbol: string; name: string; decimals: number }> {
  const [symbol, name, decimals] = await Promise.all([
    publicClient.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
    publicClient.readContract({ address, abi: erc20Abi, functionName: 'name' }),
    publicClient.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
  ])
  return {
    symbol: sanitise(symbol as string, 20),
    name: sanitise(name as string, 64),
    decimals: Number(decimals),
  }
}

// ---- Read balance for one ERC-20 ----
async function readTokenBalance(
  tokenAddress: `0x${string}`,
  walletAddress: `0x${string}`,
): Promise<TokenBalance> {
  const known = KNOWN_TOKEN_MAP.get(tokenAddress.toLowerCase())
  try {
    const [info, raw] = await Promise.all([
      readTokenInfo(tokenAddress),
      publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [walletAddress],
      }) as Promise<bigint>,
    ])

    const formatted = parseFloat(formatUnits(raw, info.decimals))
    const priceUsd = getKnownPriceUsd(info.symbol)
    const valueUsd = priceUsd != null ? (formatted * priceUsd).toFixed(2) : undefined

    return {
      address: tokenAddress,
      symbol: info.symbol,
      name: info.name,
      decimals: info.decimals,
      balance: formatted.toFixed(info.decimals > 6 ? 8 : 6),
      balanceRaw: raw.toString(),
      valueUsd,
      priceUsd,
      verified: !!known,
    }
  } catch (err) {
    return {
      address: tokenAddress,
      symbol: known?.name ?? tokenAddress.slice(0, 8),
      name: known?.name ?? 'Unknown',
      decimals: 18,
      balance: '0',
      balanceRaw: '0',
      verified: !!known,
      error: `Could not load ${known?.name ?? tokenAddress.slice(0, 10)}: ${(err as Error).message.slice(0, 120)}`,
    }
  }
}

// ---- Arcscan token discovery ----
interface ArcscanTokenItem {
  token?: { address?: string; symbol?: string; name?: string; decimals?: string }
  value?: string
}

async function discoverTokensFromExplorer(walletAddress: string): Promise<`0x${string}`[]> {
  try {
    const res = await fetch(
      `${ARCSCAN_API}/addresses/${walletAddress}/token-balances?type=ERC-20`,
      { signal: AbortSignal.timeout(4000) },
    )
    if (!res.ok) return []
    const data = (await res.json()) as { items?: ArcscanTokenItem[] }
    if (!Array.isArray(data.items)) return []
    return data.items
      .map((item) => item.token?.address ?? '')
      .filter((a): a is `0x${string}` => isAddress(a))
      .slice(0, 30) // safety cap
  } catch {
    return []
  }
}

// ---- Main: get all balances ----
export async function getAllBalances(walletAddress: string): Promise<TokenBalance[]> {
  if (!isAddress(walletAddress)) throw new Error('Invalid address')
  const addr = walletAddress as `0x${string}`

  // 1. Start with the known token list
  const knownAddresses = KNOWN_TOKENS.map((t) => t.address)

  // 2. Discover extra tokens via Arcscan (fire in parallel, don't block)
  const discovered = await discoverTokensFromExplorer(walletAddress)

  // Merge, deduplicate (lowercase comparison), known tokens first
  const knownSet = new Set(knownAddresses.map((a) => a.toLowerCase()))
  const extra = discovered.filter((a) => !knownSet.has(a.toLowerCase()))
  const allAddresses: `0x${string}`[] = [...knownAddresses, ...extra]

  // 3. Read all balances in parallel
  const results = await Promise.all(
    allAddresses.map((tokenAddr) => readTokenBalance(tokenAddr, addr)),
  )

  // 4. Mark discovered (non-known) tokens as unverified
  return results.map((r, i) => ({
    ...r,
    verified: i < knownAddresses.length,
  }))
}

// ---- Single token balance (for the agent tool) ----
export async function getTokenBalance(
  walletAddress: string,
  tokenAddress: string,
): Promise<TokenBalance> {
  if (!isAddress(walletAddress) || !isAddress(tokenAddress)) throw new Error('Invalid address')
  return readTokenBalance(tokenAddress as `0x${string}`, walletAddress as `0x${string}`)
}

// ---- Validate and read a custom token ----
export async function validateCustomToken(tokenAddress: string): Promise<{
  valid: boolean
  symbol?: string
  name?: string
  decimals?: number
  error?: string
}> {
  if (!isAddress(tokenAddress)) return { valid: false, error: 'Invalid address format' }
  const addr = tokenAddress as `0x${string}`
  try {
    const bytecode = await publicClient.getBytecode({ address: addr })
    if (!bytecode || bytecode === '0x' || bytecode.length <= 2) {
      return { valid: false, error: 'No contract at this address' }
    }
    const info = await readTokenInfo(addr)
    return { valid: true, ...info }
  } catch (err) {
    return { valid: false, error: (err as Error).message.slice(0, 200) }
  }
}

// ---- Tx history (multi-token: scan all known tokens) ----
const TRANSFER_EVENT = {
  type: 'event' as const,
  name: 'Transfer',
  inputs: [
    { name: 'from', type: 'address' as const, indexed: true },
    { name: 'to', type: 'address' as const, indexed: true },
    { name: 'value', type: 'uint256' as const, indexed: false },
  ],
}

export async function getTxHistory(walletAddress: string, limit: number): Promise<TxRecord[]> {
  if (!isAddress(walletAddress)) throw new Error('Invalid address')
  const addr = walletAddress as `0x${string}`

  const latestBlock = await publicClient.getBlockNumber()
  const fromBlock = latestBlock > 50000n ? latestBlock - 50000n : 0n

  // Scan all known token contracts for Transfer events
  const logPromises = KNOWN_TOKENS.flatMap((token) => [
    publicClient.getLogs({ address: token.address, event: TRANSFER_EVENT, args: { from: addr }, fromBlock, toBlock: 'latest' }),
    publicClient.getLogs({ address: token.address, event: TRANSFER_EVENT, args: { to: addr }, fromBlock, toBlock: 'latest' }),
  ])

  const logArrays = await Promise.allSettled(logPromises)
  const allLogs = logArrays
    .filter((r): r is PromiseFulfilledResult<typeof logArrays[0] extends PromiseFulfilledResult<infer T> ? T : never> => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .sort((a, b) => Number(b.blockNumber ?? 0n) - Number(a.blockNumber ?? 0n))
    .slice(0, limit)

  const blockNums = [...new Set(allLogs.map((l) => l.blockNumber).filter(Boolean))]
  const blocks = await Promise.all(blockNums.map((bn) => publicClient.getBlock({ blockNumber: bn! })))
  const blockTimestampMap = new Map(blocks.map((b) => [b.number.toString(), Number(b.timestamp)]))

  const txs: TxRecord[] = await Promise.all(
    allLogs.map(async (log) => {
      const value = log.args?.value as bigint | undefined
      const from = (log.args?.from as string) ?? ''
      const to = (log.args?.to as string) ?? ''
      const contractAddr = (log.address ?? '').toLowerCase()
      const known = KNOWN_TOKEN_MAP.get(contractAddr)

      // Read decimals from chain (not hardcoded)
      let decimals = 6
      let tokenSymbol = known?.name ?? 'TOKEN'
      try {
        const info = await readTokenInfo(log.address as `0x${string}`)
        decimals = info.decimals
        tokenSymbol = info.symbol
      } catch { /* use defaults */ }

      let status: 'success' | 'failed' | 'pending' = 'success'
      let gasUsed: string | undefined
      let gasPrice: string | undefined
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: log.transactionHash! })
        status = receipt.status === 'success' ? 'success' : 'failed'
        gasUsed = receipt.gasUsed.toString()
        gasPrice = receipt.effectiveGasPrice ? formatUnits(receipt.effectiveGasPrice, 9) + ' Gwei' : undefined
      } catch { /* ignore */ }

      const ts = blockTimestampMap.get(log.blockNumber?.toString() ?? '') ?? Math.floor(Date.now() / 1000)
      const formatted = value != null ? parseFloat(formatUnits(value, decimals)) : null

      return {
        hash: log.transactionHash ?? '',
        from,
        to,
        value: formatted != null ? `${formatted.toFixed(decimals > 6 ? 8 : 6)} ${tokenSymbol}` : `? ${tokenSymbol}`,
        token: tokenSymbol,
        timestamp: ts * 1000,
        status,
        gasUsed,
        gasPrice,
        explorerUrl: `${ARC_EXPLORER}/tx/${log.transactionHash ?? ''}`,
      }
    }),
  )

  return txs
}

// ---- Tx status ----
export async function getTxStatus(hash: string): Promise<TxRecord> {
  const h = hash as `0x${string}`
  const [tx, receipt] = await Promise.all([
    publicClient.getTransaction({ hash: h }),
    publicClient.getTransactionReceipt({ hash: h }).catch(() => null),
  ])

  let status: 'success' | 'failed' | 'pending' = 'pending'
  let gasUsed: string | undefined
  if (receipt) {
    status = receipt.status === 'success' ? 'success' : 'failed'
    gasUsed = receipt.gasUsed.toString()
  }

  const block = tx.blockNumber
    ? await publicClient.getBlock({ blockNumber: tx.blockNumber })
    : null
  const ts = block ? Number(block.timestamp) * 1000 : Date.now()

  return {
    hash,
    from: tx.from,
    to: tx.to ?? '',
    value: tx.value ? formatUnits(tx.value, 18) : '0',
    token: 'USDC',
    timestamp: ts,
    status,
    gasUsed,
    explorerUrl: `${ARC_EXPLORER}/tx/${hash}`,
  }
}

// ---- Gas estimate (token-aware) ----
export async function estimateGasForSend(
  from: string,
  to: string,
  amount: string,
  tokenAddress = USDC_ADDRESS,
): Promise<{ gasCost: string; hasEnough: boolean; walletBalance: string; token: string }> {
  if (!isAddress(from) || !isAddress(to)) throw new Error('Invalid address')
  const fromAddr = from as `0x${string}`
  const toAddr = to as `0x${string}`
  const tokenAddr = tokenAddress as `0x${string}`

  // Read decimals live
  const [tokenInfo, tokenBal] = await Promise.all([
    readTokenInfo(tokenAddr),
    readTokenBalance(tokenAddr, fromAddr),
  ])

  const amountWei = parseUnits(amount, tokenInfo.decimals)

  const [gasEstimate, gasPrice] = await Promise.all([
    publicClient.estimateContractGas({
      address: tokenAddr,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [toAddr, amountWei],
      account: fromAddr,
    }).catch(() => 65000n),
    publicClient.getGasPrice(),
  ])

  // On Arc, gas is paid in USDC (native)
  const gasCostNative = gasEstimate * gasPrice
  const gasCostUsdc = parseFloat(formatUnits(gasCostNative, 18)) // 18 = native USDC decimals on Arc
  const totalNeeded = parseFloat(amount) + gasCostUsdc
  const walletBal = parseFloat(tokenBal.balance)

  return {
    gasCost: gasCostUsdc.toFixed(8) + ' USDC (gas)',
    hasEnough: walletBal >= totalNeeded,
    walletBalance: tokenBal.balance + ' ' + tokenInfo.symbol,
    token: tokenInfo.symbol,
  }
}

// ---- Address checker ----
export async function checkAddress(address: string): Promise<AddressInfo> {
  if (!isAddress(address)) throw new Error('Invalid address')
  const addr = address as `0x${string}`

  const [bytecode, nonce, usdcBal] = await Promise.all([
    publicClient.getBytecode({ address: addr }),
    publicClient.getTransactionCount({ address: addr }),
    readTokenBalance(USDC_ADDRESS, addr).catch(() => null),
  ])

  const isContract = bytecode !== undefined && bytecode !== '0x' && bytecode.length > 2
  const riskFlags: string[] = []
  if (isContract) riskFlags.push('This is a smart contract — verify before sending funds')
  if (nonce === 0) riskFlags.push('New address — never used before on Arc Testnet')

  return {
    address,
    isContract,
    balance: usdcBal?.balance ? usdcBal.balance + ' USDC' : '0 USDC',
    txCount: nonce,
    riskFlags,
  }
}
