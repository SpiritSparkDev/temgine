/** Hilfen für die Admin-Ansicht "Zahlungsarten" (reine Funktionen). */

/** API-Antwort -> Formularzustand { id: { enabled, values: { key: value } } }. Geheimnisse bleiben immer leer. */
export function providersToForm(providers) {
  const form = {};
  for (const [id, p] of Object.entries(providers || {})) {
    const values = {};
    for (const f of p.fields || []) values[f.key] = f.secret ? '' : (f.value ?? '');
    form[id] = { enabled: !!p.enabled, values };
  }
  return form;
}

/** Nutzlast für PUT /api/shop/payments bzw. POST .../test (leere Geheimnisse ändern serverseitig nichts). */
export function providerPayload(entry) {
  return { enabled: entry.enabled, values: { ...entry.values } };
}

export const statusLabel = (p) => (p.configured ? 'konfiguriert' : 'Zugangsdaten fehlen');

export const webhookUrl = (origin, id) => `${origin}/api/shop/webhooks/${id}`;
