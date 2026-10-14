/**
 * __tests__/jestSetup.test.js
 * Regressionstest für jest.setup.js: Lädt ein jsdom-Test Next-Serverinterna,
 * darf setImmediate danach nicht kaputt sein. Ohne den Polyfill merkte sich
 * Next undefined als "originales" setImmediate und alle späteren React-Tests
 * im selben Jest-Worker stürzten in act() ab
 * ("Cannot read properties of undefined (reading 'apply')").
 *
 * @jest-environment jsdom
 */

test('jsdom has setImmediate from Node', () => {
  expect(typeof globalThis.setImmediate).toBe('function');
  expect(typeof globalThis.clearImmediate).toBe('function');
});

test('setImmediate keeps working after Next installs its fast-setImmediate patch', async () => {
  require('next/dist/server/node-environment-extensions/fast-set-immediate.external.js');
  const timers = require('timers');

  await new Promise((resolve) => timers.setImmediate(resolve));
  await new Promise((resolve) => globalThis.setImmediate(resolve));
});
