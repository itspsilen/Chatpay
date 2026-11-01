import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handlePreflight, setCors } from '../_cors.js'
import { getAllBalances } from '../../server/arcClient.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return
  setCors(res)
  const address = (req.query.address as string) ?? ''
  try {
    const balances = await getAllBalances(address)
    return res.status(200).json(balances)
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message })
  }
}
