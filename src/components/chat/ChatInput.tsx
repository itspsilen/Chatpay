import { useRef, useState } from 'react'
import { Mic, MicOff, Paperclip, Send } from 'lucide-react'

interface Props {
  onSend: (text: string) => void | Promise<void>
  onFile?: (file: File) => void
  disabled?: boolean
}

export function ChatInput({ onSend, onFile, disabled }: Props) {
  const [text, setText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<{ stop(): void } | null>(null)

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    void onSend(trimmed)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  const handleVoice = () => {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    type SpeechResultItem = { transcript: string }
    type SpeechResult = Record<number, SpeechResultItem>
    type SpeechAPI = { new (): {
      continuous: boolean
      interimResults: boolean
      onresult: ((e: { results: Record<number, SpeechResult> }) => void) | null
      onend: (() => void) | null
      onerror: (() => void) | null
      start(): void
      stop(): void
    }}
    const winAny = window as unknown as Record<string, SpeechAPI | undefined>
    const SR = winAny['SpeechRecognition'] ?? winAny['webkitSpeechRecognition']
    if (!SR) return

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop()
      setIsListening(false)
      return
    }

    const rec = new SR()
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (e) => {
      const firstResult = e.results[0]
      const t: string = firstResult ? (firstResult[0]?.transcript ?? '') : ''
      setText((prev) => `${prev ? `${prev} ` : ''}${t}`)
    }
    rec.onend = () => setIsListening(false)
    rec.onerror = () => setIsListening(false)
    recognitionRef.current = rec
    rec.start()
    setIsListening(true)
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile?.(file)
    e.target.value = ''
  }

  return (
    <div className="border-t border-border bg-canvas/80 backdrop-blur-sm px-4 py-3 safe-bottom">
      <div className="flex items-end gap-2 bg-surface border border-border rounded-2xl px-3 py-2">
        {/* File attach */}
        <button
          onClick={() => fileRef.current?.click()}
          className="text-muted hover:text-white transition-colors p-1.5 flex-shrink-0 mb-0.5"
          title="Attach file"
        >
          <Paperclip size={17} />
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask about tokens, NFTs, or anything onchain…"
          rows={1}
          disabled={disabled}
          className="flex-1 bg-transparent text-white text-sm placeholder:text-muted/50 resize-none focus:outline-none leading-relaxed min-h-[36px] max-h-[120px] py-1.5"
          style={{ height: 'auto' }}
        />

        {/* Voice */}
        <button
          onClick={handleVoice}
          className={`transition-colors p-1.5 flex-shrink-0 mb-0.5 ${isListening ? 'text-red-400 animate-pulse' : 'text-muted hover:text-white'}`}
          title={isListening ? 'Stop recording' : 'Start voice input'}
        >
          {isListening ? <MicOff size={17} /> : <Mic size={17} />}
        </button>

        {/* Send */}
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white p-2 rounded-xl flex-shrink-0 mb-0.5 transition-colors"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}
