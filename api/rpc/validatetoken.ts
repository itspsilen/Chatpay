import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handlePreflight, setCors } from '../_cors.js'
import { validateCustomToken } from '../../server/arcClient.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return
  setCors(res)
  const address = (req.query.address as string) ?? ''
  try {
    return res.status(200).json(await validateCustomToken(address))
  } catch (err) {
    return res.status(400).json({ valid: false, error: (err as Error).message })
  }
}
