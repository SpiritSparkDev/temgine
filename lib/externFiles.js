import fs from 'fs';
import path from 'path';

// Gemeinsames Lesen/Schreiben der vom CSS- und JS-Manager verwalteten Dateien
// (public/extern_css, public/extern_js) für Projekttransfer-Export und -Import
// (pages/api/admin/export.js, pages/api/admin/import.js). Reihenfolge steht in
// <dir>/.order.json ({ order: [...] }), Aktivierungsstatus und – nur bei JS –
// die Consent-Kategorie in data/<kind>-config.json ({ disabled, categories }).
// `root` ist nur für Tests überschreibbar.

export const EXTERN_KINDS = {
  css: { dir: 'extern_css', ext: '.css', label: 'CSS', fallback: 'style.css', configFile: 'css-config.json' },
  js: { dir: 'extern_js', ext: '.js', label: 'JS', fallback: 'script.js', configFile: 'js-config.json' },
};

function kindOf(kind) {
  const k = EXTERN_KINDS[kind];
  if (!k) throw new Error(`Unbekannte Dateiart: ${kind}`);
  return k;
}

function readOrder(orderPath) {
  try {
    if (!fs.existsSync(orderPath)) return [];
    const order = JSON.parse(fs.readFileSync(orderPath, 'utf-8')).order;
    return Array.isArray(order) ? order : [];
  } catch (_e) {
    return [];
  }
}

export function normalizeExternFilename(kind, input) {
  const { ext, fallback } = kindOf(kind);
  const base = path.basename(String(input || '').trim() || fallback).replace(/[^A-Za-z0-9._-]/g, '_');
  const withExt = base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`;
  return withExt === ext ? fallback : withExt;
}

// Alle Dateien der Art in Manager-Reihenfolge: erst laut .order.json, dann der Rest.
export function loadExternFiles(kind, root = process.cwd()) {
  const { dir, ext, label } = kindOf(kind);
  const absDir = path.join(root, 'public', dir);
  const files = [];
  if (!fs.existsSync(absDir)) return files;

  try {
    const order = readOrder(path.join(absDir, '.order.json'));
    const all = fs.readdirSync(absDir).filter((f) => f.endsWith(ext));
    const sorted = [...order.filter((f) => all.includes(f)), ...all.filter((f) => !order.includes(f))];
    for (const filename of sorted) {
      try {
        files.push({ filename, content: fs.readFileSync(path.join(absDir, filename), 'utf-8') });
      } catch (e) {
        console.warn(`Failed to read ${label} file ${filename}:`, e.message);
      }
    }
  } catch (e) {
    console.warn(`Failed to load ${label} files:`, e.message);
  }
  return files;
}

// Schreibt importierte Dateien. "replace" löscht vorher alle Dateien der Art samt
// .order.json; "merge" überschreibt nur gleichnamige Dateien und hängt neue an die
// bestehende Reihenfolge an.
export function importExternFiles(kind, files = [], strategy = 'merge', root = process.cwd()) {
  const { dir, ext, label } = kindOf(kind);
  const absDir = path.join(root, 'public', dir);
  const orderPath = path.join(absDir, '.order.json');
  if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });

  const result = { imported: 0, errors: [], writtenFiles: [] };

  if (strategy === 'replace') {
    try {
      for (const file of fs.readdirSync(absDir).filter((f) => f.endsWith(ext))) {
        fs.unlinkSync(path.join(absDir, file));
      }
      if (fs.existsSync(orderPath)) fs.unlinkSync(orderPath);
    } catch (e) {
      console.warn(`Failed to delete old ${label} files:`, e.message);
      result.errors.push(`Vorhandene ${label}-Dateien konnten nicht vollständig gelöscht werden: ${e.message}`);
    }
  }

  const usedNames = new Set();
  for (const file of Array.isArray(files) ? files : []) {
    const rawName = file?.filename || file?.name || file?.file || '';
    let filename = normalizeExternFilename(kind, rawName);
    if (usedNames.has(filename)) {
      const stem = filename.slice(0, -ext.length);
      let i = 2;
      while (usedNames.has(`${stem}-${i}${ext}`)) i++;
      filename = `${stem}-${i}${ext}`;
    }
    usedNames.add(filename);

    const filePath = path.join(absDir, filename);
    if (!path.resolve(filePath).startsWith(path.resolve(absDir) + path.sep)) {
      result.errors.push(`Ungültiger ${label}-Dateiname übersprungen: ${rawName || '(leer)'}`);
      continue;
    }
    try {
      fs.writeFileSync(filePath, file?.content || '', 'utf-8');
      result.imported++;
      result.writtenFiles.push(filename);
    } catch (e) {
      console.warn(`Failed to write ${label} file ${filename}:`, e.message);
      result.errors.push(`${label}-Datei "${filename}" konnte nicht geschrieben werden: ${e.message}`);
    }
  }

  if (result.writtenFiles.length > 0) {
    try {
      const existing = strategy === 'merge' ? readOrder(orderPath) : [];
      const merged = [...existing, ...result.writtenFiles.filter((f) => !existing.includes(f))];
      fs.writeFileSync(orderPath, JSON.stringify({ order: merged }, null, 2), 'utf-8');
    } catch (e) {
      console.warn(`Failed to write ${label} .order.json:`, e.message);
      result.errors.push(`${label}-Reihenfolge (.order.json) konnte nicht aktualisiert werden: ${e.message}`);
    }
  }

  return result;
}

// Führt eine importierte Manager-Konfiguration ({ disabled, categories, … }) mit
// der bestehenden zusammen: `disabled` als Vereinigung, `categories` pro Datei
// (importierte Einträge gewinnen), alles andere wie bisher flach überschrieben.
export function mergeExternConfig(existing = {}, incoming = {}) {
  const merged = { ...existing, ...incoming };
  merged.disabled = Array.from(new Set([
    ...(Array.isArray(existing.disabled) ? existing.disabled : []),
    ...(Array.isArray(incoming.disabled) ? incoming.disabled : []),
  ]));
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (isObj(existing.categories) || isObj(incoming.categories)) {
    merged.categories = { ...(isObj(existing.categories) ? existing.categories : {}), ...(isObj(incoming.categories) ? incoming.categories : {}) };
  }
  return merged;
}
