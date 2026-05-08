import { prisma } from '../../../lib/prisma';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID fehlt' });

  try {
    if (req.method === 'PUT') {
      const { name, code, type, blogType } = req.body || {};
      if (!name || !code) {
        return res.status(400).json({ error: 'Name und Code erforderlich' });
      }
      const updated = await prisma.template.update({
        where: { id: String(id) },
        data: { name: String(name), code: String(code), type: type || 'BLOCK', blogType: blogType || null },
      });
      return res.status(200).json(updated);
    }

    if (req.method === 'DELETE') {
      await prisma.template.delete({ where: { id: String(id) } });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Template nicht gefunden' });
    console.error('[/api/templates/[id]]', e.message);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
}
