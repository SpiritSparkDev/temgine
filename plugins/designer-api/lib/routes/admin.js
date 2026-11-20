import { readRegistry, passwordLoginAllowed, switchOn, DISABLED_KEY, READ_ONLY_KEY } from '../registry';
import { SUPPORTED_VERSIONS } from '../common';

export const features = ['admin'];

const ADMIN = { auth: 'SETTINGS_EDIT' }; // Temgine-Sitzung des Admins (Plugin-Panel); gilt auch bei „Designer-Zugriff aus“
const AUDIT_LIMIT = 20;

// Verwaltung im Plugin-Panel: Status, Schalter „Designer-Zugriff aus“ / „nur lesen“, letzte Designer-Aktionen.
// Die Schalter wirken in lib/common.js (gate/authed), Zustand in den Plugin-Settings (kein Kern-Eingriff).
export const routes = ({ core, open, audit }) => ({
  'GET v1/admin/status': open(async (req, res, ctx) => {
    const now = core.now();
    const reg = await readRegistry(core.state, now);
    res.setHeader?.('Cache-Control', 'no-store');
    return res.status(200).json({
      pluginVersion: core.pluginVersion || null,
      temgineVersion: core.version,
      apiVersions: SUPPORTED_VERSIONS,
      disabled: await switchOn(core.state, DISABLED_KEY),
      readOnly: await switchOn(core.state, READ_ONLY_KEY),
      passwordLogin: await passwordLoginAllowed(core.state),
      activeTokens: reg.tokens.length,
    });
  }, ADMIN),

  'PUT v1/admin/switches': open(async (req, res, ctx) => {
    const b = req.body || {};
    const keys = { disabled: DISABLED_KEY, readOnly: READ_ONLY_KEY };
    const given = Object.keys(keys).filter((k) => b[k] !== undefined);
    if (!given.length) return ctx.fail(400, 'disabled oder readOnly (true/false) erforderlich', 'VALIDATION_ERROR');
    for (const k of given) if (typeof b[k] !== 'boolean') return ctx.fail(400, `${k} muss true oder false sein`, 'VALIDATION_ERROR', { path: k });
    for (const k of given) await core.state.set(keys[k], b[k] ? 'true' : 'false');
    await audit({ sub: ctx.user.id }, 'switches', null, Object.fromEntries(given.map((k) => [k, b[k]])));
    return res.status(200).json({ disabled: await switchOn(core.state, DISABLED_KEY), readOnly: await switchOn(core.state, READ_ONLY_KEY) });
  }, ADMIN),

  // Letzte Aktionen des Designers (Audit-Log, Aktionen „designer.*“), neueste zuerst
  'GET v1/admin/audit': open(async (req, res) => {
    res.setHeader?.('Cache-Control', 'no-store');
    const items = await core.listDesignerAudit(AUDIT_LIMIT);
    return res.status(200).json({ items: items.map((e) => ({ ...e, createdAt: new Date(e.createdAt).toISOString() })) });
  }, ADMIN),
});
