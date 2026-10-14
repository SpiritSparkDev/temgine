import { requireAuth, CONFIGURABLE_PERMISSIONS, rolesFor, writeRoleOverrides } from '../../../lib/auth';

function matrix() {
  const out = {};
  for (const role of ['MODERATOR', 'EDITOR']) {
    out[role] = {};
    for (const key of Object.keys(CONFIGURABLE_PERMISSIONS)) out[role][key] = rolesFor(key).includes(role);
  }
  return out;
}

export default async function handler(req, res) {
  const auth = await requireAuth(req, res, ['ADMIN']);
  if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error });

  if (req.method === 'GET') return res.status(200).json({ labels: CONFIGURABLE_PERMISSIONS, matrix: matrix() });
  if (req.method === 'PUT') {
    writeRoleOverrides(req.body?.matrix);
    return res.status(200).json({ ok: true, matrix: matrix() });
  }
  res.status(405).json({ error: 'Methode nicht erlaubt' });
}
