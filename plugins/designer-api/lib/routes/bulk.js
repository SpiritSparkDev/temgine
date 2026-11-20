import { NAME_RE, sha256, fromKind, MAX_CODE } from '../common';

export const features = ['bulk'];

export const MAX_ITEMS = 100;
const NOT_WRITTEN = 'not-written';

// POST /bulk (WP-B11): mehrere Templates und CSS-Dateien alles-oder-nichts schreiben.
// Body: { templates: [{ name, code, kind, master?, expectedHash? }], css: [{ filename, content, expectedHash? }], dryRun? }
// Reihenfolge: erst alle CSS-Dateien, dann die Templates in der gesendeten Reihenfolge (Blog-Master vor ihren Vorschauen).
// 1. Planen: jede Datei wird wie bei PUT geprüft (Validierung, Hash-Konflikt, Name). Gibt es einen Fehler, wird nichts geschrieben.
// 2. Schreiben mit Zustandsmerker je Datei; scheitert eine, werden die schon geschriebenen zurückgesetzt (Rückgängig-Information in der Antwort).
// ponytail: Rückgängig = Wiederherstellen des alten Inhalts; Änderungszeit (mtime) und leere Blog-Ordner angelegter Master werden nicht zurückgesetzt.
export const routes = ({ core, authed, audit, validateTemplate }) => ({
  'POST v1/bulk': authed('edit', async (req, res, ctx, user) => {
    const body = req.body || {};
    const tpls = body.templates === undefined ? [] : body.templates;
    const csss = body.css === undefined ? [] : body.css;
    if (!Array.isArray(tpls) || !Array.isArray(csss)) return ctx.fail(400, 'templates und css müssen Listen sein', 'VALIDATION_ERROR', { path: Array.isArray(tpls) ? 'css' : 'templates' });
    if (!tpls.length && !csss.length) return ctx.fail(400, 'Nichts zu übertragen', 'VALIDATION_ERROR', { path: 'templates' });
    if (tpls.length + csss.length > MAX_ITEMS) return ctx.fail(400, `Höchstens ${MAX_ITEMS} Dateien je Sammelübertragung`, 'BULK_TOO_LARGE', { path: 'templates' });
    if (csss.length && !core.roles.cssEdit.includes(user.role)) return ctx.fail(403, 'Keine Berechtigung für CSS', 'FORBIDDEN');
    const dry = body.dryRun === true || ctx.query?.dryRun === '1' || ctx.query?.dryRun === 'true';

    // ---- 1. Planen -------------------------------------------------------------------------------------------------
    const plan = []; // { type, name, action, hash, write(), undo(), result }
    const seen = new Set();
    const planned = new Map(); // Templates dieser Anfrage (für Blog-Vorschauen, deren Master mitkommt)
    // Temgines Store liest bei jeder Namenssuche alle Template-Dateien: einmal listen statt je Template (50 Templates: Quadrat vermeiden)
    const existing = new Map(core.store.listTemplates().map((t) => [t.name.toLowerCase(), t]));
    const find = (n) => existing.get(String(n).toLowerCase()) || null;
    let failed = 0;
    const bad = (item, code, message, path) => { failed += 1; plan.push({ ...item, error: { code, message, path } }); };

    csss.forEach((c, i) => {
      const path = `css[${i}]`;
      const item = { type: 'css', name: String(c?.filename ?? '') };
      let filename;
      try { filename = core.externCss.normalize(String(c?.filename ?? '')); } catch (_e) { filename = ''; }
      if (!filename || !filename.startsWith('designer-')) return bad(item, 'VALIDATION_ERROR', 'Nur Dateien mit dem Namensanfang "designer-" erlaubt', `${path}.filename`);
      item.name = filename;
      if (typeof c.content !== 'string') return bad(item, 'VALIDATION_ERROR', 'Inhalt fehlt', `${path}.content`);
      if (c.content.length > MAX_CODE) return bad(item, 'CODE_TOO_LARGE', 'Inhalt zu groß', `${path}.content`);
      if (seen.has(`css:${filename}`)) return bad(item, 'DUPLICATE', 'Datei kommt mehrfach vor', path);
      seen.add(`css:${filename}`);
      const prev = core.externCss.list().find((f) => f.filename === filename) || null;
      if (prev && c.expectedHash && sha256(prev.content) !== c.expectedHash) return bad(item, 'CSS_CHANGED', 'CSS-Datei wurde in Temgine geändert', path);
      const hash = sha256(c.content);
      const same = prev && sha256(prev.content) === hash;
      return plan.push({
        ...item, hash, action: same ? 'unchanged' : prev ? 'update' : 'create',
        write: () => core.externCss.write(filename, c.content),
        undo: () => (prev ? core.externCss.write(filename, prev.content) : core.externCss.remove(filename)),
      });
    });

    for (let i = 0; i < tpls.length; i += 1) {
      const t = tpls[i] || {};
      const path = `templates[${i}]`;
      const item = { type: 'template', name: String(t.name ?? '') };
      const { code, kind = 'block', master = null } = t;
      const name = item.name.trim();
      if (!NAME_RE.test(name) || name.startsWith('.')) { bad(item, 'VALIDATION_ERROR', 'Ungültiger Template-Name', `${path}.name`); continue; }
      item.name = name;
      if (seen.has(`tpl:${name.toLowerCase()}`)) { bad(item, 'DUPLICATE', 'Template kommt mehrfach vor', path); continue; }
      seen.add(`tpl:${name.toLowerCase()}`);
      const errors = await validateTemplate({ code, kind, master }, (m) => planned.get(String(m).toLowerCase()) || find(m));
      if (errors.length) { bad(item, errors[0].code, errors[0].message, `${path}.${errors[0].path || 'code'}`); continue; }
      const prev = find(name);
      if (prev && t.expectedHash && sha256(prev.code) !== t.expectedHash) { bad(item, 'TEMPLATE_CHANGED', 'Template wurde in Temgine geändert', path); continue; }
      planned.set(name.toLowerCase(), { code });
      const hash = sha256(code);
      const meta = fromKind(kind, master);
      const same = prev && sha256(prev.code) === hash && String(prev.type).toUpperCase() === meta.type && (prev.blogRole || null) === meta.blogRole
        && (prev.masterTemplateName || null) === meta.masterTemplateName && (prev.category || null) === meta.category;
      plan.push({
        ...item, hash, action: same ? 'unchanged' : prev ? 'update' : 'create',
        write: () => core.store.saveTemplate({ name, code, ...meta }, prev ? prev.name : null),
        undo: () => (prev
          ? core.store.saveTemplate({ name: prev.name, code: prev.code, type: prev.type, blogRole: prev.blogRole, masterTemplateName: prev.masterTemplateName, category: prev.category }, name)
          : core.store.deleteTemplateByName(name)),
      });
    }

    const view = (p, status, extra = {}) => ({ type: p.type, name: p.name, ...(p.action ? { action: p.action } : {}), ...(p.hash ? { hash: p.hash } : {}), status, ...extra });

    if (failed) {
      const results = plan.map((p) => (p.error ? view(p, 'error', p.error) : view(p, NOT_WRITTEN)));
      const conflictOnly = plan.filter((p) => p.error).every((p) => ['TEMPLATE_CHANGED', 'CSS_CHANGED'].includes(p.error.code));
      return ctx.fail(conflictOnly ? 409 : 400, `Sammelübertragung abgelehnt: ${failed} von ${plan.length} Dateien fehlerhaft, nichts wurde geschrieben`, 'BULK_FAILED', {
        details: plan.filter((p) => p.error).map((p) => p.error), results, written: 0, rolledBack: false,
      });
    }
    if (dry) return res.status(200).json({ ok: true, dryRun: true, written: 0, results: plan.map((p) => view(p, 'ok')) });

    // ---- 2. Schreiben mit Rückgängig -------------------------------------------------------------------------------
    const done = [];
    const order = core.externCss.orderState?.(); // Temgines .order.json (Reihenfolge der CSS-Dateien) wird beim Schreiben ergänzt und gehört zum Rückgängig
    let broke = null;
    for (const p of plan) {
      if (p.action === 'unchanged') continue;
      try { p.write(); done.push(p); } catch (e) { broke = { p, message: e.message }; break; }
    }
    if (broke) {
      const restored = [];
      const undoFailed = [];
      for (const p of [...done].reverse()) {
        try { p.undo(); restored.push(p.name); } catch (e) { undoFailed.push({ name: p.name, message: e.message }); }
      }
      if (order !== undefined) { try { core.externCss.restoreOrder(order); } catch (e) { undoFailed.push({ name: '.order.json', message: e.message }); } }
      const results = plan.map((p) => (p === broke.p ? view(p, 'error', { code: 'WRITE_FAILED', message: broke.message })
        : done.includes(p) ? view(p, undoFailed.some((u) => u.name === p.name) ? 'rollback-failed' : 'rolled-back') : view(p, NOT_WRITTEN)));
      await audit(user, 'bulk.failed', `${plan.length} Dateien`, { failedAt: broke.p.name, restored: restored.length, undoFailed: undoFailed.length });
      return ctx.fail(500, `Schreiben von „${broke.p.name}“ fehlgeschlagen; ${undoFailed.length ? 'Zurücksetzen teilweise fehlgeschlagen' : 'alle Änderungen wurden zurückgesetzt'}`, 'BULK_FAILED', {
        results, written: 0, rolledBack: !undoFailed.length, undo: { restored, failed: undoFailed },
      });
    }
    await audit(user, 'bulk', `${plan.length} Dateien`, { templates: tpls.length, css: csss.length, written: done.length });
    return res.status(200).json({ ok: true, dryRun: false, written: done.length, results: plan.map((p) => view(p, 'ok')) });
  }, { rateLimit: { windowMs: 60000, max: 30 } }),
});
