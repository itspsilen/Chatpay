import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Settings, CalendarClock } from 'lucide-react'
import { useApp } from '../lib/context'
import { MessageBubble } from '../components/chat/MessageBubble'
import { NotificationBell } from '../components/NotificationBell'
import { TypingIndicator } from '../components/chat/TypingIndicator'
import { ChatInput } from '../components/chat/ChatInput'
import { BalanceBar } from '../components/wallet/BalanceBar'
import { useTokenBalances } from '../hooks/useTokenBalances'
import type { ChatMessage, TokenBalance } from '../lib/types'
import { toast } from 'sonner'
import { useAccount } from 'wagmi'

// Avoid react-compiler purity lint on Date.now()
function getTimestamp() { return Date.now() }

interface WalletContext {
  address?: string
  balance?: string       // formatted summary of all token balances
  balances?: TokenBalance[]
  network?: string
  mode?: string
}

async function sendToAgent(
  messages: ChatMessage[],
  userMessage: string,
  memories: string[],
  wallet: WalletContext,
): Promise<{ content: string; isMock: boolean; previewCard?: ChatMessage['previewCard'] }> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        userMessage,
        memories,
        date: new Date().toDateString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        wallet,
      }),
    })
    if (!res.ok) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const body: { error?: string } = await res.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return res.json()
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      return { content: mockReply(userMessage), isMock: true }
    }
    throw err
  }
}

function mockReply(msg: string): string {
  const lower = msg.toLowerCase()
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey'))
    return "Hey! I'm ChatPay, your onchain agent for Arc Testnet. Start the server with `bun run server` for real AI responses."
  if (lower.includes('balance') || lower.includes('token'))
    return '[DEMO MODE] Real AI responses require GEMINI_API_KEY in .env and the server running (`bun run server`).'
  if (lower.includes('date') || lower.includes('time'))
    return `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`
  return `[DEMO MODE] Message received: "${msg}". Start the server with \`bun run server\` for real responses.`
}

/** Build a human-readable balance summary for the agent from the live balance list */
function buildBalanceSummary(balances: TokenBalance[]): string {
  if (balances.length === 0) return 'No tokens found yet'
  return balances
    .map((b) => {
      const val = b.valueUsd ? ` ($${b.valueUsd})` : ''
      return `${parseFloat(b.balance).toFixed(b.decimals > 6 ? 8 : 4)} ${b.symbol}${val}`
    })
    .join(', ')
}

export function ChatPay() {
  const { state, navigate, dispatch, persistMessage } = useApp()
  const [isTyping, setIsTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Prefer testnet wallet address from context, fall back to connected wagmi wallet
  const { address: connectedAddress } = useAccount()
  const walletAddress = state.walletInfo?.address ?? connectedAddress

  // Live multi-token balances — hook fetches on mount and exposes refetch()
  const { balances, loading: balLoading, error: balError, totalUsd, refetch: refetchBalances, lastRefresh } = useTokenBalances(walletAddress)

  const scrollToBottom = () => {
    setTimeout(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, 50)
  }
  useEffect(scrollToBottom, [state.messages.length, isTyping])

  const walletCtx: WalletContext = {
    address: walletAddress,
    balance: buildBalanceSummary(balances),
    balances,
    network: 'Arc Testnet',
    mode: state.walletInfo?.mode ?? 'testnet',
  }

  const handleSend = async (text: string) => {
    if (!state.user) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: getTimestamp(),
    }

    dispatch({ type: 'ADD_MESSAGE', payload: userMsg })
    await persistMessage(userMsg)
    setIsTyping(true)

    try {
      const result = await sendToAgent(state.messages, text, state.memories.map((m) => m.text), walletCtx)
      // Determine which preview type the agent returned
      const isSchedule = result.previewCard && 'firstRun' in result.previewCard
      const isBatch = result.previewCard && 'recipients' in result.previewCard
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.content,
        timestamp: getTimestamp(),
        isMock: result.isMock,
        previewCard: (!isSchedule && !isBatch) ? result.previewCard : undefined,
        schedulePreview: isSchedule ? result.previewCard as ChatMessage['schedulePreview'] : undefined,
        batchPreview: isBatch ? result.previewCard as ChatMessage['batchPreview'] : undefined,
      }
      dispatch({ type: 'ADD_MESSAGE', payload: assistantMsg })
      await persistMessage(assistantMsg)
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `I hit an error: ${(err as Error).message ?? 'Unknown error'}. Please try again.`,
        timestamp: getTimestamp(),
        error: true,
      }
      dispatch({ type: 'ADD_MESSAGE', payload: errorMsg })
    } finally {
      setIsTyping(false)
    }
  }

  const handleConfirmTx = (hash: string) => {
    // Post receipt message
    const receipt: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Transaction confirmed on Arc Testnet.\n\nHash: \`${hash}\`\n\n[View on explorer](https://explorer.testnet.arc.io/tx/${hash})`,
      timestamp: getTimestamp(),
    }
    dispatch({ type: 'ADD_MESSAGE', payload: receipt })
    void persistMessage(receipt)
    // Refetch balances after every confirmed transaction
    refetchBalances()
  }

  const handleCancelTx = (messageId: string) => {
    const msg = state.messages.find((m) => m.id === messageId)
    if (!msg) return
    dispatch({ type: 'UPDATE_MESSAGE', payload: { ...msg, previewCard: undefined } })
  }

  const handleFile = (file: File) => {
    toast.info(`File attached: ${file.name} (file processing coming soon)`)
  }

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : state.walletInfo?.label ?? 'No wallet'

  return (
    <div className="min-h-dvh bg-canvas flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-canvas/95 backdrop-blur-sm">
        <div className="border-b border-border px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('mode-select')} className="text-muted hover:text-white transition-colors p-1">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-full bg-accent-dim flex-shrink-0 flex items-center justify-center">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5b7fff" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white leading-none">ChatPay</p>
              <p className="text-[11px] text-muted leading-none mt-0.5 font-mono truncate">{shortAddr}</p>
            </div>
          </div>
          <span className="text-xs bg-green-500/15 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
            TESTNET
          </span>
          <NotificationBell />
          <button onClick={() => navigate('scheduled')} className="text-muted hover:text-white transition-colors p-1 flex-shrink-0" title="Scheduled payments">
            <CalendarClock size={17} />
          </button>
          <button onClick={() => navigate('settings')} className="text-muted hover:text-white transition-colors p-1 flex-shrink-0">
            <Settings size={17} />
          </button>
        </div>

        {/* Collapsible balance bar */}
        <BalanceBar
          balances={balances}
          loading={balLoading}
          error={balError}
          totalUsd={totalUsd}
          lastRefresh={lastRefresh}
          onRefresh={refetchBalances}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {state.messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-12 text-center space-y-4"
          >
            <div className="w-14 h-14 rounded-2xl bg-accent-dim flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5b7fff" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <p className="font-display font-semibold text-white">Your onchain agent</p>
              <p className="text-sm text-muted mt-1">Ask about your wallet, tokens, or anything on Arc</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
              {[
                "What's my balance?",
                'Bridge 5 USDC to Base Sepolia',
                'Swap 2 USDC for EURC',
                'Show my address',
                'Show my last 10 transactions',
                'Send 1 USDC',
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => { void handleSend(s) }}
                  className="text-xs bg-surface border border-border rounded-full px-3 py-1.5 text-muted hover:text-white hover:border-accent/40 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {state.messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onConfirmTx={handleConfirmTx}
            onCancelTx={handleCancelTx}
          />
        ))}

        {isTyping && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} onFile={handleFile} disabled={isTyping} />
    </div>
  )
}
