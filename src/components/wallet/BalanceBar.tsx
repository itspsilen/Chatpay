/**
 * BalanceBar — compact collapsible balance panel for the chat header.
 * Shows total USD value when collapsed; expands to show per-token rows.
 *
 * SECURITY: token names/symbols are untrusted data from chain.
 * Displayed as text only, never executed or interpolated into queries.
 */
import { useState } from 'react'
import { ChevronDown, ChevronUp, RefreshCw, AlertTriangle, ShieldCheck, ShieldOff, ExternalLink } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TokenBalance } from '../../lib/types'

const ARC_EXPLORER = 'https://explorer.testnet.arc.io'

interface Props {
  balances: TokenBalance[]
  loading: boolean
  error: string | undefined
  totalUsd: number
  lastRefresh: number
  onRefresh: () => void
}

export function BalanceBar({ balances, loading, error, totalUsd, lastRefresh, onRefresh }: Props) {
  const [expanded, setExpanded] = useState(false)

  const hasAny = balances.length > 0
  const nonZero = balances.filter((b) => parseFloat(b.balance) > 0)

  // Compact header row
  const headerRow = (
    <button
      onClick={() => setExpanded((e) => !e)}
      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/3 transition-colors"
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          {loading ? (
            <span className="text-xs text-muted/60 animate-pulse">Loading…</span>
          ) : error ? (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <AlertTriangle size={11} />
              Balance error
            </span>
          ) : (
            <>
              <span className="text-xs font-semibold text-white tabular-nums">
                ${totalUsd.toFixed(2)}
              </span>
              <span className="text-[10px] text-muted/50">testnet</span>
            </>
          )}
        </div>

        {/* Mini token chips — show up to 3 non-zero tokens */}
        {!loading && !error && nonZero.slice(0, 3).map((b) => (
          <span
            key={b.address}
            className="hidden sm:inline-flex text-[10px] bg-white/5 border border-white/8 rounded px-1.5 py-0.5 text-white/60 font-mono"
          >
            {/* Sanitised: strip non-alphanum */}
            {b.symbol.replace(/[^A-Za-z0-9]/g, '').slice(0, 6)}
            &nbsp;
            {parseFloat(b.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {lastRefresh > 0 && (
          <span className="hidden sm:block text-[10px] text-muted/40">
            {new Date(lastRefresh).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <span
          role="button"
          tabIndex={0}
          aria-label="Refresh balances"
          onClick={(e) => { e.stopPropagation(); onRefresh() }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onRefresh() } }}
          className="p-1 rounded-lg hover:bg-white/8 text-muted hover:text-white transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </span>
        {expanded ? <ChevronUp size={13} className="text-muted" /> : <ChevronDown size={13} className="text-muted" />}
      </div>
    </button>
  )

  return (
    <div className="border-b border-border">
      {headerRow}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-0 divide-y divide-border/50">
              {/* Skeleton */}
              {loading && !hasAny && [0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <div className="w-7 h-7 rounded-full bg-white/5 animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-2.5 w-14 bg-white/5 rounded animate-pulse" />
                    <div className="h-2 w-20 bg-white/5 rounded animate-pulse" />
                  </div>
                  <div className="h-2.5 w-12 bg-white/5 rounded animate-pulse" />
                </div>
              ))}

              {/* Token rows */}
              {balances.map((token) => (
                <TokenRow key={token.address} token={token} />
              ))}

              {/* Empty */}
              {!loading && balances.length === 0 && !error && (
                <p className="text-xs text-muted py-3 text-center">
                  No tokens yet. Get test USDC from the{' '}
                  <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer"
                    className="text-accent hover:underline">
                    Circle Faucet
                  </a>.
                </p>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 py-2.5 text-red-400 text-xs">
                  <AlertTriangle size={12} />
                  <span>Could not load balances: {error}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function TokenRow({ token }: { token: TokenBalance }) {
  const balance = parseFloat(token.balance)
  const isEmpty = balance === 0

  // Sanitise symbol for display — strip everything except alphanumeric
  const safeSymbol = token.symbol.replace(/[^A-Za-z0-9]/g, '').slice(0, 10)
  const safeName = token.name.slice(0, 40)

  return (
    <div className={`flex items-center gap-3 py-2.5 ${isEmpty ? 'opacity-50' : ''}`}>
      {/* Icon */}
      <div className="relative flex-shrink-0">
        <div className="w-7 h-7 rounded-full bg-accent-dim flex items-center justify-center text-[9px] font-bold text-accent">
          {safeSymbol.slice(0, 3)}
        </div>
        {token.verified
          ? <ShieldCheck size={9} className="absolute -bottom-0.5 -right-0.5 text-green-400" />
          : <ShieldOff size={9} className="absolute -bottom-0.5 -right-0.5 text-yellow-500/80" />
        }
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-white">{safeSymbol}</span>
          {!token.verified && (
            <span className="text-[9px] bg-yellow-500/10 text-yellow-400 px-1 py-0.5 rounded font-medium">unverified</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted truncate">{safeName}</span>
          <a
            href={`${ARC_EXPLORER}/token/${token.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted/30 hover:text-accent flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={8} />
          </a>
        </div>
      </div>

      {/* Balance */}
      <div className="text-right flex-shrink-0">
        {token.error ? (
          <span className="text-[10px] text-red-400 flex items-center gap-1">
            <AlertTriangle size={10} />
            Error
          </span>
        ) : (
          <>
            <p className="text-xs font-medium text-white tabular-nums">
              {balance.toLocaleString(undefined, { maximumFractionDigits: token.decimals > 6 ? 8 : 4 })}
            </p>
            {token.valueUsd != null ? (
              <p className="text-[10px] text-muted">${token.valueUsd}</p>
            ) : (
              <p className="text-[10px] text-muted/30">—</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
