process.env.NEXTAUTH_SECRET = 'test-secret-for-unlock-cookie';

const { buildUnlockCookieValue, parseUnlockCookieValue, serializeUnlockCookie, PASSWORD_UNLOCK_COOKIE } = require('../lib/pagePasswordLock');

describe('pagePasswordLock cookie signing', () => {
  test('round-trips a list of unlocked page ids', () => {
    const value = buildUnlockCookieValue(['page-1', 'page-2']);
    expect(parseUnlockCookieValue(value)).toEqual(['page-1', 'page-2']);
  });

  test('deduplicates ids', () => {
    const value = buildUnlockCookieValue(['page-1', 'page-1']);
    expect(parseUnlockCookieValue(value)).toEqual(['page-1']);
  });

  test('rejects a tampered payload', () => {
    const value = buildUnlockCookieValue(['page-1']);
    const [encoded] = value.split('.');
    const tampered = `${encoded}.wrong-signature`;
    expect(parseUnlockCookieValue(tampered)).toEqual([]);
  });

  test('rejects garbage input', () => {
    expect(parseUnlockCookieValue('not-a-valid-cookie')).toEqual([]);
    expect(parseUnlockCookieValue(null)).toEqual([]);
    expect(parseUnlockCookieValue(undefined)).toEqual([]);
  });

  test('serializeUnlockCookie produces an httpOnly cookie string containing the cookie name', () => {
    const header = serializeUnlockCookie(['page-1']);
    expect(header).toContain(`${PASSWORD_UNLOCK_COOKIE}=`);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
  });
});
