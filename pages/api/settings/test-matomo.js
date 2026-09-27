// Pingt die konfigurierte Matomo-Basis-URL serverseitig an (vermeidet
// CORS-Probleme, die ein direkter Fetch aus dem Admin-Browser hätte) —
// bestätigt nur Erreichbarkeit, keine vollständige Matomo-Erkennung.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Methode nicht erlaubt' });
  }

  const matomoUrl = String((req.body && req.body.matomoUrl) || '').trim();
  if (!/^https?:\/\//i.test(matomoUrl)) {
    return res.status(200).json({ ok: false, error: 'Ungültige URL — muss mit http:// oder https:// beginnen' });
  }

  const target = `${matomoUrl.replace(/\/$/, '')}/matomo.php`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(target, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    return res.status(200).json({ ok: true, status: response.status });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message || 'Server nicht erreichbar' });
  }
}
