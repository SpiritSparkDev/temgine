import { getTemplateByName } from '../../../lib/templateStore';
import { getContactEmailTemplate, saveContactEmailTemplate } from '../../../lib/contactEmailTemplateStore';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const name = req.query && req.query.name;
      if (!name) return res.status(400).json({ error: 'Name erforderlich' });

      const form = getTemplateByName(String(name));
      if (!form || form.category !== 'contact') {
        return res.status(404).json({ error: 'Kontaktformular nicht gefunden' });
      }
      return res.status(200).json(getContactEmailTemplate(form.name));
    }

    if (req.method === 'PUT') {
      const { name, previousName, subject, body } = req.body || {};
      if (!name) return res.status(400).json({ error: 'Name erforderlich' });

      // Nur gegen ein tatsächlich existierendes Kontaktformular speichern —
      // verhindert, dass `name` als Dateipfad für beliebige Sidecar-Dateien
      // missbraucht wird (derselbe Schutz wie templateStore.getTemplateByName).
      const form = getTemplateByName(String(name));
      if (!form || form.category !== 'contact') {
        return res.status(404).json({ error: 'Kontaktformular nicht gefunden' });
      }

      let prevName = null;
      if (previousName && String(previousName) !== form.name) {
        const prevForm = getTemplateByName(String(previousName));
        if (prevForm) prevName = prevForm.name;
      }

      const saved = saveContactEmailTemplate(form.name, { subject, body }, prevName);
      return res.status(200).json(saved);
    }

    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  } catch (e) {
    console.error('[/api/contact-forms/email-template]', e.message);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
}
