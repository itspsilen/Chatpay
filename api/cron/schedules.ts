/**
 * GET /api/cron/schedules
 * Vercel cron job — runs every 5 minutes.
 * Scans Supabase for due active schedules, marks them "due" in a notifications
 * column, and returns a summary. Does NOT sign or send any transaction.
 * Execution always requires the user to tap Confirm in the app.
 *
 * Security: guarded by CRON_SECRET header so only Vercel's scheduler can call it.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const CRON_SECRET = process.env.CRON_SECRET ?? ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow Vercel cron calls (or manual calls with the secret)
  const authHeader = req.headers['authorization'] ?? ''
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    // Supabase not configured — schedules are client-side only, nothing to do
    return res.status(200).json({ ok: true, processed: 0, note: 'Supabase not configured — skipping cron' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const now = new Date().toISOString()

  // Find active schedules whose next_run has passed
  const { data: dueRows, error } = await supabase
    .from('schedules')
    .select('id, user_id, token, amount, recipient, rule, action, swap_from_token, swap_to_token, bridge_dest_chain')
    .eq('status', 'active')
    .lte('next_run', now)

  if (error) {
    console.error('[cron/schedules] query error:', error)
    return res.status(500).json({ error: error.message })
  }

  if (!dueRows || dueRows.length === 0) {
    return res.status(200).json({ ok: true, processed: 0 })
  }

  // For each due schedule, insert a notification row so the app can pick it up
  // on next load. Does NOT sign or execute anything.
  const notifications = dueRows.map((row: Record<string, unknown>) => ({
    id: crypto.randomUUID(),
    user_id: row.user_id,
    type: 'schedule_due',
    title: 'Payment ready to confirm',
    body: buildNotificationBody(row),
    schedule_id: row.id,
    read: false,
    created_at: now,
  }))

  const { error: insertError } = await supabase
    .from('schedule_notifications')
    .insert(notifications)

  if (insertError) {
    // Non-fatal — log and continue
    console.warn('[cron/schedules] notification insert error:', insertError.message)
  }

  console.log(`[cron/schedules] processed ${dueRows.length} due schedule(s)`)
  return res.status(200).json({ ok: true, processed: dueRows.length })
}

function buildNotificationBody(row: Record<string, unknown>): string {
  const action = String(row.action ?? 'send')
  const amount = String(row.amount ?? '?')
  const token = String(row.token ?? 'USDC')
  if (action === 'swap') {
    return `Scheduled swap: ${amount} ${String(row.swap_from_token ?? token)} → ${String(row.swap_to_token ?? '?')} is ready to confirm.`
  }
  if (action === 'bridge') {
    return `Scheduled bridge: ${amount} ${token} → ${String(row.bridge_dest_chain ?? '?')} is ready to confirm.`
  }
  const recipient = String(row.recipient ?? '')
  const short = recipient.length > 8 ? `${recipient.slice(0, 8)}…` : recipient
  return `Scheduled send: ${amount} ${token} to ${short} is ready to confirm.`
}
