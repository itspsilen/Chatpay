import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handlePreflight, setCors } from '../_cors.js'
import { getTxHistory } from '../../server/arcClient.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return
  setCors(res)
  const address = (req.query.address as string) ?? ''
  const limit   = Math.min(parseInt((req.query.limit as string) ?? '20', 10), 50)
  try {
    return res.status(200).json(await getTxHistory(address, limit))
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message })
  }
}
