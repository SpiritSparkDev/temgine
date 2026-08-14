import { getServerSession } from 'next-auth/next';
import { authOptions } from '../pages/api/auth/[...nextauth]';
import { prisma } from './prisma';

/**
 * Middleware zur Überprüfung der Benutzerrechte
 * @param {Array} allowedRoles - Array von erlaubten Rollen ['ADMIN', 'MODERATOR', 'EDITOR']
 */
export async function requireAuth(req, res, allowedRoles = []) {
  if (process.env.DEV_MODE === 'true') {
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
export const PERMISSIONS = {
  // Seiten
  PAGES_VIEW: ['ADMIN', 'MODERATOR', 'EDITOR'],
  PAGES_EDIT: ['ADMIN', 'MODERATOR', 'EDITOR'],
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
  FILES_DELETE: ['ADMIN', 'MODERATOR']
};
