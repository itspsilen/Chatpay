import { motion } from 'framer-motion'
import type { ChatMessage } from '../../lib/types'
import { TransactionPreviewCard } from './TransactionPreviewCard'
import { SchedulePreviewCard } from './SchedulePreviewCard'
import { BatchPreviewCard } from './BatchPreviewCard'
import { ReceiveCard } from './ReceiveCard'
import { ExternalLink } from 'lucide-react'

interface Props {
  message: ChatMessage
  onConfirmTx?: (id: string) => void
  onCancelTx?: (id: string) => void
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Detect if the agent provided receive wallet info in toolPayload */
function extractReceiveInfo(msg: ChatMessage): { address: string; network: string } | null {
  if (msg.toolCall?.name === 'getReceiveInfo' && msg.toolCall.args) {
    const args = msg.toolCall.args as Record<string, string>
    if (args.address) return { address: args.address, network: args.network ?? 'Arc Testnet' }
  }
  return null
}

/** Very simple markdown renderer: **bold**, `code`, and bare 0x... addresses */
function renderContent(text: string) {
  const lines = text.split('\n')
  return lines.map((line, li) => {
    // Split on bold (**text**) and code (`text`) markers
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/\S+|0x[0-9a-fA-F]{40,})/g)
    return (
      <p key={li} className={li > 0 ? 'mt-1' : ''}>
        {parts.map((part, pi) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={pi} className="font-semibold text-white">{part.slice(2, -2)}</strong>
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={pi} className="font-mono text-xs bg-white/8 rounded px-1 py-0.5 text-accent">{part.slice(1, -1)}</code>
          }
          if (part.startsWith('http')) {
            return (
              <a key={pi} href={part} target="_blank" rel="noopener noreferrer"
                className="text-accent hover:underline inline-flex items-center gap-0.5">
                {part.length > 40 ? part.slice(0, 40) + '…' : part}
                <ExternalLink size={10} />
              </a>
            )
          }
          if (/^0x[0-9a-fA-F]{40,}$/.test(part)) {
            return <code key={pi} className="font-mono text-xs bg-white/8 rounded px-1 py-0.5 text-white/80">{part}</code>
          }
          return <span key={pi}>{part}</span>
        })}
      </p>
    )
  })
}

export function MessageBubble({ message, onConfirmTx, onCancelTx }: Props) {
  const isUser = message.role === 'user'
  const receiveInfo = !isUser ? extractReceiveInfo(message) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-accent-dim flex items-center justify-center flex-shrink-0 mb-0.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5b7fff" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
      )}

      <div className={`flex flex-col gap-2 max-w-[82%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Bubble */}
        {message.content && (
          <div
            className={`
              rounded-2xl px-4 py-2.5 text-sm leading-relaxed
              ${isUser
                ? 'bg-accent text-white rounded-br-sm'
                : message.error
                  ? 'bg-red-500/10 border border-red-500/20 text-red-300 rounded-bl-sm'
                  : 'bg-card border border-border text-white rounded-bl-sm'
              }
            `}
          >
            {isUser
              ? <p className="whitespace-pre-wrap text-pretty">{message.content}</p>
              : <div className="space-y-0.5 text-pretty">{renderContent(message.content)}</div>
            }
            {message.isMock && (
              <span className="inline-block mt-1 text-xs bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded font-mono">
                demo
              </span>
            )}
          </div>
        )}

        {/* Receive card */}
        {receiveInfo && (
          <ReceiveCard address={receiveInfo.address} network={receiveInfo.network} />
        )}

        {/* Transaction preview card */}
        {message.previewCard && (
          <TransactionPreviewCard
            preview={message.previewCard}
            onConfirm={(hash) => onConfirmTx?.(hash)}
            onCancel={() => onCancelTx?.(message.id)}
          />
        )}

        {/* Schedule preview card */}
        {message.schedulePreview && (
          <SchedulePreviewCard
            preview={message.schedulePreview}
            onCancel={() => onCancelTx?.(message.id)}
          />
        )}

        {/* Batch preview card */}
        {message.batchPreview && (
          <BatchPreviewCard
            preview={message.batchPreview}
            onCancel={() => onCancelTx?.(message.id)}
          />
        )}

        <span className="text-[11px] text-muted/60 px-1">{formatTime(message.timestamp)}</span>
      </div>
    </motion.div>
  )
}
