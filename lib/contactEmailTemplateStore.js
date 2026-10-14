import fs from 'fs';
import path from 'path';

// Per-Kontaktformular Email-Vorlage (Betreff/Text) — als JSON-Sidecar neben
// der Formular-.html abgelegt, z. B.:
//   public/assets/template/block/contact/<Name>.html
//   public/assets/template/block/contact/<Name>.email.json
// Templates selbst sind datei-basiert (siehe lib/templateStore.js); dieser
// Store folgt derselben Konvention, nur eigenständig, weil eine Email-Vorlage
// kein renderbares Template ist (listTemplates() ignoriert .json-Dateien).
const CONTACT_DIR = path.join(process.cwd(), 'public', 'assets', 'template', 'block', 'contact');

function emailMetaPath(formName) {
  return path.join(CONTACT_DIR, `${formName}.email.json`);
}

export function getContactEmailTemplate(formName) {
  if (!formName) return { subject: '', body: '' };
  try {
    const raw = fs.readFileSync(emailMetaPath(formName), 'utf8');
    const data = JSON.parse(raw);
    return { subject: String(data.subject || ''), body: String(data.body || '') };
  } catch (_e) {
    return { subject: '', body: '' };
  }
}

// `previousName` räumt die alte Sidecar-Datei mit auf, wenn das Formular im
// selben Zug umbenannt wurde (mirror von templateStore.saveTemplate).
export function saveContactEmailTemplate(formName, { subject, body }, previousName = null) {
  if (!formName) throw new Error('formName erforderlich');
  if (previousName && previousName !== formName) {
    try { fs.unlinkSync(emailMetaPath(previousName)); } catch (_e) { /* schon weg */ }
  }
  const data = { subject: String(subject || ''), body: String(body || '') };
  fs.mkdirSync(CONTACT_DIR, { recursive: true });
  fs.writeFileSync(emailMetaPath(formName), JSON.stringify(data, null, 2), 'utf8');
  return data;
}

export function deleteContactEmailTemplate(formName) {
  if (!formName) return;
  try { fs.unlinkSync(emailMetaPath(formName)); } catch (_e) { /* schon weg */ }
}
