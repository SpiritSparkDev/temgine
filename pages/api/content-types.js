import { getContentTypes, getContentTypeBySlug, createContentType, updateContentType, deleteContentType } from '../../lib/contentModel'

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { slug } = req.query || {}
      if (slug) {
        const ct = await getContentTypeBySlug(String(slug))
        if (!ct) return res.status(404).json({ error: 'ContentType nicht gefunden' })
        return res.status(200).json(ct)
      }
      const list = await getContentTypes()
      return res.status(200).json(list)
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const ct = await createContentType(body)
      return res.status(200).json(ct)
    }

    if (req.method === 'PUT') {
      const body = req.body || {}
      if (!body.id) return res.status(400).json({ error: 'id erforderlich' })
      const ct = await updateContentType(body.id, body)
      return res.status(200).json(ct)
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id erforderlich' })
      await deleteContentType(id)
      return res.status(200).json({ ok: true })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server Fehler' })
  }
}
