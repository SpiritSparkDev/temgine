import { prisma } from '../../../lib/prisma'

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const name = req.query && req.query.name
      if (name) {
        // Case-insensitive lookup so client casing differences don't break rendering
        const t = await prisma.template.findFirst({ where: { name: { equals: String(name), mode: 'insensitive' } } })
        if (!t) {
          const [status, resp] = errorResponse(404, 'Template nicht gefunden', 'TEMPLATE_NOT_FOUND');
          return res.status(status).json(resp);
        }
        return res.status(200).json({ name: t.name, code: t.code, type: t.type })
      }

      // List templates with explicit field selection.
      // This avoids runtime 500 when local DB schema lags behind optional columns.
      const templates = await prisma.template.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, code: true, type: true },
      })
      const list = templates.map(t => ({ id: t.id, name: t.name, code: t.code, type: t.type }))
      return res.status(200).json(list)
    }

    if (req.method === 'POST') {
      const { name, code, type } = req.body || {}
      if (!name || !code) {
        const missing = [];
        if (!name) missing.push('name');
        if (!code) missing.push('code');
        const [status, resp] = errorResponse(400, 'Name und Code erforderlich', 'VALIDATION_ERROR', { missing });
        return res.status(status).json(resp);
      }
      // normalize type — always BLOCK
      const ttype = 'BLOCK'
      const up = await prisma.template.upsert({
        where: { name: String(name) },
        create: { name: String(name), code: String(code), type: ttype },
        update: { code: String(code), type: ttype },
        select: { id: true, name: true, code: true, type: true },
      })
      return res.status(200).json({ ok: true, id: up.id, name: up.name, code: up.code, type: up.type })
    }

    if (req.method === 'DELETE') {
      const { name } = req.body || {}
      if (!name) {
        const [status, resp] = errorResponse(400, 'Name erforderlich', 'VALIDATION_ERROR', { missing: ['name'] });
        return res.status(status).json(resp);
      }
      try {
        await prisma.template.delete({ where: { name: String(name) } })
        return res.status(200).json({ ok: true })
      } catch (e) {
        if (e.code === 'P2025') {
          const [status, resp] = errorResponse(404, 'Template nicht gefunden', 'TEMPLATE_NOT_FOUND');
          return res.status(status).json(resp);
        }
        throw e;
      }
    }

    const [status, resp] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
    return res.status(status).json(resp);
  } catch (e) {
    console.error('[/api/templates Error]', e.message, e.stack)
    const [status, resp] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', { message: process.env.NODE_ENV === 'production' ? undefined : e.message });
    return res.status(status).json(resp);
  }
}
