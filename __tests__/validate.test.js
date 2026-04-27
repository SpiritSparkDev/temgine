/**
 * __tests__/validate.test.js
 * Unit-Tests für lib/validate.js — Validierungsschicht (F-01)
 */

import { validate, rules } from '../lib/validate';

describe('rules.required()', () => {
  const fn = rules.required();

  test('gibt Fehler bei undefined zurück', () => {
    expect(fn(undefined, 'feld')).toMatch(/erforderlich/);
  });

  test('gibt Fehler bei null zurück', () => {
    expect(fn(null, 'feld')).toMatch(/erforderlich/);
  });

  test('gibt Fehler bei leerem String zurück', () => {
    expect(fn('', 'feld')).toMatch(/erforderlich/);
  });

  test('gibt null bei vorhandenem Wert zurück', () => {
    expect(fn('hallo', 'feld')).toBeNull();
    expect(fn(0, 'feld')).toBeNull();
    expect(fn(false, 'feld')).toBeNull();
  });

  test('verwendet benutzerdefinierte Fehlermeldung', () => {
    expect(rules.required('Pflichtfeld!')(undefined, 'x')).toBe('Pflichtfeld!');
  });
});

describe('rules.string()', () => {
  const fn = rules.string();

  test('gibt null bei echtem String zurück', () => {
    expect(fn('text', 'feld')).toBeNull();
  });

  test('gibt null bei undefined/null zurück (optional)', () => {
    expect(fn(undefined, 'feld')).toBeNull();
    expect(fn(null, 'feld')).toBeNull();
  });

  test('gibt Fehler bei Zahl zurück', () => {
    expect(fn(42, 'feld')).toMatch(/Text/);
  });

  test('gibt Fehler bei Objekt zurück', () => {
    expect(fn({}, 'feld')).toBeTruthy();
  });
});

describe('rules.number()', () => {
  test('gibt null bei Zahl zurück', () => {
    expect(rules.number()(42, 'feld')).toBeNull();
  });

  test('gibt Fehler bei String zurück', () => {
    expect(rules.number()('abc', 'feld')).toBeTruthy();
  });

  test('gibt null bei undefined zurück (optional)', () => {
    expect(rules.number()(undefined, 'feld')).toBeNull();
  });
});

describe('rules.maxLen()', () => {
  test('gibt null wenn Länge OK', () => {
    expect(rules.maxLen(5)('hallo', 'feld')).toBeNull();
    expect(rules.maxLen(5)('hi', 'feld')).toBeNull();
  });

  test('gibt Fehler wenn zu lang', () => {
    expect(rules.maxLen(3)('hallo', 'feld')).toMatch(/3/);
  });

  test('gibt null bei undefined zurück', () => {
    expect(rules.maxLen(5)(undefined, 'feld')).toBeNull();
  });
});

describe('rules.minLen()', () => {
  test('gibt null wenn lang genug', () => {
    expect(rules.minLen(3)('hallo', 'feld')).toBeNull();
  });

  test('gibt Fehler wenn zu kurz', () => {
    expect(rules.minLen(5)('hi', 'feld')).toMatch(/5/);
  });
});

describe('rules.oneOf()', () => {
  const allowed = ['DRAFT', 'PUBLISHED', 'REVIEW'];
  const fn = rules.oneOf(allowed);

  test('gibt null für erlaubten Wert zurück', () => {
    expect(fn('DRAFT', 'status')).toBeNull();
    expect(fn('PUBLISHED', 'status')).toBeNull();
  });

  test('gibt Fehler für unerlaubten Wert zurück', () => {
    expect(fn('UNKNOWN', 'status')).toMatch(/DRAFT/);
  });

  test('gibt null für undefined zurück (optional)', () => {
    expect(fn(undefined, 'status')).toBeNull();
  });
});

describe('rules.email()', () => {
  const fn = rules.email();

  test('gibt null für gültige E-Mail zurück', () => {
    expect(fn('user@example.com', 'email')).toBeNull();
    expect(fn('a+b@x.de', 'email')).toBeNull();
  });

  test('gibt Fehler für ungültige E-Mail zurück', () => {
    expect(fn('keineatadresse', 'email')).toBeTruthy();
    expect(fn('missing@', 'email')).toBeTruthy();
  });

  test('gibt null für leeren Wert zurück (optional)', () => {
    expect(fn('', 'email')).toBeNull();
    expect(fn(undefined, 'email')).toBeNull();
  });
});

describe('rules.slug()', () => {
  const fn = rules.slug();

  test('gibt null für gültigen Slug zurück', () => {
    expect(fn('mein-slug-123', 'slug')).toBeNull();
    expect(fn('abc', 'slug')).toBeNull();
  });

  test('gibt Fehler für ungültigen Slug zurück', () => {
    expect(fn('Groß Buchstaben', 'slug')).toBeTruthy();
    expect(fn('mit/slash', 'slug')).toBeTruthy();
  });

  test('gibt null für undefined zurück', () => {
    expect(fn(undefined, 'slug')).toBeNull();
  });
});

describe('rules.noHtml()', () => {
  const fn = rules.noHtml();

  test('gibt null bei normalem Text zurück', () => {
    expect(fn('Hallo Welt', 'feld')).toBeNull();
  });

  test('gibt Fehler bei HTML-Tags zurück', () => {
    expect(fn('<script>alert(1)</script>', 'feld')).toBeTruthy();
    expect(fn('<b>fett</b>', 'feld')).toBeTruthy();
  });
});

describe('rules.isoDate()', () => {
  const fn = rules.isoDate();

  test('gibt null für ISO-Datum zurück', () => {
    expect(fn('2026-04-24T12:00:00Z', 'datum')).toBeNull();
    expect(fn('2026-04-24', 'datum')).toBeNull();
  });

  test('gibt Fehler für ungültiges Datum zurück', () => {
    expect(fn('kein-datum', 'datum')).toBeTruthy();
  });
});

describe('validate() Funktion', () => {
  test('gibt [true, {}] für valide Daten zurück', () => {
    const [ok, errors] = validate(
      { title: 'Hallo', status: 'DRAFT', age: 30 },
      {
        title:  [rules.required(), rules.string(), rules.maxLen(100)],
        status: [rules.oneOf(['DRAFT', 'PUBLISHED'])],
        age:    [rules.number()],
      }
    );
    expect(ok).toBe(true);
    expect(errors).toEqual({});
  });

  test('gibt [false, errors] bei Verstößen zurück', () => {
    const [ok, errors] = validate(
      { title: '', status: 'INVALID' },
      {
        title:  [rules.required()],
        status: [rules.oneOf(['DRAFT', 'PUBLISHED'])],
      }
    );
    expect(ok).toBe(false);
    expect(errors).toHaveProperty('title');
    expect(errors).toHaveProperty('status');
  });

  test('meldet nur ersten Fehler pro Feld', () => {
    const [ok, errors] = validate(
      { email: 'keine-email' },
      { email: [rules.required(), rules.email(), rules.maxLen(5)] }
    );
    expect(ok).toBe(false);
    // required() passt, also schlägt email() fehl — nur ein Fehler
    expect(Object.keys(errors).length).toBe(1);
  });

  test('toleriert null/undefined als Eingabe', () => {
    const [ok, errors] = validate(null, { title: [rules.required()] });
    expect(ok).toBe(false);
    expect(errors.title).toBeTruthy();
  });

  test('gibt [true, {}] zurück bei leerem Schema', () => {
    const [ok, errors] = validate({ x: 1 }, {});
    expect(ok).toBe(true);
    expect(errors).toEqual({});
  });

  test('ignoriert Felder, die im Schema nicht definiert sind', () => {
    const [ok] = validate(
      { extra: 'irrelevant', title: 'OK' },
      { title: [rules.required()] }
    );
    expect(ok).toBe(true);
  });
});
