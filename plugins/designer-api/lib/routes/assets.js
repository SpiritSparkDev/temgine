import { paginate } from '../common';

export const features = ['pagination'];

export const routes = ({ core, authed }) => ({
  'GET v1/assets': authed('filesView', (req, res, ctx) => {
    const list = core.listUploads(String(ctx.query?.path || '')).map((i) => ({ path: i.path, url: i.url, name: i.name, size: i.size, isImage: i.isImage }));
    const p = paginate(ctx, list, (i) => i.path);
    return p.bad ? ctx.fail(400, p.bad, 'VALIDATION_ERROR', { path: p.path }) : res.status(200).json(p.body);
  }),
});
