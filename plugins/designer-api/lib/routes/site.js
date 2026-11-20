import { sha256 } from '../common';

// WP-B3: nur lesender Zugriff auf das Seiten-CSS (alle AKTIVEN CSS-Dateien in Temgines Reihenfolge) und die Schriftenliste.
// Es gibt bewusst keine Schreibroute: Seiten-CSS wird vom Designer nie zurückgeschrieben (Schreiben nur über PUT /css/designer-*).
export const features = ['site-css'];

export const MAX_SITE_BYTES = 2 * 1024 * 1024; // Obergrenze für die Antwort (Summe der CSS-Inhalte)

// Schriftfamilie wie Temgines /api/fonts-css: Dateiname ohne Endung, [-_] -> Leerzeichen
export const familyOf = (name) => String(name).replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').replace(/["\\\r\n]/g, '');
const SAFE_EXTS = ['.woff', '.woff2']; // nur diese gibt Temgine als @font-face aus

export const routes = ({ core, authed }) => ({
  // core.siteCss.list() -> [{ id, filename, source, href, enabled, content?, error? }] in Temgines Reihenfolge
  'GET v1/site/css': authed('cssView', (req, res, ctx) => {
    let all;
    try { all = core.siteCss.list(); } catch (e) { return ctx.fail(500, 'Seiten-CSS nicht lesbar', 'SITE_CSS_FAILED'); }
    const files = [];
    const skipped = [];
    let total = 0;
    for (const f of all.filter((x) => x.enabled !== false)) {
      if (typeof f.content !== 'string') { skipped.push({ filename: f.filename, reason: 'READ_ERROR' }); continue; }
      const size = Buffer.byteLength(f.content);
      if (total + size > MAX_SITE_BYTES) { skipped.push({ filename: f.filename, reason: 'SIZE_LIMIT' }); continue; }
      total += size;
      files.push({ id: f.id, filename: f.filename, source: f.source, href: f.href, size, hash: sha256(f.content), content: f.content });
    }
    return res.status(200).json({ files, skipped, totalBytes: total, truncated: skipped.some((s) => s.reason === 'SIZE_LIMIT') });
  }),

  // core.siteFonts.list() -> [{ id, name, ext, format, href, enabled }]; `css` = @font-face wie Temgines /api/fonts-css
  'GET v1/site/fonts': authed('filesView', (req, res, ctx) => {
    let all;
    try { all = core.siteFonts.list(); } catch (e) { return ctx.fail(500, 'Schriften nicht lesbar', 'SITE_FONTS_FAILED'); }
    const fonts = all.filter((f) => f.enabled !== false).map((f) => ({ id: f.id, name: f.name, family: familyOf(f.name), format: f.format, href: f.href, emitted: SAFE_EXTS.includes(f.ext) }));
    const css = fonts.filter((f) => f.emitted).map((f) => `@font-face {\n  font-family: "${f.family}";\n  src: url("${encodeURI(f.href)}") format("${f.format}");\n  font-display: swap;\n}`).join('\n\n');
    return res.status(200).json({ fonts, css });
  }),
});
