/**
 * Schedule storage — Supabase when configured, localStorage in demo mode.
 *
 * Supabase table schema (see AGENTS.md for the full CREATE TABLE statement).
 * Additional columns added for swap/bridge action support:
 *   action text default 'send', swap_from_token text, swap_to_token text,
 *   slippage_bps int, bridge_dest_chain text
 */
import { supabase, isSupabaseConfigured } from './supabase'
import type { Schedule, ScheduleAction, ScheduleStatus } from './types'

const LS_KEY = 'chatpay_schedules'

// ---- Local storage helpers ----
function loadLocal(): Schedule[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as Schedule[]) : []
  } catch { return [] }
}
function saveLocal(s: Schedule[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(s))
}

// ---- Row ↔ Schedule mapping ----
interface ScheduleRow {
  id: string
  user_id: string
  label?: string
  action?: string
  token: string
  amount: string
  recipient?: string
  recipient_label?: string
  swap_from_token?: string
  swap_to_token?: string
  slippage_bps?: number
  bridge_dest_chain?: string
  frequency: string
  rule: string
  next_run: string
  ends_at?: string
  max_runs?: number
  runs_completed: number
  status: string
  created_at: string
  last_run?: string
  last_run_status?: string
  last_run_reason?: string
  last_run_hash?: string
}

function fromRow(r: ScheduleRow): Schedule {
  return {
    id: r.id,
    userId: r.user_id,
    label: r.label,
    action: (r.action ?? 'send') as ScheduleAction,
    token: r.token,
    amount: r.amount,
    recipient: r.recipient,
    recipientLabel: r.recipient_label,
    swapFromToken: r.swap_from_token,
    swapToToken: r.swap_to_token,
    slippageBps: r.slippage_bps,
    bridgeDestChain: r.bridge_dest_chain,
    frequency: r.frequency as Schedule['frequency'],
    rule: r.rule,
    nextRun: new Date(r.next_run).getTime(),
    endsAt: r.ends_at ? new Date(r.ends_at).getTime() : undefined,
    maxRuns: r.max_runs,
    runsCompleted: r.runs_completed ?? 0,
    status: r.status as ScheduleStatus,
    createdAt: new Date(r.created_at).getTime(),
    lastRun: r.last_run ? new Date(r.last_run).getTime() : undefined,
    lastRunStatus: r.last_run_status as Schedule['lastRunStatus'],
    lastRunReason: r.last_run_reason,
    lastRunHash: r.last_run_hash,
  }
}

function toRow(s: Schedule): Record<string, unknown> {
  return {
    id: s.id,
    user_id: s.userId,
    label: s.label,
    action: s.action ?? 'send',
    token: s.token,
    amount: s.amount,
    recipient: s.recipient ?? null,
    recipient_label: s.recipientLabel ?? null,
    swap_from_token: s.swapFromToken ?? null,
    swap_to_token: s.swapToToken ?? null,
    slippage_bps: s.slippageBps ?? null,
    bridge_dest_chain: s.bridgeDestChain ?? null,
    frequency: s.frequency,
    rule: s.rule,
    next_run: new Date(s.nextRun).toISOString(),
    ends_at: s.endsAt ? new Date(s.endsAt).toISOString() : null,
    max_runs: s.maxRuns ?? null,
    runs_completed: s.runsCompleted,
    status: s.status,
    created_at: new Date(s.createdAt).toISOString(),
    last_run: s.lastRun ? new Date(s.lastRun).toISOString() : null,
    last_run_status: s.lastRunStatus ?? null,
    last_run_reason: s.lastRunReason ?? null,
    last_run_hash: s.lastRunHash ?? null,
  }
}

const canUseSupabase = (isDemo: boolean) =>
  !isDemo && isSupabaseConfigured && supabase != null

// ---- CRUD ----

export async function loadSchedules(userId: string, isDemo: boolean): Promise<Schedule[]> {
  if (!canUseSupabase(isDemo)) {
    return loadLocal().filter((s) => s.userId === userId)
  }
  const { data } = await supabase!.from('schedules').select('*').eq('user_id', userId).order('next_run', { ascending: true })
  if (!data) return []
  return (data as unknown[]).map((r) => fromRow(r as ScheduleRow))
}

export async function saveSchedule(s: Schedule, isDemo: boolean): Promise<void> {
  if (!canUseSupabase(isDemo)) {
    const all = loadLocal()
    const updated = [...all.filter((x) => x.id !== s.id), s]
    saveLocal(updated)
    return
  }
  await supabase!.from('schedules').upsert(toRow(s))
}

export async function updateScheduleStatus(
  scheduleId: string,
  userId: string,
  status: ScheduleStatus,
  isDemo: boolean,
): Promise<void> {
  if (!canUseSupabase(isDemo)) {
    const all = loadLocal()
    const updated = all.map((s) =>
      s.id === scheduleId && s.userId === userId ? { ...s, status } : s,
    )
    saveLocal(updated)
    return
  }
  await supabase!.from('schedules').update({ status }).eq('id', scheduleId).eq('user_id', userId)
}

export async function deleteSchedule(scheduleId: string, userId: string, isDemo: boolean): Promise<void> {
  if (!canUseSupabase(isDemo)) {
    saveLocal(loadLocal().filter((s) => !(s.id === scheduleId && s.userId === userId)))
    return
  }
  await supabase!.from('schedules').delete().eq('id', scheduleId).eq('user_id', userId)
}

// ---- Next-run calculator ----
export function computeNextRun(frequency: Schedule['frequency'], after: Date = new Date()): number {
  const d = new Date(after)
  switch (frequency) {
    case 'once':      return d.getTime() // first run IS the scheduled time
    case 'daily':     d.setDate(d.getDate() + 1); break
    case 'weekly':    d.setDate(d.getDate() + 7); break
    case 'biweekly':  d.setDate(d.getDate() + 14); break
    case 'monthly':   d.setMonth(d.getMonth() + 1); break
  }
  return d.getTime()
}

// ---- Notification storage (localStorage only — lightweight) ----
const LS_NOTIF = 'chatpay_notifications'

export interface StoredNotification {
  id: string
  type: string
  title: string
  body: string
  scheduleId?: string
  read: boolean
  createdAt: number
}

export function loadNotifications(): StoredNotification[] {
  try {
    const raw = localStorage.getItem(LS_NOTIF)
    return raw ? (JSON.parse(raw) as StoredNotification[]) : []
  } catch { return [] }
}

export function addNotification(n: Omit<StoredNotification, 'id' | 'createdAt' | 'read'>): StoredNotification {
  const notif: StoredNotification = { ...n, id: crypto.randomUUID(), read: false, createdAt: Date.now() }
  const all = loadNotifications()
  localStorage.setItem(LS_NOTIF, JSON.stringify([notif, ...all].slice(0, 100)))
  return notif
}

export function markNotificationRead(id: string) {
  const all = loadNotifications().map((n) => n.id === id ? { ...n, read: true } : n)
  localStorage.setItem(LS_NOTIF, JSON.stringify(all))
}

export function markAllRead() {
  const all = loadNotifications().map((n) => ({ ...n, read: true }))
  localStorage.setItem(LS_NOTIF, JSON.stringify(all))
}
