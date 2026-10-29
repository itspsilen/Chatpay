/**
 * useTokenBalances — fetches all token balances for the testnet wallet.
 * Exposes a refetch() function so callers can trigger a refresh after tx.
 *
 * SECURITY: token names/symbols from chain are untrusted data — never executed.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import type { TokenBalance } from '../lib/types'

interface UseTokenBalancesResult {
  balances: TokenBalance[]
  loading: boolean
  error: string | undefined
  totalUsd: number
  refetch: () => void
  lastRefresh: number
}

export function useTokenBalances(walletAddress: string | undefined): UseTokenBalancesResult {
  const [balances, setBalances] = useState<TokenBalance[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [lastRefresh, setLastRefresh] = useState(0)
  // Track whether we've done the initial load for this address
  const initialLoadDone = useRef<string | undefined>(undefined)

  const refetch = useCallback(async () => {
    if (!walletAddress) return
    setLoading(true)
    setError(undefined)
    try {
      const res = await fetch(`/api/rpc/balances?address=${walletAddress}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as TokenBalance[]
      setBalances(data)
      setLastRefresh(Date.now())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [walletAddress])

  // Auto-fetch when address changes
  useEffect(() => {
    if (!walletAddress) return
    if (initialLoadDone.current === walletAddress) return
    initialLoadDone.current = walletAddress
    void refetch()
  }, [walletAddress, refetch])

  const totalUsd = balances.reduce((s, b) => s + parseFloat(b.valueUsd ?? '0'), 0)

  return { balances, loading, error, totalUsd, refetch: () => { void refetch() }, lastRefresh }
}
