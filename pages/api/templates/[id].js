import { prisma } from '../../../lib/prisma';
import { encodeBlogTemplateMeta, parseBlogTemplateMeta, validatePreviewSubset } from '../../../lib/blogTemplateWorkflow';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'ID fehlt' });

  try {
    if (req.method === 'PUT') {
      const { name, code, type, blogType, blogRole, masterTemplateName } = req.body || {};
      if (!name || !code) {
        return res.status(400).json({ error: 'Name und Code erforderlich' });
      }

      const normalizedBlogType = encodeBlogTemplateMeta(blogRole, masterTemplateName, blogType);
      const parsedMeta = parseBlogTemplateMeta(normalizedBlogType);

      if (parsedMeta.blogRole === 'preview') {
        if (!parsedMeta.masterTemplateName) {
          return res.status(400).json({
            error: 'Vorschau-Template benötigt ein Master-Template',
            code: 'VALIDATION_ERROR',
            details: { masterTemplateName: 'Pflichtfeld für Vorschau-Templates' },
          });
        }

        const masterTemplate = await prisma.template.findFirst({
          where: {
            name: { equals: String(parsedMeta.masterTemplateName), mode: 'insensitive' },
            NOT: { id: String(id) },
          },
          select: { name: true, code: true },
        });

        if (!masterTemplate) {
          return res.status(400).json({
            error: 'Master-Template nicht gefunden',
            code: 'MASTER_TEMPLATE_NOT_FOUND',
            details: { masterTemplateName: parsedMeta.masterTemplateName },
          });
        }

        const subset = validatePreviewSubset(String(code), String(masterTemplate.code || ''));
        if (!subset.ok) {
          return res.status(400).json({
            error: 'Vorschau enthält Platzhalter, die nicht im Master vorkommen',
            code: 'PREVIEW_PLACEHOLDER_MISMATCH',
            details: {
              masterTemplateName: masterTemplate.name,
              invalidPlaceholders: subset.invalid,
            },
          });
        }
      }

      const updated = await prisma.template.update({
        where: { id: String(id) },
        data: {
          name: String(name),
          code: String(code),
          type: type || 'BLOCK',
          blogType: normalizedBlogType || null,
        },
        select: { id: true, name: true, code: true, type: true, blogType: true },
      });
      const meta = parseBlogTemplateMeta(updated.blogType);
      return res.status(200).json({
        ...updated,
        blogRole: meta.blogRole,
        masterTemplateName: meta.masterTemplateName,
      });
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
