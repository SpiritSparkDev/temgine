import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';
import { listTemplates } from '../../../lib/templateStore';
import { listNavigations } from '../../../lib/navigationStore';

const UPLOAD_RE = /\/uploads\/[^\s"'<>()\?#]+/g;
const VARIANT_RE = /_(thumbnail|small|medium|large)(\.[^./]+)$/;

/**
 * GET /api/files/usage → { urls: [...] } – alle /uploads/-URLs, die in Seiten, Templates,
 * Snippets, Navigationen, Inhalts-Einträgen, Blog-Beiträgen oder Einstellungen vorkommen (Größenvarianten zählen für das Original).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAuth(req, res, ['ADMIN', 'MODERATOR', 'EDITOR']);
  if (!auth.authorized) return res.status(auth.status || 403).json({ error: auth.error || 'Zugriff verweigert' });

  try {
    const found = new Set();
    const scan = (v) => {
      if (v == null) return;
      const text = typeof v === 'string' ? v : JSON.stringify(v);
      for (const m of text.match(UPLOAD_RE) || []) {
        let u = m;
        try { u = decodeURIComponent(m); } catch { /* keep raw */ }
        found.add(m);
        found.add(u);
        found.add(u.replace(VARIANT_RE, '$2'));
      }
    };

    const [pages, snippets, entries, settings, posts] = await Promise.all([
      prisma.page.findMany({ select: { blocks: true, data: true, children: true } }),
      prisma.snippet.findMany({ select: { value: true } }),
      prisma.contentEntry.findMany({ select: { data: true } }),
      prisma.setting.findMany({ select: { value: true } }),
      prisma.blogPost.findMany({ select: { excerpt: true, body: true, coverImage: true, templateData: true } }),
    ]);
    pages.forEach(p => { scan(p.blocks); scan(p.data); scan(p.children); });
    snippets.forEach(s => scan(s.value));
    entries.forEach(e => scan(e.data));
    settings.forEach(s => scan(s.value));
    posts.forEach(b => { scan(b.excerpt); scan(b.body); scan(b.coverImage); scan(b.templateData); });
    listTemplates().forEach(t => scan(t.code));
    listNavigations().forEach(n => scan(n.code));

    res.status(200).json({ urls: [...found] });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Ermitteln der Verwendung: ' + error.message });
  }
}
