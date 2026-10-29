import { useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, Eye, Zap } from 'lucide-react'
import { useApp } from '../lib/context'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { getOrCreateTestnetWallet } from '../lib/testnetWallet'
import type { WalletInfo } from '../lib/types'

function isValidAddress(addr: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr)
}

export function WalletSetup() {
  const { navigate, dispatch } = useApp()
  const [mode, setMode] = useState<'choose' | 'watchOnly'>('choose')
  const [watchAddress, setWatchAddress] = useState('')
  const [addressError, setAddressError] = useState('')

  const proceedWithWallet = (info: WalletInfo) => {
    dispatch({ type: 'SET_WALLET', payload: info })
    navigate('safety-setup')
  }

  const handleTestnetWallet = () => {
    const wallet = getOrCreateTestnetWallet()
    proceedWithWallet({
      mode: 'testnet',
      address: wallet.address,
      label: 'Arc Testnet Wallet',
    })
  }

  const handleWatchOnly = () => {
    if (!isValidAddress(watchAddress)) {
      setAddressError('Enter a valid 0x address')
      return
    }
    proceedWithWallet({ mode: 'watchOnly', address: watchAddress, label: 'Watch-only' })
  }

  if (mode === 'watchOnly') {
    return (
      <div className="min-h-dvh bg-canvas flex flex-col px-6 py-10">
        <button onClick={() => setMode('choose')} className="flex items-center gap-1.5 text-muted hover:text-white transition-colors mb-8">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          <span className="text-sm">Back</span>
        </button>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex-1 max-w-sm mx-auto w-full space-y-6">
          <div>
            <h2 className="font-display font-bold text-2xl text-white">Watch-only address</h2>
            <p className="text-muted text-sm mt-1">Read any wallet without connecting it</p>
          </div>
          <Input
            label="Wallet address"
            placeholder="0x..."
            value={watchAddress}
            onChange={(e) => { setWatchAddress(e.target.value); setAddressError('') }}
            error={addressError}
          />
          <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl p-3 text-xs text-yellow-300">
            Watch-only mode is read-only. No transactions can be sent.
          </div>
          <Button size="lg" className="w-full" onClick={handleWatchOnly}>
            Watch this address
          </Button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-canvas flex flex-col px-6 py-10">
      <button onClick={() => navigate('signin')} className="flex items-center gap-1.5 text-muted hover:text-white transition-colors mb-8">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
        <span className="text-sm">Back</span>
      </button>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex-1 max-w-sm mx-auto w-full space-y-5">
        <div>
          <h2 className="font-display font-bold text-2xl text-white">Set up your wallet</h2>
          <p className="text-muted text-sm mt-1">ChatPay runs on Arc Testnet with test USDC</p>
        </div>

        {/* PRIMARY: Arc Testnet Wallet */}
        <button
          onClick={handleTestnetWallet}
          className="w-full bg-card border-2 border-accent/50 hover:border-accent rounded-xl p-4 text-left transition-all group"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent-dim flex items-center justify-center flex-shrink-0">
              <Zap size={18} className="text-accent" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white">Arc Testnet Wallet</p>
                <span className="text-xs bg-accent-dim text-accent px-2 py-0.5 rounded-full">Recommended</span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                A fresh wallet with test USDC — no real funds, safe to explore
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['Balance', 'Send', 'Receive', 'History', 'Swap'].map((f) => (
                  <span key={f} className="text-xs bg-surface border border-border rounded px-1.5 py-0.5 text-muted">{f}</span>
                ))}
              </div>
            </div>
          </div>
        </button>

        {/* COMING SOON: Real wallet */}
        <div className="w-full bg-card border border-border rounded-xl p-4 opacity-60 relative overflow-hidden">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-subtle/50 flex items-center justify-center flex-shrink-0">
              <Lock size={18} className="text-muted" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white">Connect real wallet</p>
                <span className="text-xs bg-surface border border-border text-muted px-2 py-0.5 rounded-full">Coming soon</span>
              </div>
              <p className="text-xs text-muted mt-0.5">MetaMask, Coinbase, WalletConnect on mainnet</p>
            </div>
          </div>
        </div>

        {/* Watch-only */}
        <button
          onClick={() => setMode('watchOnly')}
          className="w-full bg-card border border-border hover:border-border/80 rounded-xl p-4 text-left transition-all"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center flex-shrink-0">
              <Eye size={18} className="text-muted" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Watch an address</p>
              <p className="text-xs text-muted mt-0.5">Read-only — see any wallet's data without connecting</p>
            </div>
          </div>
        </button>

        <p className="text-xs text-muted text-center px-4">
          Testnet wallets use test tokens only. No real money involved.
        </p>
      </motion.div>
    </div>
  )
}
