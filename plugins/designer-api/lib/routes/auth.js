import crypto from 'crypto';
import { signToken } from '../tokens';
import { registerToken, passwordLoginAllowed } from '../registry';
import { sha256 } from '../common';

export const features = [];

export const routes = ({ core, open, audit }) => ({
  'POST v1/auth/login': open(async (req, res, ctx) => {
    const s = core.secret();
    if (!s) return ctx.fail(503, 'Plugin nicht eingerichtet (kein Secret)', 'NOT_CONFIGURED');
    if (!(await passwordLoginAllowed(core.state))) return ctx.fail(403, 'Die Passwort-Anmeldung ist in Temgine abgeschaltet. Bitte mit einem Kopplungscode verbinden (Einstellungen → Plugins → Designer verbinden).', 'PASSWORD_LOGIN_DISABLED');
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) return ctx.fail(400, 'Benutzername und Passwort erforderlich', 'VALIDATION_ERROR');
    const user = await ctx.prisma.user.findFirst({
      where: { password: { not: null }, OR: [{ email: { equals: username, mode: 'insensitive' } }, { name: { equals: username, mode: 'insensitive' } }] },
      select: { id: true, name: true, email: true, password: true, role: true },
    });
    const hash = user?.password || '';
    const valid = hash && (hash.startsWith('$2') ? await core.bcrypt.compare(password, hash) : hash === sha256(password));
    if (!valid) return ctx.fail(401, 'Anmeldung fehlgeschlagen', 'LOGIN_FAILED');
    if (!core.roles.edit.includes(user.role)) return ctx.fail(403, 'Diese Rolle darf keine Templates bearbeiten', 'FORBIDDEN');
    const name = user.name || user.email;
    const id = crypto.randomBytes(8).toString('hex');
    const t = signToken({ sub: user.id, name, role: user.role, jti: id, access: 'write' }, s, undefined, core.now());
    await registerToken(core.state, { now: core.now(), entry: { id, sub: user.id, name, role: user.role, access: 'write', via: 'password', label: null, exp: Date.parse(t.expiresAt) } });
    await audit({ sub: user.id }, 'login', user.id, null);
    return res.status(200).json({ token: t.token, expiresAt: t.expiresAt, access: 'write', user: { name, role: user.role } });
  }, { rateLimit: { windowMs: 15 * 60 * 1000, max: 10 } }),
});
