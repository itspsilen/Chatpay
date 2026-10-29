/**
 * BatchPreviewCard — shows all recipients before confirming a batch.
 * On Confirm, runs executeBatch() and shows per-row live progress.
 * Safety: addresses are validated in previewBatch(); display only.
 */
import { useState } from 'react'
import {
  AlertTriangle, CheckCircle2, XCircle, Loader2, ExternalLink, RefreshCw,
} from 'lucide-react'
import type { BatchPreview, BatchRecipient } from '../../lib/types'
import { executeBatch, retryFailed } from '../../lib/batchExecutor'
import { useApp } from '../../lib/context'

interface Props {
  preview: BatchPreview
  onDone?: (result: { successCount: number; failCount: number }) => void
  onCancel?: () => void
}

type CardState = 'idle' | 'running' | 'done' | 'error'

const STATUS_ICON: Record<BatchRecipient['status'] & string, React.ReactNode> = {
  pending:  <span className="w-2 h-2 rounded-full bg-white/20 flex-shrink-0" />,
  signing:  <Loader2 size={11} className="animate-spin text-accent flex-shrink-0" />,
  success:  <CheckCircle2 size={11} className="text-green-400 flex-shrink-0" />,
  failed:   <XCircle size={11} className="text-red-400 flex-shrink-0" />,
  skipped:  <span className="w-2 h-2 rounded-full bg-yellow-400/40 flex-shrink-0" />,
}

const ARC_EXPLORER = 'https://explorer.testnet.arc.io'

export function BatchPreviewCard({ preview, onDone, onCancel }: Props) {
  const { state } = useApp()
  const [cardState, setCardState] = useState<CardState>('idle')
  const [rows, setRows] = useState<BatchRecipient[]>(preview.recipients)
  const [successCount, setSuccessCount] = useState(0)
  const [failCount, setFailCount] = useState(0)
  const [totalSent, setTotalSent] = useState('')
  const [globalError, setGlobalError] = useState('')

  const dailyCap = state.settings.dailyCap
  const perTradeCap = state.settings.perTradeCap
  const totalNum = parseFloat(preview.totalAmount)
  const capExceeded = totalNum > perTradeCap || preview.dailySpent + totalNum > dailyCap

  const tokenDecimals = preview.token === 'USDC' || preview.token === 'EURC' ? 6 : 8

  const runBatch = async (recipientList: BatchRecipient[]) => {
    setCardState('running')
    setGlobalError('')
    try {
      const result = await executeBatch(
        recipientList,
        preview.token,
        tokenDecimals,
        (_index, _row, allRows) => {
          setRows([...allRows])
        },
      )
      setRows(result.recipients)
      setSuccessCount(result.successCount)
      setFailCount(result.failCount)
      setTotalSent(result.totalSent)
      setCardState('done')
      onDone?.({ successCount: result.successCount, failCount: result.failCount })
    } catch (err) {
      setGlobalError((err as Error).message ?? 'Batch failed')
      setCardState('error')
    }
  }

  const handleRetryFailed = async () => {
    setCardState('running')
    try {
      const current = { recipients: rows, successCount, failCount, totalSent }
      const retried = await retryFailed(
        current,
        preview.token,
        tokenDecimals,
        (_index, _row, all) => setRows([...all]),
      )
      setRows(retried.recipients)
      setSuccessCount(retried.successCount)
      setFailCount(retried.failCount)
      setCardState('done')
    } catch (err) {
      setGlobalError((err as Error).message ?? 'Retry failed')
      setCardState('error')
    }
  }

  const validCount = preview.recipients.filter((r) => r.status !== 'failed').length

  return (
    <div className="w-full bg-surface border border-border rounded-xl overflow-hidden mt-1">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-blue-400">Batch Send</span>
          <span className="ml-2 text-xs text-muted">{validCount} of {preview.recipients.length} valid</span>
        </div>
        <span className="text-xs text-muted">Arc Testnet</span>
      </div>

      {/* Summary */}
      <div className="px-4 py-3 space-y-2 border-b border-border">
        <Row label="Token" value={preview.token} />
        <Row label="Per recipient" value={`${preview.perRecipientAmount} ${preview.token}`} />
        <Row label="Total" value={<strong className="text-white">{preview.totalAmount} {preview.token}</strong>} />
        <Row label="Fees" value={preview.fees} />
      </div>

      {/* Recipient rows */}
      <div className="max-h-56 overflow-y-auto divide-y divide-border">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 px-4 py-2.5">
            <div className="flex-shrink-0 mt-0.5">
              {STATUS_ICON[r.status ?? 'pending']}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-white/80 truncate">
                {r.label ? `${r.label} — ` : ''}{r.address.slice(0, 8)}…{r.address.slice(-4)}
              </p>
              {r.errorMsg && (
                <p className="text-[10px] text-red-400 truncate">{r.errorMsg}</p>
              )}
            </div>
            <span className="text-xs text-muted flex-shrink-0">{r.amount}</span>
            {r.txHash && (
              <a
                href={`${ARC_EXPLORER}/tx/${r.txHash}`}
                target="_blank" rel="noopener noreferrer"
                className="text-muted/50 hover:text-accent flex-shrink-0"
              >
                <ExternalLink size={10} />
              </a>
            )}
          </div>
        ))}
      </div>

      {/* Risk warnings */}
      {preview.riskWarnings.length > 0 && (
        <div className="px-4 py-3 space-y-1.5 border-t border-border">
          {preview.riskWarnings.slice(0, 5).map((w, i) => (
            <div key={i} className="flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/15 rounded-lg px-3 py-1.5">
              <AlertTriangle size={11} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <span className="text-[11px] text-yellow-300">{w}</span>
            </div>
          ))}
          {preview.riskWarnings.length > 5 && (
            <p className="text-[10px] text-muted/50 px-1">{preview.riskWarnings.length - 5} more warnings…</p>
          )}
        </div>
      )}

      {/* Cap exceeded */}
      {capExceeded && cardState === 'idle' && (
        <div className="px-4 pb-3">
          <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertTriangle size={12} className="text-red-400 mt-0.5" />
            <span className="text-xs text-red-300">Total exceeds your {totalNum > perTradeCap ? 'per-trade' : 'daily'} cap. Update in Settings.</span>
          </div>
        </div>
      )}

      {/* Done summary */}
      {cardState === 'done' && (
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-start gap-2 bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2.5">
            <CheckCircle2 size={13} className="text-green-400 mt-0.5" />
            <div className="text-xs">
              <p className="text-green-400 font-medium">
                {successCount} sent · {failCount} failed · {totalSent} {preview.token} total
              </p>
              {failCount > 0 && <p className="text-muted mt-0.5">Check failed rows above and retry.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Global error */}
      {cardState === 'error' && globalError && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
            <XCircle size={12} className="text-red-400" />
            <span className="text-xs text-red-300">{globalError}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 border-t border-border flex gap-2">
        {(cardState === 'idle' || cardState === 'error') && (
          <>
            <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted hover:text-white hover:border-white/20 transition-colors">
              Cancel
            </button>
            <button
              disabled={capExceeded || validCount === 0}
              onClick={() => { void runBatch(rows) }}
              className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              Send to {validCount} addresses
            </button>
          </>
        )}
        {cardState === 'running' && (
          <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted py-2.5">
            <Loader2 size={14} className="animate-spin" />
            Sending…
          </div>
        )}
        {cardState === 'done' && failCount > 0 && (
          <button
            onClick={() => { void handleRetryFailed() }}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm text-muted hover:text-white transition-colors"
          >
            <RefreshCw size={13} />
            Retry {failCount} failed
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm gap-4">
      <span className="text-muted flex-shrink-0">{label}</span>
      <span className="text-white text-right">{value}</span>
    </div>
  )
}
