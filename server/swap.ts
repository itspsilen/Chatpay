/**
 * Server-side swap preparation tool.
 * Returns a preview card with a Uniswap V2 quote from Arc Testnet.
 * Actual signing happens client-side in swapExecutor.ts.
 *
 * DEX: community-deployed Uniswap V2 on Arc Testnet
 * Source: https://github.com/osr21/arc-swap (community project, not Circle-official)
 * Supported pairs: USDC <-> EURC (the only deployed pool)
 */
import { createPublicClient, http, parseUnits, formatUnits, erc20Abi } from 'viem'
import { arcTestnet } from 'viem/chains'
import type { TransactionPreview } from '../src/lib/types.js'

// Community-deployed Uniswap V2 on Arc Testnet
// Source: https://github.com/osr21/arc-swap — not audited by Circle
const UNISWAP_V2_ROUTER = '0xe27d5d256b370604f1ff060fb489c6a8e3f8a6d9' as `0x${string}` // arc-studio-allow-onchain-literal

// Arc Testnet token addresses — from Circle's official docs
// USDC: Circle USDC predeploy on Arc (all networks), decimals=6
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as `0x${string}` // arc-studio-allow-onchain-literal
// EURC: from https://developers.circle.com/stablecoins/eurc-contract-addresses
const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as `0x${string}` // arc-studio-allow-onchain-literal

const proxyChains = (process.env.RPC_PROXY_CHAINS ?? '').split(',')
const ARC_RPC = process.env.RPC_PROXY_BASE_URL && proxyChains.includes('Arc_Testnet')
  ? `${process.env.RPC_PROXY_BASE_URL}/api/rpc/Arc_Testnet?_rpc_token=${process.env.RPC_PROXY_TOKEN}`
  : process.env.ARC_RPC_URL ?? arcTestnet.rpcUrls.default.http[0]

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
] as const

const SUPPORTED_PAIRS = [
  { from: 'USDC', to: 'EURC', path: [USDC_ADDRESS, EURC_ADDRESS] as `0x${string}`[] },
  { from: 'EURC', to: 'USDC', path: [EURC_ADDRESS, USDC_ADDRESS] as `0x${string}`[] },
]

interface SwapArgs {
  fromToken: string
  toToken: string
  amount: string
  slippageBps?: number
}

export async function prepareSwap(args: SwapArgs): Promise<TransactionPreview> {
  const fromToken = (args.fromToken ?? 'USDC').toUpperCase().trim()
  const toToken   = (args.toToken   ?? 'EURC').toUpperCase().trim()
  const amount    = args.amount ?? '0'
  const slippageBps = args.slippageBps ?? 50   // 0.5% default

  const riskWarnings = [
    'Arc Testnet — test tokens only, no real value',
    'Community-deployed Uniswap V2 — not audited or endorsed by Circle',
    'Liquidity may be limited. Confirm the price impact before proceeding.',
  ]

  // Validate pair
  const pair = SUPPORTED_PAIRS.find((p) => p.from === fromToken && p.to === toToken)
  if (!pair) {
    const supported = SUPPORTED_PAIRS.map((p) => `${p.from}→${p.to}`).join(', ')
    return errorPreview(
      `Swap pair ${fromToken}→${toToken} is not available on Arc Testnet. Supported: ${supported}.`,
      riskWarnings,
    )
  }

  const amountNum = parseFloat(amount)
  if (isNaN(amountNum) || amountNum <= 0) {
    return errorPreview('Please provide a valid amount greater than 0.', riskWarnings)
  }

  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) })

  try {
    const [fromDecimalsRaw, toDecimalsRaw] = await Promise.all([
      publicClient.readContract({ address: pair.path[0], abi: erc20Abi, functionName: 'decimals' }),
      publicClient.readContract({ address: pair.path[1], abi: erc20Abi, functionName: 'decimals' }),
    ])
    const fromDecimals = Number(fromDecimalsRaw)
    const toDecimals   = Number(toDecimalsRaw)

    const amountInWei = parseUnits(amount, fromDecimals)
    const amounts = await publicClient.readContract({
      address: UNISWAP_V2_ROUTER,
      abi: ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountInWei, pair.path],
    }) as bigint[]

    const amountOutWei = amounts[amounts.length - 1]
    const amountOutMinWei = (amountOutWei * BigInt(10000 - slippageBps)) / 10000n

    const amountOut = parseFloat(formatUnits(amountOutWei, toDecimals))
    const amountOutMinHuman = parseFloat(formatUnits(amountOutMinWei, toDecimals))

    const priceImpact = amountNum > 0
      ? (Math.abs(1 - amountOut / amountNum) * 100).toFixed(2)
      : '0.00'

    if (parseFloat(priceImpact) > 5) {
      riskWarnings.push(`High price impact: ${priceImpact}%. Consider a smaller amount.`)
    }

    const swapQuote = {
      amountIn:     amountNum.toFixed(fromDecimals > 6 ? 8 : 6),
      amountOut:    amountOut.toFixed(toDecimals > 6 ? 8 : 6),
      amountOutMin: amountOutMinHuman.toFixed(toDecimals > 6 ? 8 : 6),
      priceImpact,
      path: pair.path,
      fromToken,
      toToken,
      fromDecimals,
      toDecimals,
    }

    return {
      id: crypto.randomUUID(),
      action: 'swap',
      token: `${fromToken} → ${toToken}`,
      amount: `${amountNum.toFixed(fromDecimals > 6 ? 8 : 6)} ${fromToken}`,
      fees: '~0.3% LP fee + gas (USDC on Arc)',
      feeToken: 'USDC',
      network: 'Arc Testnet',
      estimatedPrice: `1 ${fromToken} ≈ ${amountNum > 0 ? (amountOut / amountNum).toFixed(6) : '?'} ${toToken}`,
      slippage: `${(slippageBps / 100).toFixed(1)}%`,
      swapQuote,
      riskWarnings,
      perTradeCap: 50,
      dailyCap: 100,
      dailySpent: 0,
    }
  } catch (err) {
    const msg = (err as Error).message ?? ''
    const isLiquidity = msg.toLowerCase().includes('insufficient_liquidity') || msg.toLowerCase().includes('insufficient liquidity')
    riskWarnings.push(isLiquidity
      ? 'Insufficient liquidity in the USDC/EURC pool for this amount.'
      : `Quote failed: ${msg.slice(0, 100)}`
    )
    return errorPreview(
      isLiquidity
        ? `Not enough liquidity for ${amount} ${fromToken}. Try a smaller amount.`
        : 'Could not get a quote from the DEX. The pool may be unavailable.',
      riskWarnings,
    )
  }
}

function errorPreview(message: string, riskWarnings: string[]): TransactionPreview {
  return {
    id: crypto.randomUUID(),
    action: 'swap',
    token: '',
    amount: '0',
    fees: 'N/A',
    network: 'Arc Testnet',
    riskWarnings: [...riskWarnings, `Error: ${message}`],
    perTradeCap: 50,
    dailyCap: 100,
    dailySpent: 0,
  }
}
