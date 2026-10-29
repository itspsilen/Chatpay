/**
 * Testnet-only browser wallet.
 * Generates a fresh private key in localStorage.
 * NEVER used on mainnet. Private key never leaves the browser.
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const LS_KEY = 'chatpay_testnet_pk'

export interface TestnetWallet {
  address: `0x${string}`
  /** Raw private key — ONLY for testnet. Kept in localStorage, never sent anywhere. */
  privateKey: `0x${string}`
}

export function getOrCreateTestnetWallet(): TestnetWallet {
  let pk = localStorage.getItem(LS_KEY) as `0x${string}` | null
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    pk = generatePrivateKey()
    localStorage.setItem(LS_KEY, pk)
  }
  const account = privateKeyToAccount(pk)
  return { address: account.address, privateKey: pk }
}

export function clearTestnetWallet() {
  localStorage.removeItem(LS_KEY)
}

export function getTestnetWalletAddress(): `0x${string}` | null {
  const pk = localStorage.getItem(LS_KEY) as `0x${string}` | null
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) return null
  return privateKeyToAccount(pk).address
}
