import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { toast } from 'sonner'

interface ReceiveCardProps {
  address: string
  network: string
}

export function ReceiveCard({ address, network }: ReceiveCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    toast.success('Address copied')
    setTimeout(() => setCopied(false), 2000)
  }

  // Simple QR-code-like visual using the address hash for color variety
  const shortAddr = `${address.slice(0, 10)}...${address.slice(-8)}`

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-3 max-w-xs">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted uppercase tracking-widest">Receive</span>
        <span className="text-xs bg-accent-dim text-accent px-2 py-0.5 rounded-full">{network}</span>
      </div>

      {/* QR placeholder — real QR lib can be swapped in */}
      <div className="bg-white rounded-xl p-3 flex items-center justify-center aspect-square max-w-[160px] mx-auto">
        <div className="w-full h-full grid grid-cols-7 gap-0.5">
          {Array.from({ length: 49 }, (_, i) => {
            // Deterministic pattern from address
            const code = address.charCodeAt(i % address.length) + i
            const on = code % 3 !== 0
            return (
              <div
                key={i}
                className={`rounded-sm ${on ? 'bg-black' : 'bg-white'}`}
              />
            )
          })}
        </div>
      </div>

      <div className="bg-canvas rounded-lg px-3 py-2 flex items-center gap-2">
        <span className="font-mono text-xs text-muted flex-1 truncate">{shortAddr}</span>
        <button
          onClick={() => { void handleCopy() }}
          className="text-muted hover:text-white transition-colors flex-shrink-0"
        >
          {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
        </button>
      </div>

      <p className="text-xs text-muted text-center">
        Only send USDC on Arc Testnet to this address
      </p>
    </div>
  )
}
