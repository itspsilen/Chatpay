/**
 * Global app context: user, settings, wallet info, memories, messages.
 */
import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react'
import type { AppUser, AppSettings, ChatMessage, Memory, WalletInfo, AppRoute } from './types'
import { DEFAULT_SETTINGS } from './types'
import { getDemoUser, loadMessages, loadMemories, loadSettings, saveMessage, saveSettings } from './storage'
import { isSupabaseConfigured } from './supabase'

interface AppState {
  user: AppUser | null
  settings: AppSettings
  messages: ChatMessage[]
  memories: Memory[]
  walletInfo: WalletInfo | null
  route: AppRoute
  isLoading: boolean
  dailySpent: number
}

type Action =
  | { type: 'SET_USER'; payload: AppUser | null }
  | { type: 'SET_SETTINGS'; payload: AppSettings }
  | { type: 'SET_MESSAGES'; payload: ChatMessage[] }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_MEMORIES'; payload: Memory[] }
  | { type: 'ADD_MEMORY'; payload: Memory }
  | { type: 'REMOVE_MEMORY'; payload: string }
  | { type: 'CLEAR_MEMORIES' }
  | { type: 'SET_WALLET'; payload: WalletInfo | null }
  | { type: 'SET_ROUTE'; payload: AppRoute }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'ADD_DAILY_SPENT'; payload: number }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_USER': return { ...state, user: action.payload }
    case 'SET_SETTINGS': return { ...state, settings: action.payload }
    case 'SET_MESSAGES': return { ...state, messages: action.payload }
    case 'ADD_MESSAGE': return { ...state, messages: [...state.messages, action.payload] }
    case 'UPDATE_MESSAGE': return {
      ...state,
      messages: state.messages.map((m) => (m.id === action.payload.id ? action.payload : m)),
    }
    case 'SET_MEMORIES': return { ...state, memories: action.payload }
    case 'ADD_MEMORY': return { ...state, memories: [action.payload, ...state.memories] }
    case 'REMOVE_MEMORY': return { ...state, memories: state.memories.filter((m) => m.id !== action.payload) }
    case 'CLEAR_MEMORIES': return { ...state, memories: [] }
    case 'SET_WALLET': return { ...state, walletInfo: action.payload }
    case 'SET_ROUTE': return { ...state, route: action.payload }
    case 'SET_LOADING': return { ...state, isLoading: action.payload }
    case 'ADD_DAILY_SPENT': return { ...state, dailySpent: state.dailySpent + action.payload }
    default: return state
  }
}

interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<Action>
  navigate: (route: AppRoute) => void
  signInDemo: () => void
  signOut: () => void
  persistMessage: (msg: ChatMessage) => Promise<void>
  persistSettings: (s: AppSettings) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    user: null,
    settings: DEFAULT_SETTINGS,
    messages: [],
    memories: [],
    walletInfo: null,
    route: 'landing',
    isLoading: false,
    dailySpent: 0,
  })

  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state })

  const navigate = useCallback((route: AppRoute) => {
    dispatch({ type: 'SET_ROUTE', payload: route })
  }, [])

  const signInDemo = useCallback(() => {
    const user = getDemoUser()
    dispatch({ type: 'SET_USER', payload: user })
    navigate('wallet-setup')
  }, [navigate])

  const signOut = useCallback(() => {
    dispatch({ type: 'SET_USER', payload: null })
    dispatch({ type: 'SET_MESSAGES', payload: [] })
    dispatch({ type: 'SET_MEMORIES', payload: [] })
    dispatch({ type: 'SET_WALLET', payload: null })
    navigate('landing')
  }, [navigate])

  const persistMessage = useCallback(async (msg: ChatMessage) => {
    const { user } = stateRef.current
    if (!user) return
    await saveMessage(user.id, msg, user.isDemoMode)
  }, [])

  const persistSettings = useCallback(async (s: AppSettings) => {
    const { user } = stateRef.current
    if (!user) return
    await saveSettings(user.id, s, user.isDemoMode)
  }, [])

  // Load data when user is set
  useEffect(() => {
    if (!state.user) return
    const load = async () => {
      dispatch({ type: 'SET_LOADING', payload: true })
      const [msgs, mems, settings] = await Promise.all([
        loadMessages(state.user!.id, state.user!.isDemoMode),
        loadMemories(state.user!.id, state.user!.isDemoMode),
        loadSettings(state.user!.id, state.user!.isDemoMode),
      ])
      dispatch({ type: 'SET_MESSAGES', payload: msgs })
      dispatch({ type: 'SET_MEMORIES', payload: mems })
      dispatch({ type: 'SET_SETTINGS', payload: settings })
      dispatch({ type: 'SET_LOADING', payload: false })
    }
    void load()
  }, [state.user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const value: AppContextValue = { state, dispatch, navigate, signInDemo, signOut, persistMessage, persistSettings }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

export { isSupabaseConfigured }
