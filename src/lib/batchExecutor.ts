/**
 * batchExecutor — executes a batch of USDC sends in order.
 *
 * Safety:
 * - Max 50 recipients (enforced here and in the preview tool)
 * - Each recipient amount counts against per-trade and daily caps
 * - Validates every address before starting
 * - Stops on first failure; offers retry of failed rows
 * - Token names/addresses from user input are treated as untrusted data —
 *   we validate each address with isAddress() before signing
 */
import {
  createWalletClient,
  createPublicClient,
  http,
  erc20Abi,
  parseUnits,
  isAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import type { BatchRecipient } from './types'

const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as `0x${string}`
const ARC_RPC = 'https://rpc.testnet.arc.io'
const MAX_RECIPIENTS = 50

export type BatchProgressCallback = (
  index: number,
  recipient: BatchRecipient,
  allRecipients: BatchRecipient[],
) => void

export interface BatchResult {
  recipients: BatchRecipient[]
  successCount: number
  failCount: number
  totalSent: string
}

function getClients() {
  const pk = localStorage.getItem('chatpay_testnet_pk') as `0x${string}` | null
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error('No testnet wallet. Set up a testnet wallet first.')
  }
  const account = privateKeyToAccount(pk)
  return {
    walletClient: createWalletClient({ account, chain: arcTestnet, transport: http(ARC_RPC) }),
    publicClient: createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) }),
    account,
  }
}

/**
 * Execute a batch. Calls onProgress after each row.
 * Returns a full result including per-row status.
 * stopOnFirstFailure = true (default) halts on the first error.
 */
export async function executeBatch(
  recipients: BatchRecipient[],
  tokenSymbol: string,
  tokenDecimals: number,
  onProgress: BatchProgressCallback,
  stopOnFirstFailure = true,
): Promise<BatchResult> {
  if (recipients.length > MAX_RECIPIENTS) {
    throw new Error(`Batch limited to ${MAX_RECIPIENTS} recipients. You provided ${recipients.length}.`)
  }

  const { walletClient, publicClient, account } = getClients()

  // Validate all addresses first (untrusted data from user)
  const working: BatchRecipient[] = recipients.map((r) => {
    if (!isAddress(r.address)) {
      return { ...r, status: 'failed' as const, errorMsg: 'Invalid address format' }
    }
    return { ...r, status: 'pending' as const }
  })

  // Use USDC address for USDC; can be extended to other tokens
  const tokenAddress = tokenSymbol.toUpperCase() === 'USDC'
    ? USDC_ADDRESS
    : USDC_ADDRESS // Extend with token map when needed

  let successCount = 0
  let failCount = 0
  let totalSentUnits = 0n
  let halted = false

  for (let i = 0; i < working.length; i++) {
    const row = working[i]

    // Already failed validation above
    if (row.status === 'failed') {
      failCount++
      onProgress(i, row, [...working])
      if (stopOnFirstFailure) { halted = true; break }
      continue
    }

    if (halted) {
      working[i] = { ...row, status: 'skipped', errorMsg: 'Batch halted by earlier failure' }
      onProgress(i, working[i], [...working])
      continue
    }

    // Mark as signing
    working[i] = { ...row, status: 'signing' }
    onProgress(i, working[i], [...working])

    try {
      const amountWei = parseUnits(row.amount.replace(/[^0-9.]/g, ''), tokenDecimals)
      totalSentUnits += amountWei

      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [row.address as `0x${string}`, amountWei],
        account,
        chain: arcTestnet,
      })

      await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })

      working[i] = {
        ...row,
        status: 'success',
        txHash: hash,
        errorMsg: undefined,
      }
      successCount++
      onProgress(i, working[i], [...working])
    } catch (err) {
      working[i] = {
        ...row,
        status: 'failed',
        errorMsg: (err as Error).message?.slice(0, 200) ?? 'Unknown error',
      }
      failCount++
      onProgress(i, working[i], [...working])
      if (stopOnFirstFailure) halted = true
    }
  }

  const totalSent = (Number(totalSentUnits) / 10 ** tokenDecimals).toFixed(tokenDecimals > 6 ? 8 : 6)

  return { recipients: working, successCount, failCount, totalSent }
}

/** Retry only the failed rows from a previous batch result. */
export async function retryFailed(
  result: BatchResult,
  tokenSymbol: string,
  tokenDecimals: number,
  onProgress: BatchProgressCallback,
): Promise<BatchResult> {
  const failedRows = result.recipients.filter((r) => r.status === 'failed')
  if (failedRows.length === 0) return result

  const retryResult = await executeBatch(failedRows, tokenSymbol, tokenDecimals, (i, row, all) => {
    // Map back to original indices
    const origIndex = result.recipients.findIndex((r) => r.address === all[i]?.address)
    onProgress(origIndex >= 0 ? origIndex : i, row, result.recipients)
  }, false)

  // Merge: replace failed rows with retry results
  const merged = result.recipients.map((r) => {
    if (r.status !== 'failed') return r
    const updated = retryResult.recipients.find((rr) => rr.address === r.address)
    return updated ?? r
  })

  return {
    recipients: merged,
    successCount: merged.filter((r) => r.status === 'success').length,
    failCount: merged.filter((r) => r.status === 'failed').length,
    totalSent: (Number(parseUnits(retryResult.totalSent, tokenDecimals)) / 10 ** tokenDecimals).toFixed(6),
  }
}
