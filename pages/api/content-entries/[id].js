import { prisma } from '../../../lib/prisma';

/**
 * API endpoint for individual content entry operations
 * GET: Get single entry, PUT: Update entry, DELETE: Delete entry
 */

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

export default async function handler(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      const [status, resp] = errorResponse(400, 'Entry ID erforderlich', 'VALIDATION_ERROR', { missing: ['id'] });
      return res.status(status).json(resp);
    }

    // GET: Retrieve single entry
    if (req.method === 'GET') {
      const entry = await prisma.contentEntry.findUnique({
        where: { id: String(id) },
        include: { contentType: true },
      });

      if (!entry) {
        const [status, resp] = errorResponse(404, 'Eintrag nicht gefunden', 'NOT_FOUND');
        return res.status(status).json(resp);
      }

      return res.status(200).json(entry);
    }

    // PUT: Update entry
    if (req.method === 'PUT') {
      const entry = await prisma.contentEntry.findUnique({
        where: { id: String(id) },
        include: { contentType: { include: { fields: true } } },
      });

      if (!entry) {
        const [status, resp] = errorResponse(404, 'Eintrag nicht gefunden', 'NOT_FOUND');
        return res.status(status).json(resp);
      }

      // Validate required fields
      const errors = {};
      entry.contentType.fields.forEach(field => {
        if (field.required && (!req.body[field.key] || req.body[field.key] === '')) {
          errors[field.key] = `${field.name} ist erforderlich`;
        }
      });

      if (Object.keys(errors).length > 0) {
        const [status, resp] = errorResponse(400, 'Validierungsfehler', 'VALIDATION_ERROR', errors);
        return res.status(status).json(resp);
      }

      const updated = await prisma.contentEntry.update({
        where: { id: String(id) },
        data: {
          data: req.body || {},
          title: req.body.title || req.body.name || entry.title,
          updatedAt: new Date(),
        },
      });

      return res.status(200).json(updated);
    }

    // DELETE: Delete entry
    if (req.method === 'DELETE') {
      const entry = await prisma.contentEntry.findUnique({
        where: { id: String(id) },
      });

      if (!entry) {
        const [status, resp] = errorResponse(404, 'Eintrag nicht gefunden', 'NOT_FOUND');
        return res.status(status).json(resp);
      }

      await prisma.contentEntry.delete({
        where: { id: String(id) },
      });

      return res.status(204).end();
    }

    const [status, resp] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
    return res.status(status).json(resp);
  } catch (error) {
    console.error('Content entry API error:', error);
    const [status, resp] = errorResponse(500, 'Interner Fehler', 'INTERNAL_ERROR', { error: error.message });
    return res.status(status).json(resp);
  }
}
