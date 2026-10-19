// Einmalige Übernahme der Werte aus dem früheren Kern-Add-on (Settings tnt_inquiries / tnt_inquiries_alert).
// Aufgerufen von scripts/plugins-seed.js beim Start (nach den DB-Migrationen). Idempotent: kopiert nur in
// noch nicht vorhandene Plugin-Keys und löscht danach die alten Zeilen (sie wären sonst über GET /api/settings sichtbar).
// Das Token bleibt unverändert verschlüsselt (v1-Blob); plugin_tnt-inquiries_enabled wird nur gesetzt, wenn das alte Add-on aktiv war.
const OLD = { config: 'tnt_inquiries', alert: 'tnt_inquiries_alert' };
const NEW = { baseUrl: 'tnt-inquiries_base_url', token: 'tnt-inquiries_token', mappings: 'tnt-inquiries_mappings', alert: 'tnt-inquiries_alert', enabled: 'plugin_tnt-inquiries_enabled' };

module.exports = async function seed(prisma) {
  const get = async (key) => (await prisma.setting.findUnique({ where: { key } }))?.value;
  const putIfMissing = async (key, value) => {
    if ((await prisma.setting.findUnique({ where: { key } })) || value === undefined || value === '') return;
    await prisma.setting.create({ data: { key, value: String(value) } });
  };

  const [oldConfig, oldAlert] = [await get(OLD.config), await get(OLD.alert)];
  if (oldConfig === undefined && oldAlert === undefined) return { migrated: false };

  let c = null;
  try { c = oldConfig ? JSON.parse(oldConfig) : null; } catch { /* unlesbar: wie bisher ignoriert, Zeile wird entfernt */ }
  if (c && typeof c === 'object') {
    await putIfMissing(NEW.baseUrl, c.baseUrl);
    await putIfMissing(NEW.token, c.tokenEnc);
    await putIfMissing(NEW.mappings, c.mappings && JSON.stringify(c.mappings));
    if (c.enabled === true) await putIfMissing(NEW.enabled, 'true');
  }
  await putIfMissing(NEW.alert, oldAlert);

  await prisma.setting.deleteMany({ where: { key: { in: [OLD.config, OLD.alert] } } });
  return { migrated: true, enabled: !!(c && c.enabled === true) };
};
