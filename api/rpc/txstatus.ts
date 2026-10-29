import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handlePreflight, setCors } from '../_cors'
import { getTxStatus } from '../../server/arcClient'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return
  setCors(res)
  const hash = (req.query.hash as string) ?? ''
  try {
    return res.status(200).json(await getTxStatus(hash))
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message })
  }
}
