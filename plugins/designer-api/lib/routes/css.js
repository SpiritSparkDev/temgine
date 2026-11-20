import { sha256, ifMatchHash, isDryRun, paginate, setEtag } from '../common';

export const features = ['dry-run', 'etag', 'pagination'];

export const routes = ({ core, authed, audit }) => {
  const mine = () => core.externCss.list().filter((f) => f.filename.startsWith('designer-'));
  const shapeCss = (f) => ({ filename: f.filename, content: f.content, hash: sha256(f.content) });

  return {
    'GET v1/css': authed('cssView', (req, res, ctx) => {
      const p = paginate(ctx, mine().map(shapeCss), (f) => f.filename);
      return p.bad ? ctx.fail(400, p.bad, 'VALIDATION_ERROR', { path: p.path }) : res.status(200).json(p.body);
    }),

    'GET v1/css/:file': authed('cssView', (req, res, ctx) => {
      const filename = core.externCss.normalize(ctx.params.file);
      const f = mine().find((x) => x.filename === filename);
      if (!f) return ctx.fail(404, 'Datei nicht gefunden', 'NOT_FOUND');
      setEtag(res, ctx, sha256(f.content));
      return res.status(200).json(shapeCss(f));
    }),

    'PUT v1/css/:file': authed('cssEdit', async (req, res, ctx, user) => {
      const filename = core.externCss.normalize(ctx.params.file);
      const { content, expectedHash } = req.body || {};
      if (!filename.startsWith('designer-')) return ctx.fail(400, 'Nur Dateien mit dem Namensanfang "designer-" erlaubt', 'VALIDATION_ERROR', { path: 'file' });
      if (typeof content !== 'string') return ctx.fail(400, 'Inhalt fehlt', 'VALIDATION_ERROR', { path: 'content' });
      const existing = core.externCss.list().find((f) => f.filename === filename);
      const expected = expectedHash || (ctx.v >= 2 ? ifMatchHash(req) : null);
      if (existing && expected && sha256(existing.content) !== expected) {
        return ctx.fail(409, 'CSS-Datei wurde in Temgine geändert', 'CSS_CHANGED', { current: shapeCss(existing) });
      }
      const hash = sha256(content);
      setEtag(res, ctx, hash);
      if (isDryRun(req, ctx)) return res.status(200).json({ dryRun: true, action: existing ? 'update' : 'create', filename, hash });
      core.externCss.write(filename, content);
      await audit(user, 'css.write', filename, null);
      return res.status(200).json({ filename, hash });
    }),

    'DELETE v1/css/:file': authed('cssDelete', async (req, res, ctx, user) => {
      const filename = core.externCss.normalize(ctx.params.file);
      const f = filename.startsWith('designer-') && core.externCss.list().find((x) => x.filename === filename);
      if (!f) return ctx.fail(404, 'Datei nicht gefunden', 'NOT_FOUND');
      const expected = ctx.v >= 2 ? ifMatchHash(req) : null;
      if (expected && sha256(f.content) !== expected) return ctx.fail(409, 'CSS-Datei wurde in Temgine geändert', 'CSS_CHANGED', { current: shapeCss(f) });
      if (isDryRun(req, ctx)) return res.status(200).json({ dryRun: true, action: 'delete', filename });
      core.externCss.remove(filename);
      await audit(user, 'css.delete', filename, null);
      return res.status(200).json({ ok: true });
    }),
  };
};
