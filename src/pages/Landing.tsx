import { motion } from 'framer-motion'
import { useApp } from '../lib/context'
import { Button } from '../components/ui/Button'

export function Landing() {
  const { navigate } = useApp()
  return (
    <div className="min-h-dvh bg-canvas flex flex-col items-center justify-between px-6 py-12">
      {/* Logo mark */}
      <div className="flex items-center gap-2 self-start">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <span className="font-display font-semibold text-white tracking-tight">ChatPay</span>
      </div>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-center max-w-xs space-y-6"
      >
        <div className="w-20 h-20 mx-auto rounded-2xl bg-accent-dim flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#5b7fff" strokeWidth="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>

        <div>
          <h1 className="font-display font-bold text-4xl text-white tracking-tight text-balance leading-tight">
            Your onchain agent.
          </h1>
          <h1 className="font-display font-bold text-4xl text-accent tracking-tight text-balance leading-tight">
            Just say what you want.
          </h1>
        </div>

        <p className="text-muted text-pretty leading-relaxed">
          Research tokens, track NFTs, and manage assets on Arc — powered by AI.
        </p>

        <Button
          size="lg"
          className="w-full"
          onClick={() => navigate('signin')}
        >
          Get started
        </Button>

        <p className="text-xs text-muted">
          Built on Arc &middot; USDC native gas
        </p>
      </motion.div>

      {/* Arc badge */}
      <p className="text-xs text-subtle">Powered by Arc Testnet</p>
    </div>
  )
}
