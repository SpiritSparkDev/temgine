/**
 * Serverseitiger Schutz für Mitglieder-Seiten, passwortgeschützte Seiten und
 * Entwürfe in der öffentlichen Seiten-API (lib/pageAccess.js).
 */

jest.mock('next-auth/next', () => ({ getServerSession: jest.fn(async () => null) }));
jest.mock('../pages/api/auth/[...nextauth]', () => ({ authOptions: {} }));
jest.mock('../lib/auth', () => ({ PERMISSIONS: { PAGES_VIEW: ['ADMIN', 'MODERATOR', 'EDITOR'] } }));

const { getServerSession } = require('next-auth/next');
const { filterPagesForViewer, canViewGated, resolvePageViewer } = require('../lib/pageAccess');
const { buildUnlockCookieValue, PASSWORD_UNLOCK_COOKIE } = require('../lib/pagePasswordLock');

const anon = { isStaff: false, isMember: false, groups: [], unlocked: [] };
const member = (groups = []) => ({ isStaff: false, isMember: true, groups, unlocked: [] });
const staff = { isStaff: true, isMember: false, groups: [], unlocked: [] };

const tree = () => ([
  { id: 'home', slug: 'home', title: 'Start', status: 'PUBLISHED', isHomepage: true, blocks: [{ props: { Text: 'Willkommen' } }], data: { _order: 0 }, accessGroups: [], children: [] },
  {
    id: 'mb', slug: 'mitgliederbereich', title: 'Mitgliederbereich', status: 'PUBLISHED', blocks: [{ props: { Text: 'öffentlich' } }], data: {}, accessGroups: [],
    children: [
      { id: 'geheim', slug: 'geschuetzter-bereich', title: 'Geschützt', status: 'PUBLISHED', blocks: [{ props: { Text: 'GEHEIM' } }], data: { navImage: '/n.png', seo: { metaDescription: 'x' }, intern: 'GEHEIM' }, accessGroups: ['*'], children: [] },
      { id: 'vorstand', slug: 'vorstand-intern', title: 'Vorstand intern', status: 'PUBLISHED', blocks: [{ props: { Text: 'VORSTAND' } }], data: {}, accessGroups: ['vorstand'], children: [] },
      { id: 'entwurf', slug: 'entwurf', title: 'Entwurf', status: 'DRAFT', blocks: [{ props: { Text: 'ENTWURF' } }], data: {}, accessGroups: [], children: [] },
      { id: 'pw', slug: 'passwort', title: 'Passwort', status: 'PUBLISHED', blocks: [{ props: { Text: 'PASSWORT' } }], data: {}, accessGroups: [], accessPasswordHash: 'HASH', children: [] },
    ],
  },
]);

const find = (nodes, id) => {
  for (const n of nodes || []) {
    if (n.id === id) return n;
    const f = find(n.children, id);
    if (f) return f;
  }
  return null;
};
const text = (node) => JSON.stringify(node.blocks) + JSON.stringify(node.data);

describe('filterPagesForViewer', () => {
  test('anonym: geschützte Seiten ohne Inhalt, aber mit Titel/Slug/Navigationsdaten', () => {
    const out = filterPagesForViewer(tree(), anon);
    const g = find(out, 'geheim');
    expect(g).toMatchObject({ slug: 'geschuetzter-bereich', title: 'Geschützt', accessGroups: ['*'], accessRestricted: true, blocks: [] });
    expect(g.data).toEqual({ navImage: '/n.png' });
    expect(text(g)).not.toContain('GEHEIM');
    expect(text(find(out, 'vorstand'))).not.toContain('VORSTAND');
    expect(text(find(out, 'mb'))).toContain('öffentlich');
  });

  test('anonym: keine Entwürfe, auch nicht verschachtelt; Startseite bleibt', () => {
    const out = filterPagesForViewer(tree(), anon, { includeDrafts: true });
    expect(find(out, 'entwurf')).toBeNull();
    const draftHome = filterPagesForViewer([{ ...tree()[0], status: 'DRAFT' }], anon, { includeDrafts: true });
    expect(draftHome).toHaveLength(1);
  });

  test('Mitglied: alle-Mitglieder-Seite ja, fremde Gruppe nein', () => {
    const out = filterPagesForViewer(tree(), member(['beirat']));
    expect(text(find(out, 'geheim'))).toContain('GEHEIM');
    expect(text(find(out, 'vorstand'))).not.toContain('VORSTAND');
    expect(text(find(filterPagesForViewer(tree(), member(['vorstand'])), 'vorstand'))).toContain('VORSTAND');
  });

  test('Passwort-Seite erst nach Entsperren (Cookie) mit Inhalt', () => {
    expect(text(find(filterPagesForViewer(tree(), anon), 'pw'))).not.toContain('PASSWORT');
    expect(find(filterPagesForViewer(tree(), anon), 'pw').accessPasswordHash).toBe('HASH'); // → passwordProtected-Flag für den Client
    expect(text(find(filterPagesForViewer(tree(), { ...anon, unlocked: ['pw'] }), 'pw'))).toContain('PASSWORT');
  });

  test('Backend-Nutzer sehen alles, mit includeDrafts auch Entwürfe', () => {
    const out = filterPagesForViewer(tree(), staff, { includeDrafts: true });
    expect(text(find(out, 'geheim'))).toContain('GEHEIM');
    expect(text(find(out, 'pw'))).toContain('PASSWORT');
    expect(find(out, 'entwurf')).not.toBeNull();
    expect(find(filterPagesForViewer(tree(), staff), 'entwurf')).toBeNull();
  });

  test('verändert die Eingabe nicht', () => {
    const input = tree();
    filterPagesForViewer(input, anon);
    expect(text(find(input, 'geheim'))).toContain('GEHEIM');
  });
});

describe('canViewGated', () => {
  test('Regeln', () => {
    expect(canViewGated([], anon)).toBe(true);
    expect(canViewGated(['*'], anon)).toBe(false);
    expect(canViewGated(['*'], member())).toBe(true);
    expect(canViewGated(['a'], member(['b']))).toBe(false);
    expect(canViewGated(['a'], staff)).toBe(true);
  });
});

describe('resolvePageViewer', () => {
  const OLD = process.env.NEXT_PUBLIC_DEV_MODE;
  beforeEach(() => { delete process.env.NEXT_PUBLIC_DEV_MODE; });
  afterAll(() => { process.env.NEXT_PUBLIC_DEV_MODE = OLD; });

  test('ohne Session: anonym; Mitglieder- und Backend-Sessions; Entsperr-Cookie', async () => {
    getServerSession.mockResolvedValueOnce(null);
    expect(await resolvePageViewer({ cookies: {} }, {})).toMatchObject({ isStaff: false, isMember: false });

    getServerSession.mockResolvedValueOnce({ user: { accountType: 'member', memberGroups: ['vorstand'] } });
    expect(await resolvePageViewer({ cookies: {} }, {})).toMatchObject({ isStaff: false, isMember: true, groups: ['vorstand'] });

    getServerSession.mockResolvedValueOnce({ user: { accountType: 'admin', role: 'EDITOR' } });
    expect(await resolvePageViewer({ cookies: {} }, {})).toMatchObject({ isStaff: true });

    getServerSession.mockResolvedValueOnce(null);
    const cookies = { [PASSWORD_UNLOCK_COOKIE]: buildUnlockCookieValue(['pw']) };
    expect((await resolvePageViewer({ cookies }, {})).unlocked).toEqual(['pw']);

    getServerSession.mockResolvedValueOnce(null);
    expect((await resolvePageViewer({ cookies: { [PASSWORD_UNLOCK_COOKIE]: 'gefaelscht.abc' } }, {})).unlocked).toEqual([]);
  });
});
