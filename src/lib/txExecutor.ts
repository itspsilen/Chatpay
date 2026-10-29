/**
 * Testnet transaction executor.
 * Routes transactions to the correct executor based on action type.
 * The private key NEVER leaves the browser.
 */
import { createWalletClient, createPublicClient, http, erc20Abi, parseUnits, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import type { TransactionPreview } from './types'
import { executeSwap } from './swapExecutor'
import type { BridgeProgressCallback } from './bridgeExecutor'

const ARC_RPC = 'https://rpc.testnet.arc.io'
// Token decimals read at runtime, but for ERC-20 transfer we always use the preview's token
// For USDC on Arc, decimals = 6
const USDC_DECIMALS = 6

function getWalletClient() {
  const pk = localStorage.getItem('chatpay_testnet_pk') as `0x${string}` | null
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error('No testnet wallet found. Go back and set up a testnet wallet.')
  }
  const account = privateKeyToAccount(pk)
  return {
    walletClient: createWalletClient({ account, chain: arcTestnet, transport: http(ARC_RPC) }),
    publicClient: createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) }),
    account,
  }
}

export interface TxResult {
  hash: `0x${string}`
  explorerUrl: string
}

/**
 * Execute a non-bridge transaction (send, mint).
 * For bridge, call executeBridge from bridgeExecutor.ts directly.
 * For swap, call executeSwap from swapExecutor.ts directly.
 */
export async function executeTransaction(
  preview: TransactionPreview,
  onBridgeProgress?: BridgeProgressCallback,
): Promise<TxResult> {
  if (preview.action === 'bridge') {
    // Delegate to bridgeExecutor (dynamic import to keep bundle small)
    if (!preview.sourceChain || !preview.destinationChain) {
      throw new Error('Bridge preview is missing source or destination chain.')
    }
    const { executeBridge } = await import('./bridgeExecutor')
    const result = await executeBridge(
      preview.token.replace(/\s+.*$/, ''),  // strip amount suffix if present
      preview.amount.replace(/[^0-9.]/g, ''),
      preview.sourceChain,
      preview.destinationChain,
      preview.destination,
      onBridgeProgress ?? (() => undefined),
    )
    return {
      hash: result.sourceTxHash as `0x${string}`,
      explorerUrl: `https://explorer.testnet.arc.io/tx/${result.sourceTxHash}`,
    }
  }

  if (preview.action === 'swap') {
    if (!preview.swapQuote) throw new Error('Swap preview is missing quote data.')
    const result = await executeSwap(preview.swapQuote)
    return { hash: result.hash, explorerUrl: result.explorerUrl }
  }

  const { walletClient, publicClient, account } = getWalletClient()
  let hash: `0x${string}`

  if (preview.action === 'send') {
    const dest = preview.destination
    if (!dest || !isAddress(dest)) throw new Error('Invalid destination address for send.')

    // Determine token address and decimals from preview
    const tokenAddress = resolveTokenAddress(preview.token)
    const decimals = resolveTokenDecimals(preview.token)
    const amountStr = preview.amount.replace(/[^0-9.]/g, '')
    const amount = parseUnits(amountStr, decimals)

    hash = await walletClient.writeContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [dest, amount],
      account,
      chain: arcTestnet,
    })
  } else if (preview.action === 'mint') {
    const contractAddr = preview.contract
    if (!contractAddr || !isAddress(contractAddr)) throw new Error('Invalid mint contract address.')
    const mintAbi = [{
      name: 'mint',
      type: 'function' as const,
      inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
      outputs: [],
      stateMutability: 'nonpayable',
    }] as const
    hash = await walletClient.writeContract({
      address: contractAddr,
      abi: mintAbi,
      functionName: 'mint',
      args: [account.address, BigInt(1)],
      account,
      chain: arcTestnet,
    })
  } else if (preview.action === 'buy' || preview.action === 'sell') {
    throw new Error(
      `${preview.action === 'buy' ? 'Buy' : 'Sell'} is not yet available. Use swap (USDC↔EURC) or send USDC directly.`
    )
  } else {
    throw new Error(`Action "${String(preview.action)}" is not supported.`)
  }

  await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
  return { hash, explorerUrl: `https://explorer.testnet.arc.io/tx/${hash}` }
}

// ---- Token helpers ----
function resolveTokenAddress(tokenSymbol: string): `0x${string}` {
  const s = tokenSymbol.toUpperCase().trim()
  if (s === 'USDC') return '0x3600000000000000000000000000000000000000'
  if (s === 'EURC') return '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
  if (s === 'CIRBTC' || s === 'CIRBTC') return '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF'
  // Default to USDC
  return '0x3600000000000000000000000000000000000000'
}

function resolveTokenDecimals(tokenSymbol: string): number {
  const s = tokenSymbol.toUpperCase().trim()
  if (s === 'CIRBTC') return 8
  return USDC_DECIMALS  // USDC and EURC both 6 decimals
}
