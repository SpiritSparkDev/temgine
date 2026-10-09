/**
 * lib/plugins/manifest.js
 *
 * Liest und prüft die Manifeste plugins/<id>/plugin.json (Plugin-System, Spezifikation §3.1).
 * CommonJS, weil server.js (CSP) die Manifeste ohne Plugin-Code lesen muss.
 * Ein ungültiges Manifest wird geloggt und ausgelassen — die Seite läuft ohne das Plugin weiter.
 */
const fs = require('fs');
const path = require('path');

const PLUGINS_DIR = path.join(process.cwd(), 'plugins');
const API_VERSIONS = [1];
const SETTING_TYPES = ['text', 'url', 'number', 'bool', 'secret'];
const CSP_DIRECTIVES = ['img-src', 'media-src', 'script-src', 'connect-src', 'frame-src', 'style-src', 'font-src'];
const RESERVED_SECTIONS = ['each', 'if', 'folder', 'nav'];
const RESERVED_IDS = ['plugin']; // plugin_<id>_enabled darf nicht mit Plugin-Settings kollidieren

// Nur http(s)://host[:port] — keine Wildcards, keine Pfade, keine Schlüsselwörter wie 'unsafe-inline'.
function cspOrigin(value) {
  try {
    const u = new URL(String(value || '').trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return /^https?:\/\/[a-z0-9.-]+(:\d+)?$/.test(u.origin) ? u.origin : '';
  } catch (_e) {
    return '';
  }
}

// Liefert die Fehler eines Manifests (leer = gültig). `folder` ist der Ordnername.
// Ungültige CSP-Regeln sind kein Fehler: sie werden in `warnings` gemeldet und entfernt (§7).
function validateManifest(m, folder) {
  const errors = [];
  const warnings = [];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { errors: ['plugin.json ist kein Objekt'], warnings };
  if (typeof m.id !== 'string' || !/^[a-z0-9-]+$/.test(m.id)) errors.push('id muss [a-z0-9-]+ sein');
  else if (m.id !== folder) errors.push(`id "${m.id}" passt nicht zum Ordner "${folder}"`);
  else if (RESERVED_IDS.includes(m.id)) errors.push(`id "${m.id}" ist reserviert`);
  if (!API_VERSIONS.includes(m.temgineApi)) errors.push(`temgineApi ${JSON.stringify(m.temgineApi)} unbekannt`);
  if (typeof m.name !== 'string' || !m.name.trim()) errors.push('name fehlt');
  if (typeof m.version !== 'string' || !m.version.trim()) errors.push('version fehlt');
  if (m.help !== undefined && (typeof m.help !== 'string' || !/^[a-z0-9-]+\.md$/.test(m.help))) errors.push('help muss ein Dateiname wie help.md sein');

  const settings = m.settings === undefined ? {} : m.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) errors.push('settings muss ein Objekt sein');
  else {
    for (const [key, def] of Object.entries(settings)) {
      if (!/^[a-z0-9_-]+$/.test(key) || !key.startsWith(`${m.id}_`)) errors.push(`Setting "${key}" braucht das Präfix "${m.id}_"`);
      if (!def || !SETTING_TYPES.includes(def.type)) errors.push(`Setting "${key}": type muss ${SETTING_TYPES.join('|')} sein`);
    }
  }

  const sections = m.sections === undefined ? [] : m.sections;
  if (!Array.isArray(sections)) errors.push('sections muss ein Array sein');
  else {
    for (const s of sections) {
      if (typeof s !== 'string' || !/^[a-z][a-z0-9-]*$/.test(s)) errors.push(`Section-Präfix ${JSON.stringify(s)} ungültig`);
      else if (RESERVED_SECTIONS.includes(s)) errors.push(`Section-Präfix "${s}" ist reserviert`);
    }
  }

  const csp = [];
  if (m.csp !== undefined && !Array.isArray(m.csp)) errors.push('csp muss ein Array sein');
  for (const rule of Array.isArray(m.csp) ? m.csp : []) {
    const def = settings && settings[rule && rule.originFromSetting];
    if (!rule || !CSP_DIRECTIVES.includes(rule.directive)) warnings.push(`CSP-Direktive ${JSON.stringify(rule && rule.directive)} nicht erlaubt`);
    else if (('origin' in rule) === ('originFromSetting' in rule)) warnings.push('CSP-Regel braucht genau eins von origin/originFromSetting');
    else if ('origin' in rule && cspOrigin(rule.origin) !== rule.origin) warnings.push(`CSP-Origin ${JSON.stringify(rule.origin)} ungültig (nur http(s)://host[:port])`);
    else if ('originFromSetting' in rule && !(def && (def.type === 'url' || def.type === 'text'))) warnings.push(`CSP: Setting "${rule.originFromSetting}" fehlt oder ist kein url/text`);
    else csp.push(rule);
  }
  return { errors, warnings, csp };
}

/**
 * Liest alle plugins/<id>/plugin.json aus `dir`. Liefert die gültigen Manifeste, jeweils mit
 * `dir` (Plugin-Ordner) und bereinigten `csp`-Regeln. Section-Präfixe müssen über alle Plugins
 * eindeutig sein — das zweite Plugin mit demselben Präfix wird ausgelassen.
 */
function loadManifests(dir = PLUGINS_DIR, log = console) {
  let folders = [];
  try {
    folders = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch (_e) {
    return [];
  }
  const out = [];
  const prefixes = new Map();
  for (const folder of folders) {
    const file = path.join(dir, folder, 'plugin.json');
    if (!fs.existsSync(file)) continue;
    let m;
    try {
      m = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      log.error(`[plugins] ${folder}: plugin.json nicht lesbar (${e.message}) — ausgelassen`);
      continue;
    }
    const { errors, warnings, csp } = validateManifest(m, folder);
    for (const s of Array.isArray(m && m.sections) ? m.sections : []) {
      if (prefixes.has(s)) errors.push(`Section-Präfix "${s}" belegt bereits Plugin "${prefixes.get(s)}"`);
    }
    warnings.forEach((w) => log.warn(`[plugins] ${folder}: ${w} — Regel ignoriert`));
    if (errors.length) {
      log.error(`[plugins] ${folder}: ungültiges Manifest — ausgelassen: ${errors.join('; ')}`);
      continue;
    }
    (m.sections || []).forEach((s) => prefixes.set(s, m.id));
    out.push({ ...m, settings: m.settings || {}, sections: m.sections || [], csp, dir: path.join(dir, folder) });
  }
  return out;
}

const enabledKey = (id) => `plugin_${id}_enabled`;

module.exports = { PLUGINS_DIR, API_VERSIONS, SETTING_TYPES, CSP_DIRECTIVES, RESERVED_SECTIONS, cspOrigin, validateManifest, loadManifests, enabledKey };
