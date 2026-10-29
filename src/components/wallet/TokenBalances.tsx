/**
 * TokenBalances — shows all ERC-20 balances for the testnet wallet.
 *
 * SECURITY: token names, symbols, and metadata come from the blockchain and
 * are treated as untrusted data. They are displayed as text only, never
 * evaluated or used as instructions.
 */
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, AlertTriangle, Plus, ShieldCheck, Shield, ShieldOff, ExternalLink } from 'lucide-react'
import type { TokenBalance } from '../../lib/types'

interface Props {
  walletAddress: string
  /** Called after a successful refetch so the parent can update wallet context */
  onBalancesLoaded?: (balances: TokenBalance[]) => void
}

interface CustomTokenState {
  showing: boolean
  address: string
  loading: boolean
  error?: string
  preview?: { symbol: string; name: string; decimals: number }
}

const ARC_EXPLORER = 'https://explorer.testnet.arc.io'

export function TokenBalances({ walletAddress, onBalancesLoaded }: Props) {
  const [balances, setBalances] = useState<TokenBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<number>(0)
  const [error, setError] = useState<string>()
  const [customToken, setCustomToken] = useState<CustomTokenState>({ showing: false, address: '', loading: false })
  const [addedCustom, setAddedCustom] = useState<TokenBalance[]>([])

  const fetchBalances = useCallback(async () => {
    if (!walletAddress) return
    setLoading(true)
    setError(undefined)
    try {
      const res = await fetch(`/api/rpc/balances?address=${walletAddress}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as TokenBalance[]
      const all = [...data, ...addedCustom.filter(
        (c) => !data.find((d) => d.address.toLowerCase() === c.address.toLowerCase()),
      )]
      setBalances(all)
      onBalancesLoaded?.(all)
      setLastRefresh(Date.now())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [walletAddress, addedCustom, onBalancesLoaded])

  // Initial load
  useEffect(() => {
    void fetchBalances()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress])

  // Validate a custom token address
  const handleValidateCustom = async () => {
    if (!customToken.address.startsWith('0x') || customToken.address.length < 10) {
      setCustomToken((s) => ({ ...s, error: 'Enter a valid 0x address' }))
      return
    }
    setCustomToken((s) => ({ ...s, loading: true, error: undefined, preview: undefined }))
    try {
      const res = await fetch(`/api/rpc/validatetoken?address=${customToken.address}`)
      const data = (await res.json()) as { valid: boolean; symbol?: string; name?: string; decimals?: number; error?: string }
      if (!data.valid) {
        setCustomToken((s) => ({ ...s, loading: false, error: data.error ?? 'Not a valid ERC-20' }))
        return
      }
      setCustomToken((s) => ({
        ...s, loading: false,
        preview: { symbol: data.symbol ?? '?', name: data.name ?? '?', decimals: data.decimals ?? 18 },
      }))
    } catch {
      setCustomToken((s) => ({ ...s, loading: false, error: 'Network error' }))
    }
  }

  const handleAddCustom = async () => {
    if (!customToken.preview) return
    // Fetch its balance
    try {
      const res = await fetch(`/api/rpc/tokenbalance?wallet=${walletAddress}&token=${customToken.address}`)
      const bal = (await res.json()) as TokenBalance
      setAddedCustom((prev) => [...prev, bal])
      setBalances((prev) => [...prev, bal])
      onBalancesLoaded?.([...balances, bal])
    } catch {
      // Still add with 0 balance
      const stub: TokenBalance = {
        address: customToken.address,
        symbol: customToken.preview.symbol,
        name: customToken.preview.name,
        decimals: customToken.preview.decimals,
        balance: '0',
        balanceRaw: '0',
        verified: false,
      }
      setAddedCustom((prev) => [...prev, stub])
      setBalances((prev) => [...prev, stub])
    }
    setCustomToken({ showing: false, address: '', loading: false })
  }

  // ---- Render ----
  const totalUsd = balances.reduce((s, b) => s + parseFloat(b.valueUsd ?? '0'), 0)

  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <p className="text-xs text-muted">Total portfolio (testnet)</p>
          <p className="text-lg font-semibold text-white">
            {loading ? '—' : `$${totalUsd.toFixed(2)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh > 0 && (
            <span className="text-[10px] text-muted/50">
              {new Date(lastRefresh).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => { void fetchBalances() }}
            disabled={loading}
            className="p-2 rounded-xl hover:bg-white/5 text-muted hover:text-white transition-colors disabled:opacity-40"
            title="Refresh balances"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 text-red-400 text-sm border-b border-border">
          <AlertTriangle size={14} className="flex-shrink-0" />
          <span>Could not load balances: {error}</span>
        </div>
      )}

      {/* Skeleton */}
      {loading && balances.length === 0 && (
        <div className="divide-y divide-border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-16 bg-white/5 rounded animate-pulse" />
                <div className="h-2.5 w-24 bg-white/5 rounded animate-pulse" />
              </div>
              <div className="h-3 w-14 bg-white/5 rounded animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Token rows */}
      {!loading && balances.length > 0 && (
        <div className="divide-y divide-border">
          {balances.map((token) => (
            <TokenRow key={token.address} token={token} explorerBase={ARC_EXPLORER} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && balances.length === 0 && !error && (
        <div className="px-4 py-8 text-center text-muted text-sm">
          No tokens found. Get test USDC from the faucet to get started.
        </div>
      )}

      {/* Add custom token */}
      <div className="border-t border-border">
        {!customToken.showing ? (
          <button
            onClick={() => setCustomToken((s) => ({ ...s, showing: true }))}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-muted hover:text-white hover:bg-white/4 transition-colors"
          >
            <Plus size={14} />
            Add custom token
          </button>
        ) : (
          <div className="px-4 py-3 space-y-2">
            <p className="text-xs text-muted font-medium uppercase tracking-wide">Add custom token</p>
            <input
              type="text"
              placeholder="0x contract address"
              value={customToken.address}
              onChange={(e) => setCustomToken((s) => ({ ...s, address: e.target.value, preview: undefined, error: undefined }))}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm text-white placeholder-muted/40 focus:outline-none focus:border-accent font-mono"
            />
            {customToken.error && (
              <p className="text-xs text-red-400">{customToken.error}</p>
            )}
            {customToken.preview && (
              <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 rounded-xl px-3 py-2">
                <ShieldCheck size={13} />
                <span><strong>{customToken.preview.symbol}</strong> · {customToken.preview.name} · {customToken.preview.decimals} decimals</span>
              </div>
            )}
            <div className="flex gap-2">
              {!customToken.preview ? (
                <button
                  onClick={() => { void handleValidateCustom() }}
                  disabled={customToken.loading}
                  className="flex-1 py-2 rounded-xl bg-accent/20 text-accent text-sm font-medium hover:bg-accent/30 disabled:opacity-50 transition-colors"
                >
                  {customToken.loading ? 'Checking…' : 'Validate'}
                </button>
              ) : (
                <button
                  onClick={() => { void handleAddCustom() }}
                  className="flex-1 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
                >
                  Add token
                </button>
              )}
              <button
                onClick={() => setCustomToken({ showing: false, address: '', loading: false })}
                className="px-4 py-2 rounded-xl border border-border text-muted text-sm hover:text-white hover:border-white/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Single token row ----
function TokenRow({ token, explorerBase }: { token: TokenBalance; explorerBase: string }) {
  const balance = parseFloat(token.balance)
  const isEmpty = balance === 0

  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${isEmpty ? 'opacity-60' : ''}`}>
      {/* Icon / badge */}
      <div className="relative flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-accent-dim flex items-center justify-center text-[10px] font-bold text-accent">
          {/* Sanitised symbol — display only, not executed */}
          {token.symbol.replace(/[^A-Za-z0-9]/g, '').slice(0, 4)}
        </div>
        {/* Verified indicator */}
        {token.verified ? (
          <ShieldCheck size={10} className="absolute -bottom-0.5 -right-0.5 text-green-400" />
        ) : (
          <ShieldOff size={10} className="absolute -bottom-0.5 -right-0.5 text-yellow-400" />
        )}
      </div>

      {/* Name + address */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-white truncate">{token.symbol}</span>
          {!token.verified && (
            <span className="text-[10px] bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
              unverified
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted truncate">{token.name}</span>
          <a
            href={`${explorerBase}/token/${token.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted/40 hover:text-accent flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={9} />
          </a>
        </div>
      </div>

      {/* Balance + USD */}
      <div className="text-right flex-shrink-0">
        {token.error ? (
          <div className="flex items-center gap-1 text-red-400">
            <AlertTriangle size={11} />
            <span className="text-xs">Error</span>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-white tabular-nums">
              {parseFloat(token.balance).toLocaleString(undefined, { maximumFractionDigits: token.decimals > 6 ? 8 : 6 })}
            </p>
            {token.valueUsd != null ? (
              <p className="text-xs text-muted">${token.valueUsd}</p>
            ) : (
              <p className="text-xs text-muted/40">no price</p>
            )}
          </>
        )}
      </div>

      {/* Shield icon for known-safe contracts */}
      {token.verified && (
        <Shield size={11} className="text-accent/30 flex-shrink-0" />
      )}
    </div>
  )
}
