/**
 * Scheduled — list of all payment schedules with pause/resume/cancel/edit.
 * Payments execute only when the user confirms a preview card — never auto-signed.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ArrowLeft, Plus, Pause, Play, Trash2, CalendarClock,
  AlertTriangle, CheckCircle2, Clock, XCircle, RefreshCw,
  ArrowRight, ArrowLeftRight, Landmark,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useApp } from '../lib/context'
import { loadSchedules, updateScheduleStatus, deleteSchedule, addNotification } from '../lib/scheduleStorage'
import type { Schedule } from '../lib/types'
import { executeTransaction } from '../lib/txExecutor'
import type { TransactionPreview } from '../lib/types'

const STATUS_CONFIG = {
  active:    { label: 'Active',    color: 'text-green-400',  bg: 'bg-green-500/10' },
  paused:    { label: 'Paused',    color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  cancelled: { label: 'Cancelled', color: 'text-red-400',    bg: 'bg-red-500/10' },
  completed: { label: 'Completed', color: 'text-muted',      bg: 'bg-white/5' },
}

const FREQ_LABEL: Record<string, string> = {
  once: 'One time', daily: 'Daily', weekly: 'Weekly',
  biweekly: 'Every 2 weeks', monthly: 'Monthly',
}

function fmtDate(ms: number) {
  const d = new Date(ms)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / 86400000)
  if (diffMs < 0) return `${Math.abs(diffDays)}d ago`
  if (diffDays === 0) return 'Today ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays < 7) return `In ${diffDays} days`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ---- Due schedule detection ----
function isDue(s: Schedule): boolean {
  return s.status === 'active' && Date.now() >= s.nextRun
}

interface ConfirmState {
  schedule: Schedule
  preview: TransactionPreview
}

export function Scheduled() {
  const { state, navigate } = useApp()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [executing, setExecuting] = useState(false)
  const [execError, setExecError] = useState<string>()
  const [execHash, setExecHash] = useState<string>()

  // promptedRef tracks the last schedule we already prompted so we don't double-prompt
  const promptedRef = useRef<string | null>(null)

  const promptIfDue = useCallback((list: Schedule[]) => {
    if (confirmState) return
    const dueNow = list.find(isDue)
    if (!dueNow || dueNow.id === promptedRef.current) return
    promptedRef.current = dueNow.id
    const schedAction = dueNow.action ?? 'send'
    const txAction: TransactionPreview['action'] = schedAction === 'swap' ? 'swap' : schedAction === 'bridge' ? 'bridge' : 'send'
    const preview: TransactionPreview = {
      id: crypto.randomUUID(),
      action: txAction,
      token: schedAction === 'swap'
        ? `${dueNow.swapFromToken ?? dueNow.token} → ${dueNow.swapToToken ?? '?'}`
        : dueNow.token,
      amount: `${dueNow.amount} ${dueNow.token}`,
      destination: schedAction === 'bridge' ? dueNow.bridgeDestChain : dueNow.recipient,
      network: 'Arc Testnet',
      fees: 'A fresh quote will be fetched before signing',
      riskWarnings: ['Scheduled run — Arc Testnet test tokens only'],
      perTradeCap: state.settings.perTradeCap,
      dailyCap: state.settings.dailyCap,
      dailySpent: state.dailySpent,
    }
    setConfirmState({ schedule: dueNow, preview })
    addNotification({
      type: 'schedule_due',
      title: 'Payment ready',
      body: `Your scheduled ${dueNow.action ?? 'send'} of ${dueNow.amount} ${dueNow.token}${dueNow.recipient ? ` to ${dueNow.recipient.slice(0, 8)}…` : ''} is ready to confirm.`,
      scheduleId: dueNow.id,
    })
  }, [confirmState, state.settings, state.dailySpent])

  const refresh = useCallback(async () => {
    if (!state.user) return
    setLoading(true)
    setError(undefined)
    try {
      const data = await loadSchedules(state.user.id, state.user.isDemoMode)
      setSchedules(data)
      promptIfDue(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [state.user, promptIfDue])

  // oxlint-disable-next-line react/set-state-in-effect -- async data fetch
  useEffect(() => { void refresh() }, [refresh])

  const handleTogglePause = async (s: Schedule) => {
    if (!state.user) return
    const next = s.status === 'active' ? 'paused' : 'active'
    await updateScheduleStatus(s.id, state.user.id, next, state.user.isDemoMode)
    void refresh()
  }

  const handleCancel = async (s: Schedule) => {
    if (!state.user) return
    await updateScheduleStatus(s.id, state.user.id, 'cancelled', state.user.isDemoMode)
    void refresh()
  }

  const handleDelete = async (s: Schedule) => {
    if (!state.user) return
    await deleteSchedule(s.id, state.user.id, state.user.isDemoMode)
    void refresh()
  }

  const handleConfirmPayment = async () => {
    if (!confirmState) return
    setExecuting(true)
    setExecError(undefined)
    setExecHash(undefined)
    try {
      const result = await executeTransaction(confirmState.preview)
      setExecHash(result.hash)

      // Update schedule: increment runsCompleted, advance nextRun
      const s = confirmState.schedule
      const updatedSchedule: Schedule = {
        ...s,
        runsCompleted: s.runsCompleted + 1,
        lastRun: Date.now(),
        lastRunStatus: 'confirmed',
        lastRunHash: result.hash,
      }
      // Check if schedule is complete
      const maxDone = s.maxRuns != null && updatedSchedule.runsCompleted >= s.maxRuns
      const pastEnd = s.endsAt != null && Date.now() > s.endsAt
      if (maxDone || pastEnd || s.frequency === 'once') {
        updatedSchedule.status = 'completed'
      } else {
        // Advance nextRun
        const { computeNextRun } = await import('../lib/scheduleStorage')
        updatedSchedule.nextRun = computeNextRun(s.frequency, new Date())
      }

      await import('../lib/scheduleStorage').then(({ saveSchedule }) =>
        saveSchedule(updatedSchedule, state.user!.isDemoMode))

      addNotification({
        type: 'schedule_due',
        title: 'Payment confirmed',
        body: `${s.amount} ${s.token} sent. Hash: ${result.hash.slice(0, 14)}…`,
        scheduleId: s.id,
      })
      void refresh()
    } catch (err) {
      const msg = (err as Error).message ?? 'Transaction failed'
      setExecError(msg)
      addNotification({
        type: 'schedule_skipped',
        title: 'Payment failed',
        body: msg.slice(0, 120),
        scheduleId: confirmState.schedule.id,
      })
    } finally {
      setExecuting(false)
    }
  }

  const handleSkipPayment = () => {
    if (!confirmState) return
    const s = confirmState.schedule
    addNotification({
      type: 'schedule_skipped',
      title: 'Payment skipped',
      body: `You skipped the scheduled ${s.action ?? 'send'} of ${s.amount} ${s.token}${s.recipient ? ` to ${s.recipient.slice(0, 8)}…` : ''}.`,
      scheduleId: s.id,
    })
    setConfirmState(null)
    setExecError(undefined)
    setExecHash(undefined)
    void refresh()
  }

  // oxlint-disable-next-line react/immutability
  const due = useMemo(() => schedules.find(isDue), [schedules])
  const active = useMemo(() => schedules.filter((s) => s.status === 'active' || s.status === 'paused'), [schedules])
  const past = useMemo(() => schedules.filter((s) => s.status === 'cancelled' || s.status === 'completed'), [schedules])

  return (
    <div className="min-h-dvh bg-canvas flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-canvas/90 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('chat-pay')} className="text-muted hover:text-white transition-colors p-1">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <p className="text-sm font-medium text-white">Scheduled Payments</p>
          <p className="text-xs text-muted">{active.length} active</p>
        </div>
        <button
          onClick={() => navigate('chat-pay')}
          className="flex items-center gap-1.5 text-xs bg-accent/15 text-accent px-3 py-1.5 rounded-xl hover:bg-accent/25 transition-colors"
        >
          <Plus size={12} />
          New schedule
        </button>
      </div>

      <div className="flex-1 px-4 py-4 space-y-6 max-w-md mx-auto w-full">

        {/* Due now — confirmation card */}
        {confirmState && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-purple-500/8 border border-purple-500/25 rounded-2xl overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-purple-500/15">
              <CalendarClock size={14} className="text-purple-400" />
              <p className="text-sm font-medium text-white">Payment ready to confirm</p>
            </div>
            <div className="px-4 py-3 space-y-2 text-sm">
              {/* Send rows */}
              {(confirmState.schedule.action ?? 'send') === 'send' && (
                <>
                  <Row label="Amount" value={`${confirmState.schedule.amount} ${confirmState.schedule.token}`} />
                  <Row label="To" value={
                    <span className="font-mono text-xs break-all">
                      {confirmState.schedule.recipientLabel
                        ? `${confirmState.schedule.recipientLabel} (${confirmState.schedule.recipient?.slice(0, 8)}…)`
                        : (confirmState.schedule.recipient ?? '—')}
                    </span>
                  } />
                </>
              )}
              {/* Swap rows */}
              {confirmState.schedule.action === 'swap' && (
                <>
                  <Row label="Swap" value={`${confirmState.schedule.amount} ${confirmState.schedule.swapFromToken ?? confirmState.schedule.token} → ${confirmState.schedule.swapToToken ?? '?'}`} />
                  <Row label="Slippage" value={confirmState.schedule.slippageBps !== undefined ? `${(confirmState.schedule.slippageBps / 100).toFixed(1)}%` : '0.5%'} />
                </>
              )}
              {/* Bridge rows */}
              {confirmState.schedule.action === 'bridge' && (
                <>
                  <Row label="Amount" value={`${confirmState.schedule.amount} ${confirmState.schedule.token}`} />
                  <Row label="Destination" value={confirmState.schedule.bridgeDestChain ?? '—'} />
                </>
              )}
              <Row label="Rule" value={confirmState.schedule.rule} />
            </div>

            {execHash && (
              <div className="px-4 pb-3">
                <div className="flex items-center gap-2 bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2">
                  <CheckCircle2 size={13} className="text-green-400" />
                  <span className="text-xs text-green-400">Confirmed! <a href={`https://explorer.testnet.arc.io/tx/${execHash}`} target="_blank" rel="noopener noreferrer" className="underline">{execHash.slice(0, 14)}…</a></span>
                </div>
              </div>
            )}
            {execError && (
              <div className="px-4 pb-3">
                <div className="flex items-center gap-2 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                  <XCircle size={12} className="text-red-400" />
                  <span className="text-xs text-red-300">{execError}</span>
                </div>
              </div>
            )}

            {!execHash && (
              <div className="px-4 pb-4 flex gap-2">
                <button
                  onClick={handleSkipPayment}
                  disabled={executing}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted hover:text-white transition-colors disabled:opacity-50"
                >
                  Skip this run
                </button>
                <button
                  onClick={() => { void handleConfirmPayment() }}
                  disabled={executing}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {executing ? 'Sending…' : 'Confirm payment'}
                </button>
              </div>
            )}
            {execHash && (
              <div className="px-4 pb-4">
                <button
                  onClick={() => { setConfirmState(null); setExecHash(undefined) }}
                  className="w-full py-2.5 rounded-xl bg-white/8 hover:bg-white/12 text-sm text-white transition-colors"
                >
                  Done
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertTriangle size={14} />
            <span>{error}</span>
            <button onClick={() => { void refresh() }} className="ml-auto text-muted hover:text-white">
              <RefreshCw size={13} />
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-card animate-pulse" />
            ))}
          </div>
        )}

        {/* Active schedules */}
        {!loading && active.length > 0 && (
          <section>
            <p className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Active</p>
            <div className="space-y-3">
              {active.map((s) => (
                <ScheduleCard
                  key={s.id}
                  schedule={s}
                  isDue={isDue(s) && !confirmState}
                  onTogglePause={() => { void handleTogglePause(s) }}
                  onCancel={() => { void handleCancel(s) }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Past schedules */}
        {!loading && past.length > 0 && (
          <section>
            <p className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Past</p>
            <div className="space-y-3">
              {past.map((s) => (
                <ScheduleCard
                  key={s.id}
                  schedule={s}
                  isDue={false}
                  onTogglePause={() => {}}
                  onCancel={() => { void handleCancel(s) }}
                  onDelete={() => { void handleDelete(s) }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!loading && !error && schedules.length === 0 && (
          <div className="py-20 text-center space-y-3">
            <CalendarClock size={36} className="text-muted/30 mx-auto" />
            <p className="text-white font-medium">No scheduled payments</p>
            <p className="text-sm text-muted">Say "send 10 USDC to 0x… every Friday" or "swap 5 USDC to EURC every Monday" in chat.</p>
            <button
              onClick={() => navigate('chat-pay')}
              className="mt-2 text-sm text-accent hover:underline"
            >
              Go to chat
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const ACTION_ICON_MAP: Record<string, React.ReactNode> = {
  send:   <ArrowRight   size={11} className="text-accent" />,
  swap:   <ArrowLeftRight size={11} className="text-purple-400" />,
  bridge: <Landmark    size={11} className="text-blue-400" />,
}

function scheduleDescription(s: Schedule): string {
  if (s.action === 'swap') return `${s.amount} ${s.swapFromToken ?? s.token} → ${s.swapToToken ?? '?'}`
  if (s.action === 'bridge') return `${s.amount} ${s.token} → ${s.bridgeDestChain ?? '?'}`
  return `${s.amount} ${s.token}`
}
function scheduleTarget(s: Schedule): string {
  if (s.action === 'swap') return `Swap on Arc Testnet`
  if (s.action === 'bridge') return `Bridge via CCTP`
  if (s.recipient) return (s.recipientLabel ? `${s.recipientLabel} — ` : '') + `${s.recipient.slice(0, 8)}…${s.recipient.slice(-4)}`
  return '—'
}

function ScheduleCard({
  schedule: s,
  isDue,
  onTogglePause,
  onCancel,
  onDelete,
}: {
  schedule: Schedule
  isDue: boolean
  onTogglePause: () => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const cfg = STATUS_CONFIG[s.status]
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl bg-card border transition-colors ${isDue ? 'border-purple-500/30 bg-purple-500/5' : 'border-border'}`}
    >
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {s.label && <p className="text-sm font-medium text-white truncate">{s.label}</p>}
            <p className="text-sm text-white font-medium flex items-center gap-1.5">
              {ACTION_ICON_MAP[s.action ?? 'send']}
              {scheduleDescription(s)}
              <span className="text-muted font-normal"> · {FREQ_LABEL[s.frequency] ?? s.frequency}</span>
            </p>
            <p className="text-xs text-muted truncate mt-0.5">
              {scheduleTarget(s)}
            </p>
          </div>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>

        <div className="flex items-center gap-3 mt-2.5 text-xs text-muted flex-wrap">
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {isDue ? <span className="text-purple-400 font-medium">Due now</span> : `Next: ${fmtDate(s.nextRun)}`}
          </span>
          <span>{s.runsCompleted} run{s.runsCompleted !== 1 ? 's' : ''}</span>
          {s.lastRunStatus && (
            <span className={s.lastRunStatus === 'confirmed' ? 'text-green-400' : s.lastRunStatus === 'skipped' ? 'text-yellow-400' : 'text-red-400'}>
              Last: {s.lastRunStatus}{s.lastRunReason ? ` — ${s.lastRunReason.slice(0, 40)}` : ''}
            </span>
          )}
          {s.lastRunHash && (
            <a
              href={`https://explorer.testnet.arc.io/tx/${s.lastRunHash}`}
              target="_blank" rel="noopener noreferrer"
              className="text-accent underline underline-offset-2 hover:text-accent/80"
            >
              {s.lastRunHash.slice(0, 8)}…
            </a>
          )}
        </div>
      </div>

      {/* Actions */}
      {(s.status === 'active' || s.status === 'paused') && (
        <div className="flex border-t border-border">
          <button
            onClick={onTogglePause}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted hover:text-white hover:bg-white/4 transition-colors border-r border-border"
          >
            {s.status === 'active'
              ? <><Pause size={11} /> Pause</>
              : <><Play size={11} /> Resume</>}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted hover:text-red-400 hover:bg-red-500/5 transition-colors"
          >
            <Trash2 size={11} /> Cancel
          </button>
        </div>
      )}
      {(s.status === 'cancelled' || s.status === 'completed') && onDelete && (
        <div className="border-t border-border">
          <button
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted hover:text-red-400 hover:bg-red-500/5 transition-colors"
          >
            <Trash2 size={11} /> Remove
          </button>
        </div>
      )}
    </motion.div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted text-sm flex-shrink-0">{label}</span>
      <span className="text-white text-sm text-right">{value}</span>
    </div>
  )
}
