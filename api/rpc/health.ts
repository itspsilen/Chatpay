import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setCors } from '../_cors'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res)
  return res.status(200).json({ ok: true, gemini: !!process.env.GEMINI_API_KEY })
}
