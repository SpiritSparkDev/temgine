import fs from 'fs';
import path from 'path';

// Maintenance pages (404 / 503 / no-homepage / loading) live as files instead
// of Setting DB rows:
//   public/assets/template/maintenance/<key>.html
//   public/assets/template/maintenance/<key>.css
//   public/assets/template/maintenance/<key>.js
// `settingsKeyPrefix` mirrors the old Setting keys (maintenance_404_html, ...)
// so existing API/UI callers that read/write those key names keep working.

const ROOT = path.join(process.cwd(), 'public', 'assets', 'template', 'maintenance');

export const MAINTENANCE_PAGES = {
  '404': 'maintenance_404',
  '503': 'maintenance_503',
  'no-homepage': 'maintenance_no_homepage',
  'loading': 'maintenance_loading',
};

const KEY_TO_PREFIX = MAINTENANCE_PAGES;
const PREFIX_TO_KEY = Object.fromEntries(Object.entries(MAINTENANCE_PAGES).map(([k, v]) => [v, k]));

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_e) {
    return '';
  }
}

// Parses a Setting key like "maintenance_404_html" into { page: '404', field: 'html' }.
export function parseSettingKey(settingKey) {
  const key = String(settingKey || '');
  for (const [prefix, page] of Object.entries(PREFIX_TO_KEY)) {
    if (key === `${prefix}_html`) return { page, field: 'html' };
    if (key === `${prefix}_css`) return { page, field: 'css' };
    if (key === `${prefix}_js`) return { page, field: 'js' };
  }
  return null;
}

export function isMaintenanceSettingKey(settingKey) {
  return parseSettingKey(settingKey) !== null;
}

export function getMaintenancePage(page) {
  return {
    html: readFileSafe(path.join(ROOT, `${page}.html`)),
    css: readFileSafe(path.join(ROOT, `${page}.css`)),
    js: readFileSafe(path.join(ROOT, `${page}.js`)),
  };
}

export function saveMaintenanceField(page, field, value) {
  if (!KEY_TO_PREFIX[page] || !['html', 'css', 'js'].includes(field)) return false;
  fs.mkdirSync(ROOT, { recursive: true });
  fs.writeFileSync(path.join(ROOT, `${page}.${field}`), String(value ?? ''), 'utf8');
  return true;
}

// Returns all maintenance content flattened into the old Setting-key shape,
// e.g. { maintenance_404_html: '...', maintenance_404_css: '...', ... } — for
// merging into GET /api/settings' response.
export function getAllMaintenanceAsSettings() {
  const out = {};
  for (const page of Object.keys(KEY_TO_PREFIX)) {
    const prefix = KEY_TO_PREFIX[page];
    const { html, css, js } = getMaintenancePage(page);
    out[`${prefix}_html`] = html;
    out[`${prefix}_css`] = css;
    out[`${prefix}_js`] = js;
  }
  return out;
}
