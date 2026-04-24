import { prisma } from '../../lib/prisma';

/**
 * API endpoint for managing content entries
 * GET: List entries for a model, POST: Create new entry
 * PUT: Update entry (per ID in query), DELETE: Delete entry (per ID in query)
 */

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

export default async function handler(req, res) {
  try {
    const { contentTypeId, id } = req.query;

    // GET: List entries for a content type
    if (req.method === 'GET') {
      if (!contentTypeId) {
        const [status, resp] = errorResponse(400, 'contentTypeId erforderlich', 'VALIDATION_ERROR', { missing: ['contentTypeId'] });
        return res.status(status).json(resp);
      }

      const entries = await prisma.contentEntry.findMany({
        where: { contentTypeId: String(contentTypeId) },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json(entries);
    }

    // POST: Create new entry
    if (req.method === 'POST') {
      if (!contentTypeId) {
        const [status, resp] = errorResponse(400, 'contentTypeId erforderlich', 'VALIDATION_ERROR', { missing: ['contentTypeId'] });
        return res.status(status).json(resp);
      }

      const contentType = await prisma.contentType.findUnique({
        where: { id: String(contentTypeId) },
        include: { fields: true },
      });

      if (!contentType) {
        const [status, resp] = errorResponse(404, 'Content Type nicht gefunden', 'NOT_FOUND');
        return res.status(status).json(resp);
      }

      // Validate required fields
      const errors = {};
      contentType.fields.forEach(field => {
        if (field.required && (!req.body[field.key] || req.body[field.key] === '')) {
          errors[field.key] = `${field.name} ist erforderlich`;
        }
      });

      if (Object.keys(errors).length > 0) {
        const [status, resp] = errorResponse(400, 'Validierungsfehler', 'VALIDATION_ERROR', errors);
        return res.status(status).json(resp);
      }

      const entry = await prisma.contentEntry.create({
        data: {
          contentTypeId: String(contentTypeId),
          data: req.body || {},
          title: req.body.title || req.body.name || '',
        },
      });

      return res.status(201).json(entry);
    }

    // PUT: Update entry
    if (req.method === 'PUT') {
      if (!id) {
        const [status, resp] = errorResponse(400, 'Entry ID erforderlich', 'VALIDATION_ERROR', { missing: ['id'] });
        return res.status(status).json(resp);
      }

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
      if (!id) {
        const [status, resp] = errorResponse(400, 'Entry ID erforderlich', 'VALIDATION_ERROR', { missing: ['id'] });
        return res.status(status).json(resp);
      }

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
    console.error('Content entries API error:', error);
    const [status, resp] = errorResponse(500, 'Interner Fehler', 'INTERNAL_ERROR', { error: error.message });
    return res.status(status).json(resp);
  }
}
