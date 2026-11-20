import { signToken } from '../tokens';
import { SUPPORTED_VERSIONS } from '../common';
import { createCode, redeemCode, revokeToken, readRegistry, passwordLoginAllowed, switchOn, DISABLED_KEY, PairingError, PASSWORD_OFF_KEY } from '../registry';

export const features = ['pairing'];

const ADMIN = { auth: 'SETTINGS_EDIT' }; // Temgine-Sitzung des Admins (Plugin-Panel), kein Designer-Token

export const routes = ({ core, open, audit, features: all }) => {
  const guard = (fn) => async (req, res, ctx) => {
    try { return await fn(req, res, ctx); } catch (e) {
      if (e instanceof PairingError) return ctx.fail(e.status, e.message, e.code);
      throw e;
    }
  };
  return {
    // Schritt 1 im Designer: Adresse prüfen. Öffentlich, verrät nur, was der Designer zum Verbinden braucht.
    'GET v1/info': open(async (req, res, ctx) => res.status(200).json({
      apiVersions: SUPPORTED_VERSIONS, features: all, pairing: true, passwordLogin: await passwordLoginAllowed(core.state), disabled: await switchOn(core.state, DISABLED_KEY),
    }), { always: true }),

    // Schritt 2: Code gegen Token tauschen (einmalig). Strenges Rate-Limit je IP gegen Raten der 8 Ziffern.
    'POST v1/pairing/redeem': open(guard(async (req, res, ctx) => {
      const s = core.secret();
      if (!s) return ctx.fail(503, 'Plugin nicht eingerichtet (kein Secret)', 'NOT_CONFIGURED');
      const now = core.now();
      const e = await redeemCode(core.state, { now, secret: s, code: req.body?.code, label: req.body?.name });
      const t = signToken({ sub: e.sub, name: e.name, role: e.role, jti: e.id, access: e.access }, s, e.exp - now, now);
      await audit({ sub: e.sub }, 'pair', e.id, { access: e.access, label: e.label });
      return res.status(200).json({ token: t.token, expiresAt: t.expiresAt, access: e.access, user: { name: e.name, role: e.role } });
    }), { rateLimit: { windowMs: 15 * 60 * 1000, max: 10 } }),

    // Verwaltung in Temgine (Plugin-Panel „Designer verbinden“)
    'POST v1/admin/pairing-codes': open(guard(async (req, res, ctx) => {
      const s = core.secret();
      if (!s) return ctx.fail(503, 'Plugin nicht eingerichtet (kein Secret)', 'NOT_CONFIGURED');
      const u = ctx.user;
      if (!core.roles.edit.includes(u.role)) return ctx.fail(403, 'Diese Rolle darf keine Templates bearbeiten', 'FORBIDDEN');
      const r = await createCode(core.state, { now: core.now(), secret: s, by: { sub: u.id, name: u.name || u.email, role: u.role }, access: req.body?.access, ttlHours: req.body?.ttlHours });
      await audit({ sub: u.id }, 'pair-code', null, { access: req.body?.access || 'write' });
      res.setHeader?.('Cache-Control', 'no-store');
      return res.status(200).json(r);
    }), ADMIN),

    'GET v1/admin/connections': open(async (req, res, ctx) => {
      const now = core.now();
      const reg = await readRegistry(core.state, now);
      res.setHeader?.('Cache-Control', 'no-store');
      return res.status(200).json({
        passwordLogin: await passwordLoginAllowed(core.state),
        openCodes: reg.codes.filter((c) => !c.used && c.exp > now).length,
        tokens: reg.tokens.map(({ id, name, access, via, label, iat, exp }) => ({ id, name, access, via, label, createdAt: new Date(iat).toISOString(), expiresAt: new Date(exp).toISOString() })),
      });
    }, ADMIN),

    'DELETE v1/admin/connections/:id': open(async (req, res, ctx) => {
      const ok = await revokeToken(core.state, { now: core.now(), id: String(ctx.params.id) });
      if (!ok) return ctx.fail(404, 'Verbindung nicht gefunden', 'NOT_FOUND');
      await audit({ sub: ctx.user.id }, 'revoke', ctx.params.id, null);
      return res.status(200).json({ ok: true });
    }, ADMIN),

    'PUT v1/admin/password-login': open(async (req, res, ctx) => {
      if (typeof req.body?.enabled !== 'boolean') return ctx.fail(400, 'enabled (true/false) erforderlich', 'VALIDATION_ERROR', { path: 'enabled' });
      await core.state.set(PASSWORD_OFF_KEY, req.body.enabled ? 'false' : 'true');
      await audit({ sub: ctx.user.id }, 'password-login', null, { enabled: req.body.enabled });
      return res.status(200).json({ passwordLogin: req.body.enabled });
    }, ADMIN),
  };
};
