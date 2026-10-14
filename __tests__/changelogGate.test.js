const { parseVersion, hasNewerMinor, isNewerVersion } = require('../lib/changelogGate');

describe('parseVersion', () => {
  test('zerlegt eine normale Version', () => expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 }));
  test('ungültige Eingabe → null', () => expect(parseVersion('nicht-semver')).toBeNull());
  test('leere/fehlende Eingabe → null', () => expect(parseVersion(undefined)).toBeNull());
});

describe('hasNewerMinor', () => {
  test('Minor-Sprung löst aus', () => expect(hasNewerMinor('0.47.0', '0.46.1')).toBe(true));
  test('Major-Sprung löst aus', () => expect(hasNewerMinor('1.0.0', '0.46.1')).toBe(true));
  test('reiner Patch löst NICHT aus', () => expect(hasNewerMinor('0.47.1', '0.47.0')).toBe(false));
  test('gleiche Version löst nicht aus', () => expect(hasNewerMinor('0.47.0', '0.47.0')).toBe(false));
  test('ältere Version löst nicht aus', () => expect(hasNewerMinor('0.46.1', '0.47.0')).toBe(false));
  test('mehrere übersprungene Minor-Versionen lösen trotzdem nur einmal aus', () => expect(hasNewerMinor('0.49.0', '0.46.1')).toBe(true));
});

describe('isNewerVersion', () => {
  test('Patch zählt als neuer', () => expect(isNewerVersion('0.47.1', '0.47.0')).toBe(true));
  test('Minor zählt als neuer', () => expect(isNewerVersion('0.48.0', '0.47.5')).toBe(true));
  test('gleiche Version ist nicht neuer', () => expect(isNewerVersion('0.47.0', '0.47.0')).toBe(false));
  test('ältere Version ist nicht neuer', () => expect(isNewerVersion('0.46.1', '0.47.0')).toBe(false));
});
