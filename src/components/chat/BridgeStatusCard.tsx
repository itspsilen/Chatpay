/**
 * BridgeStatusCard — shows live multi-step progress of a CCTP/CCTPx bridge transfer.
 * Steps: approve → burn/transfer → attestation → mint/forward
 */
import { CheckCircle2, Circle, Loader2, XCircle, ExternalLink } from 'lucide-react'
import type { BridgeProgress, BridgeStep } from '../../lib/bridgeExecutor'

interface Props {
  progress: BridgeProgress
  token: string
  amount: string
  sourceChain: string
  destChain: string
}

const CHAIN_DISPLAY: Record<string, string> = {
  Arc_Testnet:       'Arc Testnet',
  Ethereum_Sepolia:  'Ethereum Sepolia',
  Base_Sepolia:      'Base Sepolia',
  Avalanche_Fuji:    'Avalanche Fuji',
  Arbitrum_Sepolia:  'Arbitrum Sepolia',
  OP_Sepolia:        'OP Sepolia',
}
function displayChain(c: string) { return CHAIN_DISPLAY[c] ?? c }

function StepRow({ step }: { step: BridgeStep }) {
  const icon = step.state === 'success'
    ? <CheckCircle2 size={14} className="text-green-400 flex-shrink-0" />
    : step.state === 'failed'
      ? <XCircle size={14} className="text-red-400 flex-shrink-0" />
      : step.state === 'active'
        ? <Loader2 size={14} className="text-accent animate-spin flex-shrink-0" />
        : <Circle size={14} className="text-muted/30 flex-shrink-0" />

  return (
    <div className="flex items-center gap-2.5 py-1">
      {icon}
      <div className="flex-1 min-w-0">
        <span className={`text-xs capitalize ${step.state === 'active' ? 'text-white' : step.state === 'success' ? 'text-white/70' : 'text-muted/50'}`}>
          {step.name}
        </span>
      </div>
      {step.txHash && (
        <a
          href={step.explorerUrl ?? `https://explorer.testnet.arc.io/tx/${step.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-muted hover:text-accent transition-colors font-mono flex-shrink-0"
        >
          {step.txHash.slice(0, 8)}…
          <ExternalLink size={9} />
        </a>
      )}
    </div>
  )
}

export function BridgeStatusCard({ progress, token, amount, sourceChain, destChain }: Props) {
  const isRunning = progress.state === 'running'
  const isSuccess = progress.state === 'success'
  const isFailed  = progress.state === 'failed'

  return (
    <div className="w-full bg-surface border border-border rounded-xl overflow-hidden mt-1">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-orange-400">BRIDGE</span>
            <span className="text-white font-medium text-sm">{amount} {token}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {isRunning && <Loader2 size={12} className="text-accent animate-spin" />}
            {isSuccess && <CheckCircle2 size={12} className="text-green-400" />}
            {isFailed  && <XCircle size={12} className="text-red-400" />}
            <span className={`text-xs ${isSuccess ? 'text-green-400' : isFailed ? 'text-red-400' : 'text-muted'}`}>
              {isSuccess ? 'Complete' : isFailed ? 'Failed' : 'Bridging…'}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted mt-1">
          {displayChain(sourceChain)} → {displayChain(destChain)}
        </p>
      </div>

      {/* Steps */}
      {progress.steps.length > 0 && (
        <div className="px-4 py-2 divide-y divide-border/40">
          {progress.steps.map((s) => <StepRow key={s.name} step={s} />)}
        </div>
      )}

      {/* Waiting to start */}
      {isRunning && progress.steps.length === 0 && (
        <div className="px-4 py-3 flex items-center gap-2 text-xs text-muted">
          <Loader2 size={13} className="animate-spin text-accent" />
          Starting bridge transfer…
        </div>
      )}

      {/* Success */}
      {isSuccess && (
        <div className="px-4 py-3 bg-green-500/5 border-t border-green-500/10">
          <p className="text-xs text-green-400 font-medium">Bridge complete — {token} arrived on {displayChain(destChain)}</p>
          {progress.sourceTxHash && (
            <a
              href={`https://explorer.testnet.arc.io/tx/${progress.sourceTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 mt-1 text-xs text-muted hover:text-accent"
            >
              Source tx: {progress.sourceTxHash.slice(0, 16)}…
              <ExternalLink size={9} />
            </a>
          )}
        </div>
      )}

      {/* Failure */}
      {isFailed && (
        <div className="px-4 py-3 bg-red-500/5 border-t border-red-500/10">
          <p className="text-xs text-red-400">{progress.error ?? 'Bridge transfer failed'}</p>
          {progress.sourceTxHash && (
            <p className="text-xs text-muted mt-1">
              Source tx was submitted. Funds may still arrive — check the explorer.
            </p>
          )}
        </div>
      )}

      {/* Warnings */}
      {progress.warnings.length > 0 && (
        <div className="px-4 pb-3 space-y-1">
          {progress.warnings.map((w, i) => (
            <p key={i} className="text-xs text-yellow-400/80">⚠ {w}</p>
          ))}
        </div>
      )}
    </div>
  )
}
