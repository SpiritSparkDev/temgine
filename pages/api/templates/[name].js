import { getTemplateByName, saveTemplate, deleteTemplateByName } from '../../../lib/templateStore';
import { validatePreviewSubset } from '../../../lib/blogTemplateWorkflow';

export default async function handler(req, res) {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'Name fehlt' });

  try {
    if (req.method === 'PUT') {
      const { name: newName, code, type, blogRole, masterTemplateName } = req.body || {};
      if (!newName || !code) {
        return res.status(400).json({ error: 'Name und Code erforderlich' });
      }

      const existing = getTemplateByName(String(name));
      if (!existing) {
        return res.status(404).json({ error: 'Template nicht gefunden' });
      }

      const role = String(blogRole || '').trim().toLowerCase() || null;

      if (role === 'preview') {
        const master = String(masterTemplateName || '').trim();
        if (!master) {
          return res.status(400).json({
            error: 'Vorschau-Template benötigt ein Master-Template',
            code: 'VALIDATION_ERROR',
            details: { masterTemplateName: 'Pflichtfeld für Vorschau-Templates' },
          });
        }

        const masterTemplate = getTemplateByName(master);
        if (!masterTemplate || masterTemplate.name.toLowerCase() === String(newName).toLowerCase()) {
          return res.status(400).json({
            error: 'Master-Template nicht gefunden',
            code: 'MASTER_TEMPLATE_NOT_FOUND',
            details: { masterTemplateName: master },
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

      const ttype = String(type || 'BLOCK').toUpperCase() === 'SITE' ? 'SITE' : 'BLOCK';
      const saved = saveTemplate(
        {
          name: String(newName),
          code: String(code),
          type: ttype,
          blogRole: role,
          masterTemplateName: role === 'preview' ? String(masterTemplateName).trim() : null,
        },
        existing.name
      );
      const full = getTemplateByName(saved.name);
      return res.status(200).json({
        id: full.name,
        name: full.name,
        code: full.code,
        type: full.type,
        blogRole: full.blogRole,
        masterTemplateName: full.masterTemplateName,
      });
    }

    if (req.method === 'DELETE') {
      const deleted = deleteTemplateByName(String(name));
      if (!deleted) return res.status(404).json({ error: 'Template nicht gefunden' });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  } catch (e) {
    console.error('[/api/templates/[name]]', e.message);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
}
