import { getServerSession } from 'next-auth/next';
import { authOptions } from '../pages/api/auth/[...nextauth]';
import fs from 'fs';
import path from 'path';
import { prisma } from './prisma';

/**
 * Middleware zur Überprüfung der Benutzerrechte
 * @param {Array} allowedRoles - Array von erlaubten Rollen ['ADMIN', 'MODERATOR', 'EDITOR']
 */
export async function requireAuth(req, res, allowedRoles = []) {
  if (process.env.NEXT_PUBLIC_DEV_MODE === 'true') {
    return { authorized: true, user: { id: 'dev', email: 'dev@localhost', name: 'Dev User', role: 'ADMIN' } };
  }

  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return { authorized: false, error: 'Nicht eingeloggt', status: 401 };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true, role: true }
  });

  if (!user) {
    return { authorized: false, error: 'Benutzer nicht gefunden', status: 404 };
  }

  // Wenn keine Rollen spezifiziert, nur Login prüfen
  if (allowedRoles.length === 0) {
    return { authorized: true, user };
  }

  // Prüfe ob User die erforderliche Rolle hat
  if (!allowedRoles.includes(user.role)) {
    return { 
      authorized: false, 
      error: `Zugriff verweigert. Erforderliche Rolle: ${allowedRoles.join(' oder ')}`,
      status: 403
    };
  }

  return { authorized: true, user };
}

/**
 * Berechtigungen für verschiedene Aktionen
 */
const DEFAULT_PERMISSIONS = {
  // Seiten
  PAGES_VIEW: ['ADMIN', 'MODERATOR', 'EDITOR'],
  PAGES_EDIT: ['ADMIN', 'MODERATOR', 'EDITOR'],
  PAGES_CREATE: ['ADMIN', 'MODERATOR', 'EDITOR'],
  PAGES_DELETE: ['ADMIN', 'MODERATOR'],
  PAGES_WORKFLOW_SUBMIT: ['ADMIN', 'MODERATOR', 'EDITOR'],
  PAGES_WORKFLOW_APPROVE: ['ADMIN', 'MODERATOR'],
  PAGES_WORKFLOW_PUBLISH: ['ADMIN', 'MODERATOR'],
  
  // Templates
  TEMPLATES_VIEW: ['ADMIN', 'MODERATOR'],
  TEMPLATES_EDIT: ['ADMIN', 'MODERATOR'],
  TEMPLATES_DELETE: ['ADMIN'],
  
  // CSS
  CSS_VIEW: ['ADMIN', 'MODERATOR'],
  CSS_EDIT: ['ADMIN', 'MODERATOR'],
  CSS_DELETE: ['ADMIN'],

  // JavaScript
  JS_VIEW: ['ADMIN', 'MODERATOR'],
  JS_EDIT: ['ADMIN', 'MODERATOR'],
  JS_DELETE: ['ADMIN', 'MODERATOR'],
  
  // Navigation
  NAVIGATION_VIEW: ['ADMIN', 'MODERATOR'],
  NAVIGATION_EDIT: ['ADMIN', 'MODERATOR'],
  NAVIGATION_DELETE: ['ADMIN'],
  
  // Users
  USERS_VIEW: ['ADMIN'],
  USERS_EDIT: ['ADMIN'],
  
  // Settings
  SETTINGS_VIEW: ['ADMIN'],
  SETTINGS_EDIT: ['ADMIN'],
  
  // Files
  FILES_VIEW: ['ADMIN', 'MODERATOR', 'EDITOR'],
  FILES_UPLOAD: ['ADMIN', 'MODERATOR', 'EDITOR'],
  FILES_DELETE: ['ADMIN', 'MODERATOR'],
  FILES_FOLDERS: ['ADMIN', 'MODERATOR', 'EDITOR'] // Ordner anlegen/umbenennen/verschieben
};

// Rollen-Rechte, die im Admin pro Rolle (MODERATOR/EDITOR) umschaltbar sind, mit Label.
export const CONFIGURABLE_PERMISSIONS = {
  PAGES_VIEW: 'Seiten ansehen',
  PAGES_CREATE: 'Seiten anlegen',
  PAGES_EDIT: 'Seiten bearbeiten',
  PAGES_WORKFLOW_PUBLISH: 'Seiten veröffentlichen',
  PAGES_DELETE: 'Seiten löschen',
  FILES_VIEW: 'Dateien ansehen',
  FILES_UPLOAD: 'Dateien hochladen',
  FILES_DELETE: 'Dateien löschen',
  FILES_FOLDERS: 'Ordner verwalten',
};

const OVERRIDES_FILE = path.join(process.cwd(), 'data', 'role-permissions.json');
let overridesCache = { mtime: -1, data: {} };

/** Abweichungen von den Defaults: { MODERATOR: { FILES_DELETE: false }, EDITOR: { ... } } */
export function readRoleOverrides() {
  try {
    const mtime = fs.statSync(OVERRIDES_FILE).mtimeMs;
    if (mtime !== overridesCache.mtime) {
      overridesCache = { mtime, data: JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf-8')) };
    }
  } catch (_e) {
    overridesCache = { mtime: -1, data: {} };
  }
  return overridesCache.data || {};
}

export function writeRoleOverrides(input) {
  const out = {};
  for (const role of ['MODERATOR', 'EDITOR']) {
    for (const key of Object.keys(CONFIGURABLE_PERMISSIONS)) {
      const v = input?.[role]?.[key];
      // Nur echte Abweichungen vom Default speichern
      if (typeof v === 'boolean' && v !== DEFAULT_PERMISSIONS[key].includes(role)) {
        (out[role] = out[role] || {})[key] = v;
      }
    }
  }
  fs.mkdirSync(path.dirname(OVERRIDES_FILE), { recursive: true });
  fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(out, null, 2), 'utf-8');
  overridesCache = { mtime: -1, data: {} };
  return out;
}

/** Effektive Rollenliste für ein Recht (Defaults + Admin-Overrides). ADMIN ist immer enthalten. */
export function rolesFor(key) {
  const base = DEFAULT_PERMISSIONS[key] || [];
  const ov = readRoleOverrides();
  const roles = new Set(base);
  for (const role of ['MODERATOR', 'EDITOR']) {
    const v = ov[role]?.[key];
    if (v === true) roles.add(role);
    if (v === false) roles.delete(role);
  }
  roles.add('ADMIN');
  return [...roles];
}

/**
 * Effektive Rechte: jedes Feld liefert bei jedem Zugriff die Rollenliste inkl. Admin-Overrides,
 * so dass bestehende `requireAuth(req, res, PERMISSIONS.X)`/`.includes(role)`-Aufrufer unverändert bleiben.
 */
export const PERMISSIONS = {};
for (const key of Object.keys(DEFAULT_PERMISSIONS)) {
  Object.defineProperty(PERMISSIONS, key, { enumerable: true, get: () => rolesFor(key) });
}
