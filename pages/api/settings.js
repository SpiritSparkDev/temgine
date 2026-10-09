import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../lib/auth'
import { parseSettingKey, getAllMaintenanceAsSettings, saveMaintenanceField } from '../../lib/maintenanceStore'
import { CORE_SETTING_KEYS } from '../../lib/settingsKeys'
import { pluginSecretKeys, pluginSettingKeys } from '../../lib/plugins/registry'

// Geheimnisse, die GET nie herausgibt (GET ist öffentlich, z. B. für Matomo in _app.js) —
// stattdessen nur "<key>_set": true. Geschrieben werden sie weiterhin per PUT.
// Dazu kommen alle Settings vom Typ "secret" aus den Plugin-Manifesten.
const CORE_SECRET_KEYS = ['picgine_api_key', 'smtp_pass', 'external_sources']

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

export default async function handler(req, res) {
  const SECRET_KEYS = [...CORE_SECRET_KEYS, ...pluginSecretKeys()]
  try {
    // GET: alle Settings als { key: value }-Map zurückgeben
    if (req.method === 'GET') {
      const settings = await prisma.setting.findMany()
      const map = {}
      for (const s of settings) {
        if (SECRET_KEYS.includes(s.key)) map[`${s.key}_set`] = !!s.value
        else map[s.key] = s.value
      }
      // Maintenance-Seiten (404/503/keine Startseite/Ladebildschirm) liegen als
      // Dateien vor, nicht in der Setting-Tabelle — unter denselben Keys mergen,
      // damit bestehende Aufrufer (Admin-UI, pages/[...slug].js, ...) unverändert bleiben.
      Object.assign(map, getAllMaintenanceAsSettings())
      return res.status(200).json(map)
    }

    // PUT: einzelne Einstellung speichern { key, value }
    if (req.method === 'PUT') {
      // Schreiben nur für Admin/Moderator (wie Templates/CSS/JS); GET bleibt offen, weil öffentliche Seiten
      // (Wartungsmodus, SEO-Defaults, Matomo) die Einstellungen lesen.
      const auth = await requireAuth(req, res, ['ADMIN', 'MODERATOR'])
      if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })

      const { key, value } = req.body || {}
      if (!key) {
        const [status, resp] = errorResponse(400, 'key erforderlich', 'VALIDATION_ERROR', { missing: ['key'] });
        return res.status(status).json(resp);
      }
      // Allow-List (lib/settingsKeys.js) + Plugin-Manifest-Keys inkl. plugin_<id>_enabled
      // + Wartungsseiten-Keys — sonst könnte jeder
      // Admin/Moderator beliebige Keys anlegen oder überschreiben.
      if (!CORE_SETTING_KEYS.includes(key) && !pluginSettingKeys().includes(key) && !parseSettingKey(key)) {
        console.warn('[/api/settings] Unbekannter Key abgelehnt:', String(key))
        const [status, resp] = errorResponse(400, `Unbekannte Einstellung "${String(key)}"`, 'UNKNOWN_SETTING_KEY', { key: String(key) });
        return res.status(status).json(resp);
      }
      if (value === undefined || value === null) {
        const [status, resp] = errorResponse(400, 'value erforderlich', 'VALIDATION_ERROR', { missing: ['value'] });
        return res.status(status).json(resp);
      }

      const maintenanceKey = parseSettingKey(key)
      if (maintenanceKey) {
        saveMaintenanceField(maintenanceKey.page, maintenanceKey.field, String(value))
        return res.status(200).json({ key: String(key), value: String(value) })
      }

      const setting = await prisma.setting.upsert({
        where: { key: String(key) },
        update: { value: String(value) },
        create: { key: String(key), value: String(value) },
      })
      return res.status(200).json(SECRET_KEYS.includes(setting.key) ? { key: setting.key, set: !!setting.value } : setting)
    }

    const [status, resp] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
    return res.status(status).json(resp);
  } catch (e) {
    console.error('[/api/settings Error]', e.message, e.stack)
    const [status, resp] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', { message: process.env.NODE_ENV === 'production' ? undefined : e.message });
    return res.status(status).json(resp);
  }
}
