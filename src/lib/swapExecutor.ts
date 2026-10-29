/**
 * swapExecutor — executes a token swap on Arc Testnet using the community-deployed
 * Uniswap V2 router.
 *
 * Contracts (community-deployed, Arc Testnet):
 *   UniswapV2Router02: 0xe27d5d256b370604f1ff060fb489c6a8e3f8a6d9
 *   UniswapV2Factory:  0x7483847d46db2920dd64efa676cf72dcf765814f
 *   USDC/EURC pair:    0xb3685D16AAa06361ED28377b1319136650Fa9A13
 *
 * Source: https://github.com/osr21/arc-swap (community project, not Circle-official)
 * Risk: community-deployed, not audited by Circle. Show warning in UI.
 *
 * Supported pairs: USDC <-> EURC
 *
 * The private key NEVER leaves the browser.
 */
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  isAddress,
  erc20Abi,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'

const ARC_RPC = 'https://rpc.testnet.arc.io'

// Community-deployed Uniswap V2 on Arc Testnet
export const UNISWAP_V2_ROUTER = '0xe27d5d256b370604f1ff060fb489c6a8e3f8a6d9' as `0x${string}`
export const UNISWAP_V2_FACTORY = '0x7483847d46db2920dd64efa676cf72dcf765814f' as `0x${string}`
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as `0x${string}`
export const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as `0x${string}`

/** Supported swap pairs on Arc Testnet */
export const SWAP_PAIRS: Array<{ from: string; to: string; path: `0x${string}`[] }> = [
  { from: 'USDC', to: 'EURC', path: [USDC_ADDRESS, EURC_ADDRESS] },
  { from: 'EURC', to: 'USDC', path: [EURC_ADDRESS, USDC_ADDRESS] },
]

export function getSwapPair(fromSymbol: string, toSymbol: string) {
  return SWAP_PAIRS.find(
    (p) => p.from.toUpperCase() === fromSymbol.toUpperCase() &&
           p.to.toUpperCase() === toSymbol.toUpperCase(),
  )
}

// Minimal Uniswap V2 Router ABI (only what we need)
const ROUTER_ABI = [
  {
    name: 'getAmountsOut',
    type: 'function' as const,
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'swapExactTokensForTokens',
    type: 'function' as const,
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'nonpayable' as const,
  },
] as const

export interface SwapQuote {
  amountIn: string
  amountOut: string
  amountOutMin: string   // after slippage
  priceImpact: string
  path: `0x${string}`[]
  fromToken: string
  toToken: string
  fromDecimals: number
  toDecimals: number
}

/** Get a swap quote from the router */
export async function getSwapQuote(
  fromSymbol: string,
  toSymbol: string,
  amountIn: string,
  slippageBps = 50,   // 0.5%
): Promise<SwapQuote> {
  const pair = getSwapPair(fromSymbol, toSymbol)
  if (!pair) throw new Error(`Swap pair ${fromSymbol}→${toSymbol} is not supported. Only USDC↔EURC is available on Arc Testnet.`)

  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) })

  // Read decimals from both token contracts
  const [fromDecimals, toDecimals] = await Promise.all([
    publicClient.readContract({ address: pair.path[0], abi: erc20Abi, functionName: 'decimals' }),
    publicClient.readContract({ address: pair.path[1], abi: erc20Abi, functionName: 'decimals' }),
  ])

  const amountInWei = parseUnits(amountIn, Number(fromDecimals))

  const amounts = await publicClient.readContract({
    address: UNISWAP_V2_ROUTER,
    abi: ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: [amountInWei, pair.path],
  }) as bigint[]

  const amountOutWei = amounts[amounts.length - 1]
  const amountOutMin = (amountOutWei * BigInt(10000 - slippageBps)) / 10000n

  const amountOutHuman = formatUnits(amountOutWei, Number(toDecimals))
  const amountOutMinHuman = formatUnits(amountOutMin, Number(toDecimals))

  // Rough price impact: compare to spot (no reserves needed, just ratio)
  const inNum = parseFloat(amountIn)
  const outNum = parseFloat(amountOutHuman)
  const priceImpact = inNum > 0 ? (Math.abs(1 - outNum / inNum) * 100).toFixed(2) : '0.00'

  return {
    amountIn,
    amountOut: parseFloat(amountOutHuman).toFixed(Number(toDecimals) > 6 ? 8 : 6),
    amountOutMin: parseFloat(amountOutMinHuman).toFixed(Number(toDecimals) > 6 ? 8 : 6),
    priceImpact,
    path: pair.path,
    fromToken: fromSymbol.toUpperCase(),
    toToken: toSymbol.toUpperCase(),
    fromDecimals: Number(fromDecimals),
    toDecimals: Number(toDecimals),
  }
}

export interface SwapResult {
  hash: `0x${string}`
  explorerUrl: string
  amountIn: string
  amountOut: string
}

/** Execute the swap — called only after the user confirms the preview card */
export async function executeSwap(quote: SwapQuote): Promise<SwapResult> {
  const pk = localStorage.getItem('chatpay_testnet_pk') as `0x${string}` | null
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error('No testnet wallet found. Set up a testnet wallet first.')
  }
  const account = privateKeyToAccount(pk)
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(ARC_RPC) })
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) })

  if (!isAddress(account.address)) throw new Error('Invalid wallet address')

  const amountInWei = parseUnits(quote.amountIn, quote.fromDecimals)
  const amountOutMinWei = parseUnits(quote.amountOutMin, quote.toDecimals)

  // 1. Approve the router to spend the input token
  const tokenIn = quote.path[0]
  const approveHash = await walletClient.writeContract({
    address: tokenIn,
    abi: erc20Abi,
    functionName: 'approve',
    args: [UNISWAP_V2_ROUTER, amountInWei],
    account,
    chain: arcTestnet,
  })
  await publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: 30_000 })

  // 2. Execute the swap
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)  // 5 min deadline
  const swapHash = await walletClient.writeContract({
    address: UNISWAP_V2_ROUTER,
    abi: ROUTER_ABI,
    functionName: 'swapExactTokensForTokens',
    args: [amountInWei, amountOutMinWei, quote.path, account.address, deadline],
    account,
    chain: arcTestnet,
  })
  await publicClient.waitForTransactionReceipt({ hash: swapHash, timeout: 60_000 })

  return {
    hash: swapHash,
    explorerUrl: `https://explorer.testnet.arc.io/tx/${swapHash}`,
    amountIn: `${quote.amountIn} ${quote.fromToken}`,
    amountOut: `~${quote.amountOut} ${quote.toToken}`,
  }
}
