import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handlePreflight, setCors } from '../_cors.js'
import { getTokenBalance } from '../../server/arcClient.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return
  setCors(res)
  const wallet = (req.query.wallet as string) ?? ''
  const token  = (req.query.token  as string) ?? ''
  try {
    return res.status(200).json(await getTokenBalance(wallet, token))
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message })
  }
}
