import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react'
import type { TransactionPreview } from '../../lib/types'
import { executeTransaction } from '../../lib/txExecutor'
import type { BridgeProgress } from '../../lib/bridgeExecutor'
import { BridgeStatusCard } from './BridgeStatusCard'
import { Button } from '../ui/Button'

interface Props {
  preview: TransactionPreview
  onConfirm: (hash: string) => void
  onCancel: () => void
}

type TxState = 'idle' | 'signing' | 'confirming' | 'success' | 'error' | 'bridging'

const ACTION_COLORS: Record<string, string> = {
  buy:    'text-green-400',
  sell:   'text-red-400',
  swap:   'text-accent',
  send:   'text-blue-400',
  mint:   'text-purple-400',
  bridge: 'text-orange-400',
}

const CHAIN_DISPLAY: Record<string, string> = {
  Arc_Testnet:       'Arc Testnet',
  Ethereum_Sepolia:  'Ethereum Sepolia',
  Base_Sepolia:      'Base Sepolia',
  Avalanche_Fuji:    'Avalanche Fuji',
  Arbitrum_Sepolia:  'Arbitrum Sepolia',
  OP_Sepolia:        'OP Sepolia',
}
function displayChain(c?: string) { return c ? (CHAIN_DISPLAY[c] ?? c) : '' }

export function TransactionPreviewCard({ preview, onConfirm, onCancel }: Props) {
  const [txState, setTxState] = useState<TxState>('idle')
  const [txHash, setTxHash] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [bridgeProgress, setBridgeProgress] = useState<BridgeProgress | null>(null)

  const capExceeded =
    Number(preview.amount.replace(/[^0-9.]/g, '')) > preview.perTradeCap ||
    preview.dailySpent + Number(preview.amount.replace(/[^0-9.]/g, '')) > preview.dailyCap

  const isBridge = preview.action === 'bridge'
  const isSwap   = preview.action === 'swap'

  const handleConfirm = async () => {
    setTxState(isBridge ? 'bridging' : 'signing')
    setErrorMsg('')
    setBridgeProgress(null)

    try {
      const result = await executeTransaction(preview, isBridge ? (progress) => {
        setBridgeProgress({ ...progress })
      } : undefined)

      setTxHash(result.hash)
      setTxState('success')
      onConfirm(result.hash)
    } catch (err) {
      setErrorMsg((err as Error).message ?? 'Transaction failed')
      setTxState('error')
    }
  }

  const isProcessing = txState === 'signing' || txState === 'confirming' || txState === 'bridging'

  return (
    <div className="w-full bg-surface border border-border rounded-xl overflow-hidden mt-1">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold uppercase tracking-widest ${ACTION_COLORS[preview.action] ?? 'text-white'}`}>
            ${preview.action}
          </span>
          <span className="text-white font-medium text-sm">{preview.token}</span>
        </div>
        <span className="text-xs text-muted">{preview.network}</span>
      </div>

      {/* Details */}
      <div className="px-4 py-3 space-y-2">
        <Row label="Amount" value={preview.amount} />

        {/* Bridge route */}
        {isBridge && preview.sourceChain && preview.destinationChain && (
          <Row label="Route" value={
            <span className="text-xs">
              {displayChain(preview.sourceChain)} → {displayChain(preview.destinationChain)}
            </span>
          } />
        )}
        {preview.estimatedTime && <Row label="Est. time" value={preview.estimatedTime} />}

        {/* Swap details */}
        {isSwap && preview.swapQuote && (
          <>
            <Row label="You receive ~" value={`${preview.swapQuote.amountOut} ${preview.swapQuote.toToken}`} />
            <Row label="Min. received" value={`${preview.swapQuote.amountOutMin} ${preview.swapQuote.toToken}`} />
            <Row label="Price impact" value={`${preview.swapQuote.priceImpact}%`} />
          </>
        )}

        {preview.estimatedPrice && <Row label="Est. price" value={preview.estimatedPrice} />}
        {preview.slippage && <Row label="Slippage" value={preview.slippage} />}
        {preview.fees && (
          <Row
            label="Fees"
            value={preview.feeToken
              ? <span>{preview.fees} <span className="text-muted text-xs">(paid in {preview.feeToken})</span></span>
              : preview.fees
            }
          />
        )}
        {preview.destination && !isBridge && (
          <Row
            label="To"
            value={<span className="font-mono text-xs text-muted break-all">{preview.destination}</span>}
          />
        )}
        {isBridge && preview.destination && (
          <Row
            label="Recipient"
            value={<span className="font-mono text-xs text-muted break-all">{preview.destination}</span>}
          />
        )}
      </div>

      {/* Risk warnings */}
      {preview.riskWarnings.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5">
          {preview.riskWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/15 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <span className="text-xs text-yellow-300">{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cap exceeded */}
      {capExceeded && txState === 'idle' && (
        <div className="px-4 pb-3">
          <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertTriangle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
            <span className="text-xs text-red-300">
              Exceeds your {Number(preview.amount.replace(/[^0-9.]/g, '')) > preview.perTradeCap ? 'per-trade' : 'daily'} cap.
              Update limits in Settings.
            </span>
          </div>
        </div>
      )}

      {/* Bridge live progress */}
      {txState === 'bridging' && bridgeProgress && preview.sourceChain && preview.destinationChain && (
        <div className="px-4 pb-3">
          <BridgeStatusCard
            progress={bridgeProgress}
            token={preview.token}
            amount={preview.amount.replace(/[^0-9.]/g, '')}
            sourceChain={preview.sourceChain}
            destChain={preview.destinationChain}
          />
        </div>
      )}

      {/* Bridge starting (no steps yet) */}
      {txState === 'bridging' && !bridgeProgress && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-3 bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-3">
            <Loader2 size={16} className="text-orange-400 animate-spin flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-orange-400">Starting bridge transfer…</p>
              <p className="text-xs text-muted mt-0.5">Approve → Burn → Attest → Mint</p>
            </div>
          </div>
        </div>
      )}

      {/* Signing / confirming state (non-bridge) */}
      {(txState === 'signing' || txState === 'confirming') && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-3 bg-accent/5 border border-accent/20 rounded-lg px-3 py-3">
            <Loader2 size={16} className="text-accent animate-spin flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-accent">
                {isSwap ? 'Executing swap…' : 'Signing transaction…'}
              </p>
              <p className="text-xs text-muted mt-0.5">
                {isSwap ? 'Approve + swap on Uniswap V2' : 'Broadcasting to Arc Testnet'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Success state */}
      {txState === 'success' && (
        <div className="px-4 pb-4">
          <div className="flex items-start gap-3 bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-3">
            <CheckCircle2 size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-green-400">
                {isBridge ? 'Bridge initiated on Arc Testnet' : 'Transaction confirmed on Arc Testnet'}
              </p>
              <a
                href={`https://explorer.testnet.arc.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 mt-1 text-xs text-muted hover:text-accent transition-colors"
              >
                <span className="font-mono truncate">{txHash.slice(0, 18)}…{txHash.slice(-6)}</span>
                <ExternalLink size={11} className="flex-shrink-0" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {txState === 'error' && (
        <div className="px-4 pb-3">
          <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
            <XCircle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
            <span className="text-xs text-red-300">{errorMsg}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      {(txState === 'idle' || txState === 'error') && (
        <div className="px-4 pb-4 flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1" onClick={onCancel} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="flex-1"
            disabled={capExceeded || isProcessing}
            loading={isProcessing}
            onClick={() => { void handleConfirm() }}
          >
            {txState === 'error' ? 'Retry' : 'Confirm'}
          </Button>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between text-sm gap-4">
      <span className="text-muted flex-shrink-0">{label}</span>
      <span className="text-white tabular-nums text-right">{value}</span>
    </div>
  )
}
