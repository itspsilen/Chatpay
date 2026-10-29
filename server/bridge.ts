/**
 * Server-side bridge preparation tool.
 * Validates inputs and returns a preview card with fee estimates.
 * Actual signing happens client-side in bridgeExecutor.ts.
 *
 * Uses Circle App Kit for fee estimation (no private key needed).
 */
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromPrivateKey } from '@circle-fin/adapter-viem-v2'
import type { TransactionPreview } from '../src/lib/types'

// Chain identifier map (normalised input → App Kit string)
const CHAIN_MAP: Record<string, string> = {
  'arc testnet':       'Arc_Testnet',
  'arc_testnet':       'Arc_Testnet',
  'ethereum sepolia':  'Ethereum_Sepolia',
  'ethereum_sepolia':  'Ethereum_Sepolia',
  'eth sepolia':       'Ethereum_Sepolia',
  'base sepolia':      'Base_Sepolia',
  'base_sepolia':      'Base_Sepolia',
  'avalanche fuji':    'Avalanche_Fuji',
  'avalanche_fuji':    'Avalanche_Fuji',
  'avax fuji':         'Avalanche_Fuji',
  'arbitrum sepolia':  'Arbitrum_Sepolia',
  'arbitrum_sepolia':  'Arbitrum_Sepolia',
  'arb sepolia':       'Arbitrum_Sepolia',
  'op sepolia':        'OP_Sepolia',
  'op_sepolia':        'OP_Sepolia',
  'optimism sepolia':  'OP_Sepolia',
}

function resolveChain(name: string): string | undefined {
  return CHAIN_MAP[name.toLowerCase().trim()]
}

// Supported token/route combinations per Circle docs
const TOKEN_ROUTES: Record<string, string[]> = {
  USDC:   ['Arc_Testnet', 'Ethereum_Sepolia', 'Base_Sepolia', 'Avalanche_Fuji', 'Arbitrum_Sepolia', 'OP_Sepolia'],
  EURC:   ['Arc_Testnet', 'Ethereum_Sepolia', 'Base_Sepolia'],
  cirBTC: ['Arc_Testnet', 'Ethereum_Sepolia'],
}

// Display names for chains
const CHAIN_DISPLAY: Record<string, string> = {
  Arc_Testnet:      'Arc Testnet',
  Ethereum_Sepolia: 'Ethereum Sepolia',
  Base_Sepolia:     'Base Sepolia',
  Avalanche_Fuji:   'Avalanche Fuji',
  Arbitrum_Sepolia: 'Arbitrum Sepolia',
  OP_Sepolia:       'OP Sepolia',
}

interface BridgePreviewArgs {
  token: string
  amount: string
  destinationChain: string
  recipientAddress?: string
  walletAddress?: string
}

export async function prepareBridge(args: BridgePreviewArgs): Promise<TransactionPreview> {
  const token = (args.token ?? 'USDC').toUpperCase().trim()
  const amount = args.amount ?? '0'
  const destRaw = args.destinationChain ?? ''
  const destChain = resolveChain(destRaw)

  const riskWarnings: string[] = [
    'Arc Testnet — test tokens only, no real value',
  ]

  // Validate token
  if (!TOKEN_ROUTES[token]) {
    return errorPreview(`Token "${token}" is not supported for bridging. Supported: USDC, EURC, cirBTC.`, riskWarnings)
  }

  // Validate destination chain
  if (!destChain) {
    const supported = Object.keys(CHAIN_MAP)
      .filter((k) => !k.includes('_'))
      .map((k) => CHAIN_MAP[k])
    const uniqueSupported = [...new Set(supported)].map((c) => CHAIN_DISPLAY[c] ?? c)
    return errorPreview(
      `I don't recognise "${destRaw}" as a destination chain. Supported: ${uniqueSupported.join(', ')}.`,
      riskWarnings,
    )
  }

  // Source is always Arc Testnet in this app
  const sourceChain = 'Arc_Testnet'

  if (destChain === sourceChain) {
    return errorPreview('Source and destination chains must be different.', riskWarnings)
  }

  // Validate route for this token
  const allowedDests = TOKEN_ROUTES[token].filter((c) => c !== sourceChain)
  if (!allowedDests.includes(destChain)) {
    return errorPreview(
      `${token} cannot be bridged to ${CHAIN_DISPLAY[destChain] ?? destChain} from Arc Testnet. ` +
      `Supported destinations for ${token}: ${allowedDests.map((c) => CHAIN_DISPLAY[c] ?? c).join(', ')}.`,
      riskWarnings,
    )
  }

  // Amount validation
  const amountNum = parseFloat(amount)
  if (isNaN(amountNum) || amountNum <= 0) {
    return errorPreview('Please provide a valid amount greater than 0.', riskWarnings)
  }
  if (amountNum > 100) riskWarnings.push('Large amount — double-check before confirming')

  // Protocol notes
  const isUsdc = token === 'USDC'
  const protocolName = isUsdc ? 'CCTP v2' : 'CCTPx'
  const estimatedTime = isUsdc ? '~20 seconds (FAST mode)' : '~30–60 seconds (FAST mode, relayer-minted)'

  // Estimate fee using App Kit
  let feeDescription = 'Calculating…'
  let feeToken = 'USDC'
  try {
    // Use a dummy adapter — estimation doesn't need a real key
    const dummyPk = '0x' + '1'.repeat(64) as `0x${string}`
    const adapter = createViemAdapterFromPrivateKey({ privateKey: dummyPk })
    const kit = new AppKit()
    const estimate = await kit.estimateBridge({
      from: { adapter, chain: sourceChain as Parameters<typeof kit.estimateBridge>[0]['from']['chain'] },
      to:   { adapter, chain: destChain  as Parameters<typeof kit.estimateBridge>[0]['to']['chain'] },
      amount,
      token: token as Parameters<typeof kit.estimateBridge>[0]['token'],
    })
    // estimate.fees is an array of { type, amount, token }
    const fees = (estimate as { fees?: Array<{ type?: string; amount?: string | null; token?: string }> }).fees ?? []
    if (fees.length > 0) {
      const feeLines = fees
        .filter((f) => f.amount != null)
        .map((f) => `${f.amount ?? '?'} ${f.token ?? ''}`.trim())
      feeDescription = feeLines.length > 0 ? feeLines.join(' + ') : 'Fee data unavailable'
      feeToken = fees[0]?.token ?? 'USDC'
    } else {
      feeDescription = 'Gas only (USDC on Arc)'
    }
  } catch (err) {
    const msg = (err as Error).message ?? ''
    if (msg.includes('INPUT_UNSUPPORTED_ROUTE') || msg.includes('UNSUPPORTED_ROUTE')) {
      riskWarnings.push(`Route ${sourceChain} → ${destChain} for ${token} is not listed in Circle's registry. This bridge may not work.`)
      feeDescription = 'Route not confirmed by registry'
    } else {
      feeDescription = 'Could not estimate fee (fee estimation service unavailable)'
    }
  }

  return {
    id: crypto.randomUUID(),
    action: 'bridge',
    token,
    amount: `${amountNum.toFixed(token === 'cirBTC' ? 8 : 2)} ${token}`,
    fees: feeDescription,
    feeToken,
    sourceChain,
    destinationChain: destChain,
    destination: args.recipientAddress,
    network: `${CHAIN_DISPLAY[sourceChain]} → ${CHAIN_DISPLAY[destChain] ?? destChain}`,
    estimatedTime,
    riskWarnings: [
      ...riskWarnings,
      `Protocol: ${protocolName}`,
      'Same token received on destination chain',
    ],
    perTradeCap: 50,
    dailyCap: 100,
    dailySpent: 0,
  }
}

function errorPreview(message: string, riskWarnings: string[]): TransactionPreview {
  return {
    id: crypto.randomUUID(),
    action: 'bridge',
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
