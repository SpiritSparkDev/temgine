/**
 * Workflow-Statusmodell für Seiten (D-01)
 *
 * Gültige Statusübergänge und Rollenrechte:
 *
 * DRAFT     → REVIEW     : EDITOR, MODERATOR, ADMIN
 * DRAFT     → PUBLISHED  : ADMIN, MODERATOR   (Direktpublizierung)
 * REVIEW    → DRAFT      : EDITOR, MODERATOR, ADMIN  (Ablehnen / Zurückziehen)
 * REVIEW    → APPROVED   : MODERATOR, ADMIN
 * APPROVED  → PUBLISHED  : MODERATOR, ADMIN
 * APPROVED  → REVIEW     : MODERATOR, ADMIN   (Freigabe aufheben)
 * APPROVED  → DRAFT      : ADMIN
 * PUBLISHED → DRAFT      : MODERATOR, ADMIN   (Depublizieren)
 * PUBLISHED → APPROVED   : ADMIN              (Zurück auf Freigegeben)
 * SCHEDULED → DRAFT      : MODERATOR, ADMIN   (Zeitplanung aufheben)
 * *         → SCHEDULED  : MODERATOR, ADMIN   (aus APPROVED oder PUBLISHED)
 */

/** @type {Record<string, Record<string, string[]>>} */
const TRANSITIONS = {
  DRAFT: {
    REVIEW:     ['EDITOR', 'MODERATOR', 'ADMIN'],
    PUBLISHED:  ['ADMIN', 'MODERATOR'],
    SCHEDULED:  ['ADMIN', 'MODERATOR'],
  },
  REVIEW: {
    DRAFT:      ['EDITOR', 'MODERATOR', 'ADMIN'],
    APPROVED:   ['MODERATOR', 'ADMIN'],
  },
  APPROVED: {
    PUBLISHED:  ['MODERATOR', 'ADMIN'],
    REVIEW:     ['MODERATOR', 'ADMIN'],
    DRAFT:      ['ADMIN'],
    SCHEDULED:  ['MODERATOR', 'ADMIN'],
  },
  PUBLISHED: {
    DRAFT:      ['MODERATOR', 'ADMIN'],
    APPROVED:   ['ADMIN'],
    SCHEDULED:  ['ADMIN'],
  },
  SCHEDULED: {
    DRAFT:      ['MODERATOR', 'ADMIN'],
    PUBLISHED:  ['ADMIN', 'MODERATOR'],
  },
};

/**
 * Prüft, ob ein Statusübergang für die gegebene Rolle zulässig ist.
 * @param {string} fromStatus - Aktueller Status (z.B. 'DRAFT')
 * @param {string} toStatus   - Zielstatus  (z.B. 'REVIEW')
 * @param {string} userRole   - Rolle des Benutzers (z.B. 'EDITOR')
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function canTransition(fromStatus, toStatus, userRole) {
  const from = String(fromStatus).toUpperCase();
  const to   = String(toStatus).toUpperCase();
  const role = String(userRole).toUpperCase();

  const allowed = TRANSITIONS[from];
  if (!allowed) {
    return { allowed: false, reason: `Unbekannter Ausgangsstatus: ${from}` };
  }

  const rolesForTarget = allowed[to];
  if (!rolesForTarget) {
    return {
      allowed: false,
      reason: `Übergang von ${from} nach ${to} ist nicht erlaubt.`,
    };
  }

  if (!rolesForTarget.includes(role)) {
    return {
      allowed: false,
      reason: `Rolle ${role} darf nicht von ${from} nach ${to} wechseln. Erlaubt: ${rolesForTarget.join(', ')}.`,
    };
  }

  return { allowed: true };
}

/**
 * Gibt alle möglichen Zielstatus für eine Rolle zurück.
 * @param {string} fromStatus
 * @param {string} userRole
 * @returns {string[]}
 */
export function availableTransitions(fromStatus, userRole) {
  const from = String(fromStatus).toUpperCase();
  const role = String(userRole).toUpperCase();

  const allowed = TRANSITIONS[from];
  if (!allowed) return [];

  return Object.entries(allowed)
    .filter(([, roles]) => roles.includes(role))
    .map(([to]) => to);
}

/**
 * Gibt die für den UI sichtbaren Labels zurück.
 */
export const STATUS_LABELS = {
  DRAFT:     'Entwurf',
  REVIEW:    'In Prüfung',
  APPROVED:  'Freigegeben',
  PUBLISHED: 'Veröffentlicht',
  SCHEDULED: 'Geplant',
};

/**
 * CSS-Farb-Klassen für Status-Badges.
 */
export const STATUS_COLORS = {
  DRAFT:     'badge-gray',
  REVIEW:    'badge-yellow',
  APPROVED:  'badge-blue',
  PUBLISHED: 'badge-green',
  SCHEDULED: 'badge-purple',
};
