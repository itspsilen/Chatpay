/**
 * SchedulePreviewCard — shown in chat when the agent proposes a new schedule.
 * Supports action types: send | swap | bridge.
 * Confirm saves the schedule; Cancel discards it.
 * No transaction is signed here — payments require explicit confirmation at run time.
 */
import { useState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, XCircle, ArrowLeftRight, ArrowRight, Landmark } from 'lucide-react'
import type { SchedulePreview, Schedule } from '../../lib/types'
import { saveSchedule } from '../../lib/scheduleStorage'
import { useApp } from '../../lib/context'

interface Props {
  preview: SchedulePreview
  onConfirmed?: (schedule: Schedule) => void
  onCancel?: () => void
}

const FREQ_LABEL: Record<string, string> = {
  once: 'One time',
  daily: 'Every day',
  weekly: 'Every week',
  biweekly: 'Every two weeks',
  monthly: 'Every month',
}

const ACTION_ICON: Record<string, React.ReactNode> = {
  send:   <ArrowRight  size={13} className="text-accent" />,
  swap:   <ArrowLeftRight size={13} className="text-purple-400" />,
  bridge: <Landmark   size={13} className="text-blue-400" />,
}
const ACTION_COLOR: Record<string, string> = {
  send:   'text-accent',
  swap:   'text-purple-400',
  bridge: 'text-blue-400',
}
const ACTION_LABEL: Record<string, string> = {
  send:   'Scheduled send',
  swap:   'Scheduled swap',
  bridge: 'Scheduled bridge',
}

function fmtDate(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

type CardState = 'idle' | 'saved' | 'error'

export function SchedulePreviewCard({ preview, onConfirmed, onCancel }: Props) {
  const { state } = useApp()
  const [cardState, setCardState] = useState<CardState>('idle')
  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const action = preview.action ?? 'send'
  const accentColor = ACTION_COLOR[action] ?? 'text-accent'

  const handleConfirm = async () => {
    if (!state.user) { setErrorMsg('No user session.'); setCardState('error'); return }
    setIsSaving(true)
    try {
      const schedule: Schedule = {
        id: crypto.randomUUID(),
        userId: state.user.id,
        action,
        token: preview.token,
        amount: preview.amount,
        // send / bridge
        recipient: preview.recipient,
        recipientLabel: preview.recipientLabel,
        // swap
        swapFromToken: preview.swapFromToken,
        swapToToken: preview.swapToToken,
        slippageBps: preview.slippageBps,
        // bridge
        bridgeDestChain: preview.bridgeDestChain,
        frequency: preview.frequency,
        rule: preview.rule,
        nextRun: preview.firstRun,
        endsAt: preview.endsAt,
        maxRuns: preview.maxRuns,
        runsCompleted: 0,
        status: 'active',
        createdAt: Date.now(),
      }
      await saveSchedule(schedule, state.user.isDemoMode)
      setCardState('saved')
      onConfirmed?.(schedule)
    } catch (err) {
      setErrorMsg((err as Error).message ?? 'Failed to save schedule')
      setCardState('error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="w-full bg-surface border border-border rounded-xl overflow-hidden mt-1">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <CalendarClock size={14} className={accentColor} />
        {ACTION_ICON[action]}
        <span className={`text-xs font-semibold uppercase tracking-widest ${accentColor}`}>
          {ACTION_LABEL[action] ?? 'Schedule'}
        </span>
        <span className="ml-auto text-xs text-muted">Arc Testnet</span>
      </div>

      {/* Details */}
      <div className="px-4 py-3 space-y-2">

        {/* SEND rows */}
        {action === 'send' && (
          <>
            <Row label="Token" value={preview.token} />
            <Row label="Amount" value={`${preview.amount} ${preview.token} per run`} />
            <Row label="Recipient" value={
              <span className="font-mono text-xs break-all">
                {preview.recipientLabel
                  ? `${preview.recipientLabel} (${preview.recipient?.slice(0, 8)}…${preview.recipient?.slice(-4)})`
                  : (preview.recipient ?? '—')}
              </span>
            } />
          </>
        )}

        {/* SWAP rows */}
        {action === 'swap' && (
          <>
            <Row label="From" value={`${preview.amount} ${preview.swapFromToken ?? preview.token}`} />
            <Row label="To" value={preview.swapToToken ?? '—'} />
            <Row label="Slippage limit" value={preview.slippageBps !== undefined ? `${(preview.slippageBps / 100).toFixed(1)}%` : '0.5%'} />
            {preview.swapQuotePreview && (
              <>
                <Row label="Indicative rate" value={preview.swapQuotePreview.rate} />
                <Row label="Indicative output" value={`~${preview.swapQuotePreview.amountOut} ${preview.swapToToken}`} />
                <Row label="Price impact now" value={`${preview.swapQuotePreview.priceImpact}%`} />
              </>
            )}
          </>
        )}

        {/* BRIDGE rows */}
        {action === 'bridge' && (
          <>
            <Row label="Token" value={preview.token} />
            <Row label="Amount" value={`${preview.amount} ${preview.token} per run`} />
            <Row label="Destination" value={preview.bridgeDestChain ?? '—'} />
            {preview.estimatedBridgeTime && (
              <Row label="Est. time" value={preview.estimatedBridgeTime} />
            )}
          </>
        )}

        <Row label="Frequency" value={FREQ_LABEL[preview.frequency] ?? preview.frequency} />
        <Row label="Rule" value={preview.rule} />
        <Row label="First run" value={fmtDate(preview.firstRun)} />
        {preview.endsAt  && <Row label="Ends"     value={fmtDate(preview.endsAt)} />}
        {preview.maxRuns && <Row label="Max runs" value={String(preview.maxRuns)} />}
      </div>

      {/* Risk warnings */}
      {preview.riskWarnings.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5">
          {preview.riskWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/15 rounded-lg px-3 py-2">
              <AlertTriangle size={12} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <span className="text-xs text-yellow-300">{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Slippage re-check note for swaps */}
      {action === 'swap' && (
        <div className="px-4 pb-3">
          <div className="text-xs text-muted/70 bg-white/3 rounded-lg px-3 py-2">
            At each run a fresh quote is fetched. If the rate has moved beyond your slippage limit, the run is skipped and you are notified.
          </div>
        </div>
      )}

      {/* Confirm-required note */}
      <div className="px-4 pb-3">
        <div className="text-xs text-muted/60 bg-white/3 rounded-lg px-3 py-2">
          Each {action} will show a preview card and require your Confirm tap before signing.
        </div>
      </div>

      {/* Success state */}
      {cardState === 'saved' && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2.5">
            <CheckCircle2 size={14} className="text-green-400 flex-shrink-0" />
            <p className="text-xs text-green-400 font-medium">Schedule saved. You'll get a notification when it's ready to confirm.</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {cardState === 'error' && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
            <XCircle size={13} className="text-red-400 flex-shrink-0" />
            <span className="text-xs text-red-300">{errorMsg}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      {(cardState === 'idle' || cardState === 'error') && (
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted hover:text-white hover:border-white/20 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { void handleConfirm() }}
            disabled={isSaving}
            className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Confirm schedule'}
          </button>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between text-sm gap-4">
      <span className="text-muted flex-shrink-0">{label}</span>
      <span className="text-white text-right">{value}</span>
    </div>
  )
}
