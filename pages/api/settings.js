import { prisma } from '../../lib/prisma'

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

export default async function handler(req, res) {
  try {
    // GET: alle Settings als { key: value }-Map zurückgeben
    if (req.method === 'GET') {
      const settings = await prisma.setting.findMany()
      const map = {}
      for (const s of settings) {
        map[s.key] = s.value
      }
      return res.status(200).json(map)
    }

    // PUT: einzelne Einstellung speichern { key, value }
    if (req.method === 'PUT') {
      const { key, value } = req.body || {}
      if (!key) {
        const [status, resp] = errorResponse(400, 'key erforderlich', 'VALIDATION_ERROR', { missing: ['key'] });
        return res.status(status).json(resp);
      }
      if (value === undefined || value === null) {
        const [status, resp] = errorResponse(400, 'value erforderlich', 'VALIDATION_ERROR', { missing: ['value'] });
        return res.status(status).json(resp);
      }

      const setting = await prisma.setting.upsert({
        where: { key: String(key) },
        update: { value: String(value) },
        create: { key: String(key), value: String(value) },
      })
      return res.status(200).json(setting)
    }

    const [status, resp] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
    return res.status(status).json(resp);
  } catch (e) {
    console.error('[/api/settings Error]', e.message, e.stack)
    const [status, resp] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', { message: process.env.NODE_ENV === 'production' ? undefined : e.message });
    return res.status(status).json(resp);
  }
}
