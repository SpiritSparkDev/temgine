import { prisma } from '../../lib/prisma'

export default async function handler(req, res) {
  try {
    // Return full pages list (all statuses) for debugging purposes
    const pages = await prisma.page.findMany({ orderBy: { createdAt: 'desc' } })
    console.log('DEBUG /api/debug-pages count:', pages.length)
    return res.status(200).json(pages)
  } catch (e) {
    console.error('DEBUG /api/debug-pages error', e)
    return res.status(500).json({ error: 'Server Fehler' })
  }
}
