import { useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, Zap, Sparkles, Bell } from 'lucide-react'
import { useApp } from '../lib/context'
import { Button } from '../components/ui/Button'
import { Sheet } from '../components/ui/Sheet'
import { Input } from '../components/ui/Input'

export function ModeSelect() {
  const { navigate, state } = useApp()
  const [notifySheetOpen, setNotifySheetOpen] = useState(false)
  const [notifyEmail, setNotifyEmail] = useState('')
  const [notifySent, setNotifySent] = useState(false)

  const walletLabel =
    state.walletInfo?.mode === 'connected'
      ? `${state.walletInfo.address?.slice(0, 6)}...${state.walletInfo.address?.slice(-4)}`
      : state.walletInfo?.label ?? 'No wallet'

  return (
    <div className="min-h-dvh bg-canvas flex flex-col px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="font-display font-semibold text-white text-sm">ChatPay</span>
        </div>
        <button
          onClick={() => navigate('settings')}
          className="text-muted hover:text-white transition-colors p-1"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>

      {/* Wallet badge */}
      <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-3 py-2 mb-8 self-start">
        <div className={`w-2 h-2 rounded-full ${state.walletInfo?.mode === 'connected' ? 'bg-green-400' : 'bg-yellow-400'}`} />
        <span className="text-xs text-muted font-mono">{walletLabel}</span>
        {state.user?.isDemoMode && (
          <span className="text-xs bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded ml-1">Demo</span>
        )}
      </div>

      <div>
        <h2 className="font-display font-bold text-2xl text-white mb-1">Choose mode</h2>
        <p className="text-muted text-sm mb-6">What do you want to do today?</p>
      </div>

      {/* Mode cards */}
      <div className="space-y-4 flex-1">
        {/* Chat-Pay — LIVE */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          onClick={() => navigate('chat-pay')}
          className="w-full bg-card border border-accent/30 hover:border-accent/60 rounded-2xl p-5 text-left transition-all group"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-accent-dim flex items-center justify-center">
              <Zap size={20} className="text-accent" />
            </div>
            <span className="text-xs bg-green-500/15 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full font-medium">
              LIVE
            </span>
          </div>
          <p className="font-display font-semibold text-lg text-white">Chat-Pay</p>
          <p className="text-sm text-muted mt-1">Research tokens, track NFTs, and preview transactions — just by chatting</p>
          <div className="flex items-center gap-1 mt-4 text-accent text-sm font-medium">
            Open chat
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="group-hover:translate-x-0.5 transition-transform">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        </motion.button>

        {/* Chat-Life — LOCKED */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => setNotifySheetOpen(true)}
          className="w-full bg-card border border-border rounded-2xl p-5 text-left transition-all opacity-70 hover:opacity-90"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
              <Sparkles size={20} className="text-muted" />
            </div>
            <div className="flex items-center gap-2">
              <Lock size={12} className="text-muted" />
              <span className="text-xs bg-white/5 text-muted border border-border px-2 py-0.5 rounded-full font-medium">
                Coming soon
              </span>
            </div>
          </div>
          <p className="font-display font-semibold text-lg text-white/60">Chat-Life</p>
          <p className="text-sm text-muted/70 mt-1">Your daily life, automated. Bills, subscriptions, savings — managed by AI.</p>
          <div className="flex items-center gap-1 mt-4 text-muted text-sm font-medium">
            <Bell size={13} />
            Notify me
          </div>
        </motion.button>
      </div>

      {/* Notify me sheet */}
      <Sheet open={notifySheetOpen} onClose={() => setNotifySheetOpen(false)} title="Chat-Life">
        <div className="space-y-4 pb-4">
          <div className="bg-accent-dim border border-accent/20 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-accent" />
              <span className="text-sm font-medium text-white">Your daily life, automated</span>
            </div>
            <p className="text-sm text-muted">
              Manage bills, subscriptions, DCA strategies, savings goals and more — all through natural conversation.
            </p>
          </div>

          {notifySent ? (
            <div className="text-center py-4 space-y-2">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <p className="text-white font-medium">You're on the list</p>
              <p className="text-sm text-muted">We'll let you know when Chat-Life launches</p>
            </div>
          ) : (
            <>
              <Input
                label="Email (optional)"
                type="email"
                placeholder="you@example.com"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                hint="We'll notify you when Chat-Life launches"
              />
              <Button
                size="lg"
                className="w-full"
                onClick={() => setNotifySent(true)}
              >
                Notify me
              </Button>
              <Button variant="ghost" size="md" className="w-full" onClick={() => setNotifySheetOpen(false)}>
                Not now
              </Button>
            </>
          )}
        </div>
      </Sheet>
    </div>
  )
}
