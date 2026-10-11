// Serverseitiger Zugriffsschutz für die öffentliche Seiten-API.
//
// Mitglieder-Seiten (`accessGroups`, '*' = alle Mitglieder) wurden bisher nur
// im Browser geschützt (pages/[...slug].js leitet um bzw. zeigt „Kein
// Zugriff“) — ihr Inhalt kam aber für jeden aus GET /api/pages. Ebenso lieferte
// `includeDrafts=true` Entwürfe an jeden.
//
// Jetzt gilt für Antworten an nicht berechtigte Besucher:
// - Geschützte Seiten (auch verschachtelte) bleiben im Baum, damit Navigation und Umleitung zum
//   Mitglieder-Login funktionieren — aber ohne Inhalt: `blocks` leer, aus `data`
//   nur Navigations-/Ordnungsfelder, Markierung `accessRestricted: true`.
// - Dasselbe für Seiten mit Passwortschutz „ohne Konto“, solange sie nicht per
//   Entsperr-Cookie freigeschaltet sind (lib/pagePasswordLock.js).
// - Entwürfe (nicht PUBLISHED) gibt es nur für Backend-Nutzer; die Startseite
//   bleibt wie bisher immer sichtbar (siehe lib/seo.js loadPageTreeForMeta).

import { getServerSession } from 'next-auth/next'
import { authOptions } from '../pages/api/auth/[...nextauth]'
import { PERMISSIONS } from './auth'
import { PASSWORD_UNLOCK_COOKIE, parseUnlockCookieValue } from './pagePasswordLock'

// data-Felder, die Navigation/Baum brauchen und keinen Seiteninhalt enthalten.
const NAV_DATA_KEYS = ['_order', 'navImage', 'ignoreInNavigation', 'hideInNavigation', 'redirect']

export async function resolvePageViewer(req, res) {
  const unlocked = parseUnlockCookieValue(req && req.cookies ? req.cookies[PASSWORD_UNLOCK_COOKIE] : '')
  const viewer = await resolveSessionViewer(req, res)
  return { ...viewer, unlocked }
}

async function resolveSessionViewer(req, res) {
  if (process.env.NEXT_PUBLIC_DEV_MODE === 'true') return { isStaff: true, isMember: false, groups: [] }
  let session = null
  try {
    session = await getServerSession(req, res, authOptions)
  } catch (e) {
    session = null
  }
  const user = session && session.user
  if (!user) return { isStaff: false, isMember: false, groups: [] }
  if (user.accountType === 'member') {
    return { isStaff: false, isMember: true, groups: Array.isArray(user.memberGroups) ? user.memberGroups : [] }
  }
  return { isStaff: PERMISSIONS.PAGES_VIEW.includes(user.role), isMember: false, groups: [] }
}

function groupsOf(node) {
  return Array.isArray(node && node.accessGroups) ? node.accessGroups : []
}

export function canViewGated(accessGroups, viewer) {
  if (!accessGroups || accessGroups.length === 0) return true
  if (viewer && viewer.isStaff) return true
  if (!viewer || !viewer.isMember) return false
  if (accessGroups.includes('*')) return true
  return accessGroups.some(g => (viewer.groups || []).includes(g))
}

function redactNode(node) {
  const data = {}
  for (const k of NAV_DATA_KEYS) {
    if (node.data && node.data[k] !== undefined) data[k] = node.data[k]
  }
  return { ...node, blocks: [], data, accessRestricted: true }
}

/**
 * Liefert den Seitenbaum so, wie `viewer` ihn sehen darf (nicht mutierend).
 * Schutz gilt pro Seite (eigene accessGroups) — wie im Client
 * (pages/[...slug].js); Unterseiten erben ihn nicht.
 */
export function filterPagesForViewer(nodes, viewer, { includeDrafts = false } = {}) {
  const allowDrafts = includeDrafts && viewer && viewer.isStaff
  const out = []
  for (const node of nodes || []) {
    if (!node || typeof node !== 'object') continue
    if (!allowDrafts && node.status && node.status !== 'PUBLISHED' && !node.isHomepage) continue
    const passwordLocked = Boolean(node.accessPasswordHash) && !(viewer && viewer.isStaff)
      && !((viewer && viewer.unlocked) || []).includes(String(node.id))
    const base = canViewGated(groupsOf(node), viewer) && !passwordLocked ? node : redactNode(node)
    out.push({ ...base, children: filterPagesForViewer(node.children, viewer, { includeDrafts }) })
  }
  return out
}
