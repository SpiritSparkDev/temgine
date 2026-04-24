/**
 * __tests__/rateLimit.test.js
 * Unit-Tests für lib/rateLimit.js (F-02)
 */

import { rateLimit } from '../lib/rateLimit';

function makeReq(ip = '1.2.3.4') {
  return {
    headers: { 'x-forwarded-for': ip },
    socket: { remoteAddress: ip },
  };
}

describe('rateLimit()', () => {
  test('erlaubt Anfragen unterhalb des Limits', () => {
    const limiter = rateLimit({ windowMs: 5000, max: 5 });
    const req = makeReq('10.0.0.1');
    for (let i = 0; i < 5; i++) {
      const { ok } = limiter.check(req);
      expect(ok).toBe(true);
    }
  });

  test('blockiert Anfragen nach Überschreitung des Limits', () => {
    const limiter = rateLimit({ windowMs: 5000, max: 3 });
    const req = makeReq('10.0.0.2');
    for (let i = 0; i < 3; i++) limiter.check(req);
    const { ok, retryAfter } = limiter.check(req);
    expect(ok).toBe(false);
    expect(retryAfter).toBeGreaterThan(0);
  });

  test('verschiedene IPs werden unabhängig gezählt', () => {
    const limiter = rateLimit({ windowMs: 5000, max: 2 });
    const reqA = makeReq('10.0.1.1');
    const reqB = makeReq('10.0.1.2');

    limiter.check(reqA);
    limiter.check(reqA);
    const { ok: aBlocked } = limiter.check(reqA);
    expect(aBlocked).toBe(false);

    const { ok: bOk } = limiter.check(reqB);
    expect(bOk).toBe(true);
  });

  test('gibt remaining korrekt zurück', () => {
    const limiter = rateLimit({ windowMs: 5000, max: 10 });
    const req = makeReq('10.0.2.1');
    const first = limiter.check(req);
    expect(first.remaining).toBe(9);
    const second = limiter.check(req);
    expect(second.remaining).toBe(8);
  });

  test('nutzt x-forwarded-for Header für den Key', () => {
    const limiter = rateLimit({ windowMs: 5000, max: 1 });
    const req = { headers: { 'x-forwarded-for': '5.6.7.8, 9.10.11.12' }, socket: {} };
    const { ok: first } = limiter.check(req);
    expect(first).toBe(true);
    const { ok: second } = limiter.check(req);
    expect(second).toBe(false);
  });

  test('keyFn-Option erlaubt benutzerdefinierten Schlüssel', () => {
    const limiter = rateLimit({
      windowMs: 5000,
      max: 2,
      keyFn: (req) => req.headers['x-user-id'] || 'anon',
    });
    const reqA = { headers: { 'x-user-id': 'user-1' }, socket: {} };
    const reqB = { headers: { 'x-user-id': 'user-2' }, socket: {} };

    limiter.check(reqA); limiter.check(reqA);
    const { ok: blocked } = limiter.check(reqA);
    expect(blocked).toBe(false);

    const { ok: free } = limiter.check(reqB);
    expect(free).toBe(true);
  });

  test('behandelt fehlenden IP-Header ohne Absturz', () => {
    const limiter = rateLimit({ windowMs: 5000, max: 5 });
    const req = { headers: {}, socket: {} };
    const { ok } = limiter.check(req);
    expect(ok).toBe(true);
  });
});
