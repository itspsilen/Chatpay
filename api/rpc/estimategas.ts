import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handlePreflight, setCors } from '../_cors.js'
import { estimateGasForSend } from '../../server/arcClient.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return
  setCors(res)
  const from   = (req.query.from   as string) ?? ''
  const to     = (req.query.to     as string) ?? ''
  const amount = (req.query.amount as string) ?? '0'
  const token  = (req.query.token  as string) ?? undefined
  try {
    return res.status(200).json(
      await estimateGasForSend(from, to, amount, token as `0x${string}` | undefined)
    )
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message })
  }
}
