import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handlePreflight, setCors } from '../_cors'
import { checkAddress } from '../../server/arcClient'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return
  setCors(res)
  const address = (req.query.address as string) ?? ''
  try {
    return res.status(200).json(await checkAddress(address))
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message })
  }
}
