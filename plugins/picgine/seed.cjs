// Einmalige Übernahme aus der Zeit, als Picgine fest im Kern steckte: Ist picgine_url gesetzt und
// plugin_picgine_enabled noch nicht vorhanden, wird das Plugin aktiviert. Die Settings-Keys
// (picgine_url, picgine_api_key) und das Cookie temgine_picgine sind unverändert, es gibt nichts umzuziehen.
// Aufgerufen von scripts/plugins-seed.js beim Start (nach den DB-Migrationen). Idempotent: ein
// vorhandener Wert (auch "false") wird nie überschrieben, ein bewusst deaktiviertes Plugin bleibt aus.
module.exports = async function seed(prisma) {
  const get = async (key) => (await prisma.setting.findUnique({ where: { key } }))?.value;
  if ((await get('plugin_picgine_enabled')) !== undefined) return { migrated: false };
  if (!String((await get('picgine_url')) || '').trim()) return { migrated: false };
  await prisma.setting.create({ data: { key: 'plugin_picgine_enabled', value: 'true' } });
  return { migrated: true };
};
