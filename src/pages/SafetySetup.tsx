import { useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../lib/context'
import { Button } from '../components/ui/Button'
import { Toggle } from '../components/ui/Toggle'
import type { AppSettings } from '../lib/types'

export function SafetySetup() {
  const { state, dispatch, navigate, persistSettings } = useApp()
  const [settings, setSettings] = useState<AppSettings>(state.settings)

  const handleContinue = async () => {
    dispatch({ type: 'SET_SETTINGS', payload: settings })
    await persistSettings(settings)
    navigate('mode-select')
  }

  const update = (key: keyof AppSettings, value: unknown) =>
    setSettings((s) => ({ ...s, [key]: value }))

  return (
    <div className="min-h-dvh bg-canvas flex flex-col px-6 py-10">
      <button
        onClick={() => navigate('wallet-setup')}
        className="flex items-center gap-1.5 text-muted hover:text-white transition-colors mb-8"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        <span className="text-sm">Back</span>
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 max-w-sm mx-auto w-full space-y-6"
      >
        <div>
          <h2 className="font-display font-bold text-2xl text-white">Safety setup</h2>
          <p className="text-muted text-sm mt-1">Set limits to protect yourself</p>
        </div>

        {/* Per-trade cap */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Per-trade cap</p>
              <p className="text-xs text-muted">Max USDC per single transaction</p>
            </div>
            <span className="font-display font-semibold text-white tabular-nums">
              ${settings.perTradeCap}
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={1000}
            step={5}
            value={settings.perTradeCap}
            onChange={(e) => update('perTradeCap', Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-muted">
            <span>$5</span><span>$1,000</span>
          </div>
        </div>

        {/* Daily cap */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Daily cap</p>
              <p className="text-xs text-muted">Max USDC per day</p>
            </div>
            <span className="font-display font-semibold text-white tabular-nums">
              ${settings.dailyCap}
            </span>
          </div>
          <input
            type="range"
            min={10}
            max={5000}
            step={10}
            value={settings.dailyCap}
            onChange={(e) => update('dailyCap', Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-muted">
            <span>$10</span><span>$5,000</span>
          </div>
        </div>

        {/* Confirm every */}
        <div className="bg-card border border-border rounded-xl p-4">
          <Toggle
            checked={settings.confirmEvery}
            onChange={(v) => update('confirmEvery', v)}
            label="Confirm every transaction"
            description="Show a preview card before any action is executed"
          />
        </div>

        <p className="text-xs text-muted text-center">
          You can change these any time in Settings
        </p>

        <Button size="lg" className="w-full" onClick={() => { void handleContinue() }}>
          Continue
        </Button>
      </motion.div>
    </div>
  )
}
