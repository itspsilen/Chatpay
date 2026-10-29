import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey && url !== 'placeholder' && anonKey !== 'placeholder')

export let supabase: SupabaseClient | null = null

if (isSupabaseConfigured) {
  supabase = createClient(url!, anonKey!)
}

// ---- Types ----
export interface DBMemory {
  id: string
  user_id: string
  text: string
  created_at: string
}

export interface DBMessage {
  id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  is_mock: boolean
  created_at: string
}

export interface DBSettings {
  user_id: string
  per_trade_cap: number
  daily_cap: number
  confirm_every: boolean
  language: string
}

// ---- Local-storage fallback keys ----
export const LS_MESSAGES = 'chatpay_messages'
export const LS_MEMORIES = 'chatpay_memories'
export const LS_SETTINGS = 'chatpay_settings'
export const LS_USER    = 'chatpay_demo_user'
