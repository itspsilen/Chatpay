import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Brain } from 'lucide-react'
import { useApp } from '../lib/context'
import { Button } from '../components/ui/Button'
import { Toggle } from '../components/ui/Toggle'
import type { AppSettings } from '../lib/types'

export function Settings() {
  const { state, dispatch, navigate, persistSettings, signOut } = useApp()
  const [settings, setSettings] = useState<AppSettings>(state.settings)
  const [saved, setSaved] = useState(false)

  const update = (key: keyof AppSettings, value: unknown) =>
    setSettings((s) => ({ ...s, [key]: value }))

  const handleSave = async () => {
    dispatch({ type: 'SET_SETTINGS', payload: settings })
    await persistSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="min-h-dvh bg-canvas flex flex-col">
      <div className="sticky top-0 z-10 bg-canvas/90 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('mode-select')} className="text-muted hover:text-white transition-colors p-1">
          <ArrowLeft size={18} />
        </button>
        <span className="font-display font-semibold text-white">Settings</span>
      </div>

      <div className="flex-1 px-4 py-6 max-w-sm mx-auto w-full space-y-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Account */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">Account</h3>
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">
                    {state.user?.email ?? 'Demo user'}
                  </p>
                  <p className="text-xs text-muted">
                    {state.user?.isDemoMode ? 'Demo mode \u2014 data stored locally' : 'Signed in with Supabase'}
                  </p>
                </div>
                {state.user?.isDemoMode && (
                  <span className="text-xs bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full">Demo</span>
                )}
              </div>
              <Button variant="danger" size="sm" onClick={signOut} className="w-full">
                Sign out
              </Button>
            </div>
          </section>

          {/* Wallet */}
          {state.walletInfo && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">Wallet</h3>
              <div className="bg-card border border-border rounded-xl p-4 space-y-1">
                <p className="text-sm font-medium text-white">{state.walletInfo.label}</p>
                {state.walletInfo.address && (
                  <p className="text-xs text-muted font-mono break-all">{state.walletInfo.address}</p>
                )}
                <p className="text-xs text-muted capitalize">{state.walletInfo.mode}</p>
              </div>
            </section>
          )}

          {/* Limits */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">Spending limits</h3>
            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted">Per-trade cap</span>
                  <span className="text-sm font-medium text-white tabular-nums">${settings.perTradeCap}</span>
                </div>
                <input
                  type="range" min={5} max={1000} step={5}
                  value={settings.perTradeCap}
                  onChange={(e) => update('perTradeCap', Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted">Daily cap</span>
                  <span className="text-sm font-medium text-white tabular-nums">${settings.dailyCap}</span>
                </div>
                <input
                  type="range" min={10} max={5000} step={10}
                  value={settings.dailyCap}
                  onChange={(e) => update('dailyCap', Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
              <Toggle
                checked={settings.confirmEvery}
                onChange={(v) => update('confirmEvery', v)}
                label="Confirm every transaction"
                description="Show a preview card before executing"
              />
            </div>
          </section>

          {/* Memory */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">Memory</h3>
            <button
              onClick={() => navigate('memory')}
              className="w-full bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:border-accent/30 transition-colors group"
            >
              <Brain size={18} className="text-accent" />
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-white">Agent memory</p>
                <p className="text-xs text-muted">{state.memories.length} item{state.memories.length !== 1 ? 's' : ''} saved</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </section>

          <Button
            size="lg"
            className="w-full"
            onClick={() => { void handleSave() }}
          >
            {saved ? 'Saved!' : 'Save changes'}
          </Button>
        </motion.div>
      </div>
    </div>
  )
}
