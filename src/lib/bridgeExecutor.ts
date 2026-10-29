/**
 * bridgeExecutor — executes a bridge transfer client-side using Circle's App Kit
 * with the testnet private key from localStorage.
 *
 * The private key NEVER leaves the browser. All signing happens here.
 *
 * Token support:
 *   USDC  — CCTP, all supported chains
 *   EURC  — CCTPx, EVM-to-EVM only (Ethereum, Base, Arc, etc.)
 *   cirBTC — CCTPx, Ethereum <-> Arc only
 *
 * Chain identifiers used by App Kit (string, not numeric IDs):
 *   Arc_Testnet, Ethereum_Sepolia, Base_Sepolia, Avalanche_Fuji,
 *   Arbitrum_Sepolia, OP_Sepolia
 */
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromPrivateKey } from '@circle-fin/adapter-viem-v2'

// ---- Chain identifier map (display name → App Kit chain string) ----
export const BRIDGE_CHAIN_MAP: Record<string, string> = {
  'arc testnet':        'Arc_Testnet',
  'ethereum sepolia':   'Ethereum_Sepolia',
  'base sepolia':       'Base_Sepolia',
  'avalanche fuji':     'Avalanche_Fuji',
  'arbitrum sepolia':   'Arbitrum_Sepolia',
  'op sepolia':         'OP_Sepolia',
  'optimism sepolia':   'OP_Sepolia',
}

/** Normalise a user-provided chain name to the App Kit identifier */
export function resolveChain(name: string): string | undefined {
  return BRIDGE_CHAIN_MAP[name.toLowerCase().trim()]
}

// ---- Supported token/chain combinations (from Circle docs) ----
// USDC: all CCTP chains
// EURC: Ethereum <-> Arc, Ethereum <-> Base, Base <-> Arc (EVM only)
// cirBTC: Ethereum <-> Arc only
export const TOKEN_ROUTE_MAP: Record<string, string[]> = {
  USDC:   ['Arc_Testnet', 'Ethereum_Sepolia', 'Base_Sepolia', 'Avalanche_Fuji', 'Arbitrum_Sepolia', 'OP_Sepolia'],
  EURC:   ['Arc_Testnet', 'Ethereum_Sepolia', 'Base_Sepolia'],
  cirBTC: ['Arc_Testnet', 'Ethereum_Sepolia'],
}

export function getSupportedDestinations(token: string, sourceChain: string): string[] {
  const routes = TOKEN_ROUTE_MAP[token.toUpperCase()]
  if (!routes) return []
  return routes.filter((c) => c !== sourceChain)
}

// ---- Bridge step type ----
export interface BridgeStep {
  name: string         // 'approve' | 'burn'/'transfer' | 'fetchAttestation' | 'mint'/'forward'
  state: 'pending' | 'active' | 'success' | 'failed'
  txHash?: string
  explorerUrl?: string
}

export interface BridgeProgress {
  state: 'idle' | 'running' | 'success' | 'failed'
  steps: BridgeStep[]
  warnings: string[]
  sourceTxHash?: string
  destTxHash?: string
  error?: string
}

export type BridgeProgressCallback = (progress: BridgeProgress) => void

// ---- Main bridge executor ----
export async function executeBridge(
  token: string,        // 'USDC', 'EURC', 'cirBTC'
  amount: string,       // human-readable, e.g. '10.0'
  sourceChain: string,  // App Kit chain string, e.g. 'Arc_Testnet'
  destChain: string,    // App Kit chain string, e.g. 'Ethereum_Sepolia'
  recipientAddress: string | undefined,
  onProgress: BridgeProgressCallback,
): Promise<{ sourceTxHash: string; destTxHash?: string }> {
  const pk = localStorage.getItem('chatpay_testnet_pk') as `0x${string}` | null
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error('No testnet wallet found. Set up a testnet wallet first.')
  }

  const adapter = createViemAdapterFromPrivateKey({ privateKey: pk })
  const kit = new AppKit()

  // Initial progress
  onProgress({ state: 'running', steps: [], warnings: [] })

  const bridgeParams = {
    from: { adapter, chain: sourceChain as Parameters<typeof kit.bridge>[0]['from']['chain'] },
    to: {
      adapter,
      chain: destChain as Parameters<typeof kit.bridge>[0]['to']['chain'],
      ...(recipientAddress ? { recipientAddress } : {}),
    },
    amount,
    token: token as Parameters<typeof kit.bridge>[0]['token'],
    config: { transferSpeed: 'FAST' as const },
  }

  // Subscribe to step events for live progress updates
  // Using type assertion for App Kit's event emitter — event names are string literals
  const steps: BridgeStep[] = []
  type AnyEvent = (e: { state?: string; txHash?: string }) => void
  const kitAny = kit as unknown as { on: (event: string, cb: AnyEvent) => void }

  kitAny.on('bridge.approve', (e) => {
    upsertStep(steps, 'approve', e.state === 'success' ? 'success' : 'active', e.txHash)
    onProgress({ state: 'running', steps: [...steps], warnings: [] })
  })
  kitAny.on('bridge.burn', (e) => {
    upsertStep(steps, 'burn (source chain)', e.state === 'success' ? 'success' : 'active', e.txHash)
    onProgress({ state: 'running', steps: [...steps], warnings: [] })
  })
  kitAny.on('bridge.transfer', (e) => {
    upsertStep(steps, 'transfer (source chain)', e.state === 'success' ? 'success' : 'active', e.txHash)
    onProgress({ state: 'running', steps: [...steps], warnings: [] })
  })
  kitAny.on('bridge.fetchAttestation', (e) => {
    upsertStep(steps, 'attestation (Circle)', e.state === 'success' ? 'success' : 'active')
    onProgress({ state: 'running', steps: [...steps], warnings: [], sourceTxHash: findTxHash(steps, 'burn (source chain)') ?? findTxHash(steps, 'transfer (source chain)') })
  })
  kitAny.on('bridge.mint', (e) => {
    upsertStep(steps, 'mint (destination chain)', e.state === 'success' ? 'success' : 'active', e.txHash)
    onProgress({ state: 'running', steps: [...steps], warnings: [] })
  })
  kitAny.on('bridge.forward', (e) => {
    upsertStep(steps, 'forward (destination chain)', e.state === 'success' ? 'success' : 'active', e.txHash)
    onProgress({ state: 'running', steps: [...steps], warnings: [] })
  })

  const result = await kit.bridge(bridgeParams)

  // Collect warnings
  const warnings: string[] = (result.warnings ?? []).map((w: { code?: string; message?: string }) =>
    w.code === 'QUOTE_NOT_REUSED'
      ? 'Fee may differ slightly from the quoted amount (quote was refreshed)'
      : w.code === 'SPEED_DOWNGRADED'
        ? 'Transfer speed was downgraded to SLOW (FAST allowance exceeded)'
        : w.message ?? w.code ?? 'Unknown warning'
  )

  // Find source and destination tx hashes from steps
  const sourceTxHash = (
    findTxHashFromResult(result, 'burn') ??
    findTxHashFromResult(result, 'transfer') ??
    findTxHash(steps, 'burn (source chain)') ??
    findTxHash(steps, 'transfer (source chain)') ??
    ''
  )
  const destTxHash = (
    findTxHashFromResult(result, 'mint') ??
    findTxHashFromResult(result, 'forward') ??
    findTxHash(steps, 'mint (destination chain)') ??
    findTxHash(steps, 'forward (destination chain)')
  )

  if (result.state !== 'success') {
    onProgress({ state: 'failed', steps: [...steps], warnings, sourceTxHash, destTxHash, error: `Bridge ended with state: ${String(result.state)}` })
    throw new Error(`Bridge failed: state=${String(result.state)}`)
  }

  onProgress({ state: 'success', steps: [...steps], warnings, sourceTxHash, destTxHash })
  return { sourceTxHash, destTxHash: destTxHash ?? undefined }
}

// ---- Helpers ----
function upsertStep(steps: BridgeStep[], name: string, state: BridgeStep['state'], txHash?: string) {
  const existing = steps.find((s) => s.name === name)
  if (existing) {
    existing.state = state
    if (txHash) existing.txHash = txHash
  } else {
    steps.push({
      name,
      state,
      txHash,
      explorerUrl: txHash ? `https://explorer.testnet.arc.io/tx/${txHash}` : undefined,
    })
  }
}

function findTxHash(steps: BridgeStep[], name: string): string | undefined {
  return steps.find((s) => s.name === name)?.txHash
}

function findTxHashFromResult(result: unknown, stepName: string): string | undefined {
  const r = result as { steps?: Array<{ name?: string; txHash?: string }> } | null
  return r?.steps?.find((s) => s.name === stepName)?.txHash
}
