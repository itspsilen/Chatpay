import { useState } from 'react'
import { motion } from 'framer-motion'
import { useApp, isSupabaseConfigured } from '../lib/context'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
  { code: 'ja', label: '日本語' },
]

export function SignIn() {
  const { navigate, dispatch, signInDemo } = useApp()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [lang, setLang] = useState('en')

  const handleMagicLink = async () => {
    if (!email) { setError('Enter your email address'); return }
    setLoading(true)
    setError('')
    try {
      const { error: err } = await supabase!.auth.signInWithOtp({ email })
      if (err) throw err
      setSent(true)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to send link')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoMode = () => {
    dispatch({ type: 'SET_SETTINGS', payload: { perTradeCap: 50, dailyCap: 100, confirmEvery: true, language: lang } })
    signInDemo()
  }

  return (
    <div className="min-h-dvh bg-canvas flex flex-col px-6 py-10">
      <button
        onClick={() => navigate('landing')}
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
        className="flex-1 flex flex-col max-w-sm mx-auto w-full"
      >
        <h2 className="font-display font-bold text-2xl text-white mb-1">Sign in</h2>
        <p className="text-muted text-sm mb-8">We'll send a magic link to your email</p>

        {/* Language selector */}
        <div className="mb-6">
          <label className="block text-xs font-medium text-muted mb-2 uppercase tracking-widest">Language</label>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  lang === l.code
                    ? 'bg-accent text-white'
                    : 'bg-surface text-muted hover:text-white border border-border'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {isSupabaseConfigured ? (
          <div className="space-y-4">
            {sent ? (
              <div className="bg-accent-dim border border-accent/30 rounded-xl p-4 text-center space-y-2">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5b7fff" strokeWidth="2" className="mx-auto">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <p className="text-white font-medium">Check your email</p>
                <p className="text-sm text-muted">Magic link sent to {email}</p>
              </div>
            ) : (
              <>
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={error}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleMagicLink() }}
                />
                <Button size="lg" className="w-full" onClick={() => { void handleMagicLink() }} loading={loading}>
                  Send magic link
                </Button>
              </>
            )}
            <div className="flex items-center gap-3 text-muted text-xs">
              <div className="flex-1 h-px bg-border" />or<div className="flex-1 h-px bg-border" />
            </div>
            <Button variant="ghost" size="lg" className="w-full" onClick={handleDemoMode}>
              Continue in demo mode
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span className="text-sm text-muted font-medium">Supabase not configured</span>
              </div>
              <p className="text-xs text-muted">
                Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env to enable auth.
              </p>
            </div>
            <Button size="lg" className="w-full" onClick={handleDemoMode}>
              Continue in demo mode
            </Button>
            <p className="text-xs text-center text-muted">
              Data is stored locally — nothing is sent to a server
            </p>
          </div>
        )}
      </motion.div>
    </div>
  )
}
