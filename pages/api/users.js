import { prisma } from '../../lib/prisma';

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      
      return res.status(200).json({ users });
    } else if (req.method === 'DELETE') {
      const { userId } = req.body || {};
      
      if (!userId) {
        const [status, resp] = errorResponse(400, 'Benutzer-ID erforderlich', 'VALIDATION_ERROR', { missing: ['userId'] });
        return res.status(status).json(resp);
      }

      try {
        await prisma.user.delete({
          where: { id: userId },
        });
        return res.status(200).json({ success: true });
      } catch (e) {
        if (e.code === 'P2025') {
          const [status, resp] = errorResponse(404, 'Benutzer nicht gefunden', 'USER_NOT_FOUND');
          return res.status(status).json(resp);
        }
        throw e;
      }
    } else {
      const [status, resp] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
      return res.status(status).json(resp);
    }
  } catch (error) {
    console.error('[/api/users Error]', error.message, error.stack);
    const [status, resp] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', { message: process.env.NODE_ENV === 'production' ? undefined : error.message });
    return res.status(status).json(resp);
  }
}
