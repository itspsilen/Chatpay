/**
 * Thin persistence layer.
 * Uses Supabase when configured, local storage in demo mode.
 */
import { supabase, isSupabaseConfigured, LS_MESSAGES, LS_MEMORIES, LS_SETTINGS, LS_USER } from './supabase'
import type { AppSettings, ChatMessage, Memory, AppUser } from './types'
import { DEFAULT_SETTINGS } from './types'

// Supabase row shapes (untyped API returns any — we cast through unknown)
interface MsgRow { id: string; role: string; content: string; created_at: string; is_mock: boolean }
interface MemRow { id: string; text: string; created_at: string }
interface SettingsRow {
  per_trade_cap: number
  daily_cap: number
  confirm_every: boolean
  language: string
}

function toMsgRow(r: unknown): MsgRow {
  const x = r as MsgRow
  return x
}
function toMemRow(r: unknown): MemRow {
  const x = r as MemRow
  return x
}

// ---- Demo user ----
export function getDemoUser(): AppUser {
  const raw = localStorage.getItem(LS_USER)
  if (raw) {
    try { return JSON.parse(raw) as AppUser } catch { /* fall through */ }
  }
  const user: AppUser = { id: crypto.randomUUID(), isDemoMode: true }
  localStorage.setItem(LS_USER, JSON.stringify(user))
  return user
}

// ---- Messages ----
export function loadMessagesLocal(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(LS_MESSAGES)
    return raw ? (JSON.parse(raw) as ChatMessage[]) : []
  } catch { return [] }
}

export function saveMessagesLocal(msgs: ChatMessage[]) {
  localStorage.setItem(LS_MESSAGES, JSON.stringify(msgs.slice(-200)))
}

export async function loadMessages(userId: string, isDemo: boolean): Promise<ChatMessage[]> {
  if (isDemo || !isSupabaseConfigured || !supabase) return loadMessagesLocal()
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(200)
  if (!data) return []
  return (data as unknown[]).map((raw) => {
    const r = toMsgRow(raw)
    return {
      id: r.id,
      role: r.role as 'user' | 'assistant',
      content: r.content,
      timestamp: new Date(r.created_at).getTime(),
      isMock: r.is_mock,
    }
  })
}

export async function saveMessage(userId: string, msg: ChatMessage, isDemo: boolean) {
  if (isDemo || !isSupabaseConfigured || !supabase) {
    const msgs = loadMessagesLocal()
    const updated = [...msgs.filter((m) => m.id !== msg.id), msg]
    saveMessagesLocal(updated)
    return
  }
  await supabase.from('messages').upsert({
    id: msg.id,
    user_id: userId,
    role: msg.role,
    content: msg.content,
    is_mock: msg.isMock ?? false,
    created_at: new Date(msg.timestamp).toISOString(),
  })
}

// ---- Memories ----
export function loadMemoriesLocal(): Memory[] {
  try {
    const raw = localStorage.getItem(LS_MEMORIES)
    return raw ? (JSON.parse(raw) as Memory[]) : []
  } catch { return [] }
}

export function saveMemoriesLocal(mems: Memory[]) {
  localStorage.setItem(LS_MEMORIES, JSON.stringify(mems))
}

export async function loadMemories(userId: string, isDemo: boolean): Promise<Memory[]> {
  if (isDemo || !isSupabaseConfigured || !supabase) return loadMemoriesLocal()
  const { data } = await supabase
    .from('memories')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (!data) return []
  return (data as unknown[]).map((raw) => {
    const r = toMemRow(raw)
    return { id: r.id, text: r.text, createdAt: new Date(r.created_at).getTime() }
  })
}

export async function addMemory(userId: string, text: string, isDemo: boolean): Promise<Memory> {
  const createdAt = Date.now()
  const mem: Memory = { id: crypto.randomUUID(), text, createdAt }
  if (isDemo || !isSupabaseConfigured || !supabase) {
    const mems = loadMemoriesLocal()
    saveMemoriesLocal([mem, ...mems])
    return mem
  }
  await supabase.from('memories').insert({
    id: mem.id,
    user_id: userId,
    text,
    created_at: new Date(mem.createdAt).toISOString(),
  })
  return mem
}

export async function deleteMemory(userId: string, memId: string, isDemo: boolean) {
  if (isDemo || !isSupabaseConfigured || !supabase) {
    const mems = loadMemoriesLocal().filter((m) => m.id !== memId)
    saveMemoriesLocal(mems)
    return
  }
  await supabase.from('memories').delete().eq('id', memId).eq('user_id', userId)
}

export async function deleteAllMemories(userId: string, isDemo: boolean) {
  if (isDemo || !isSupabaseConfigured || !supabase) {
    saveMemoriesLocal([])
    return
  }
  await supabase.from('memories').delete().eq('user_id', userId)
}

// ---- Settings ----
export function loadSettingsLocal(): AppSettings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS)
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) } : DEFAULT_SETTINGS
  } catch { return DEFAULT_SETTINGS }
}

export function saveSettingsLocal(s: AppSettings) {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(s))
}

export async function loadSettings(userId: string, isDemo: boolean): Promise<AppSettings> {
  if (isDemo || !isSupabaseConfigured || !supabase) return loadSettingsLocal()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data } = await supabase.from('settings').select('*').eq('user_id', userId).single()
  if (!data) return DEFAULT_SETTINGS
  const r = data as unknown as SettingsRow
  return {
    perTradeCap: r.per_trade_cap ?? DEFAULT_SETTINGS.perTradeCap,
    dailyCap: r.daily_cap ?? DEFAULT_SETTINGS.dailyCap,
    confirmEvery: r.confirm_every ?? DEFAULT_SETTINGS.confirmEvery,
    language: r.language ?? DEFAULT_SETTINGS.language,
  }
}

export async function saveSettings(userId: string, s: AppSettings, isDemo: boolean) {
  if (isDemo || !isSupabaseConfigured || !supabase) {
    saveSettingsLocal(s)
    return
  }
  await supabase.from('settings').upsert({
    user_id: userId,
    per_trade_cap: s.perTradeCap,
    daily_cap: s.dailyCap,
    confirm_every: s.confirmEvery,
    language: s.language,
  })
}
