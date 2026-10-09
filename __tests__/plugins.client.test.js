/**
 * Plugin-System P1, Browser-Seite: hydrate (inkl. rerender, temgine:rendered) und clientInit
 * (einmal, mit Consent) mit dem Test-Plugin __tests__/fixtures/plugins/echo.
 */
// marked ist ESM-only (siehe __tests__/templateEngine.test.js) — stub für renderPipeline.
jest.mock('marked', () => ({ marked: { parse: (s) => s, setOptions: () => {} }, Marked: class { use() {} parse(s) { return s; } } }));

import { _setClientPlugins, hydratePlugins, runClientInit } from '../lib/plugins/client';
import { hydratePage } from '../lib/renderPipeline';
import echoClient from './fixtures/plugins/echo/client';

const mockActive = (plugins) => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ plugins }) }));
};

beforeEach(() => {
  _setClientPlugins({ echo: echoClient });
  delete window.__echoInit;
  document.cookie = 'temgine_consent=; Max-Age=0; Path=/';
  document.body.innerHTML = '<div id="c"><span data-echo></span></div>';
});

test('active plugin: hydrate(container, { rerender }) then temgine:rendered', async () => {
  mockActive({ echo: { echo_greeting: 'Hallo' } });
  const rendered = jest.fn();
  document.addEventListener('temgine:rendered', rendered);
  const rerender = jest.fn();
  const container = document.getElementById('c');
  await hydratePlugins(container, rerender);
  const el = container.querySelector('[data-echo]');
  expect(el.textContent).toBe('echo');
  el.click();
  expect(rerender).toHaveBeenCalledTimes(1);
  expect(rendered).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledWith('/api/plugins');
  document.removeEventListener('temgine:rendered', rendered);
});

test('hydratePage runs plugin hydration and a throwing plugin does not break the page', async () => {
  _setClientPlugins({ echo: echoClient, boom: { hydrate: () => { throw new Error('kaputt'); } } });
  mockActive({ boom: {}, echo: {} });
  const err = jest.spyOn(console, 'error').mockImplementation(() => {});
  const rendered = new Promise((resolve) => document.addEventListener('temgine:rendered', resolve, { once: true }));
  hydratePage(document.getElementById('c'), () => {});
  await rendered;
  expect(document.querySelector('[data-echo]').textContent).toBe('echo');
  expect(err).toHaveBeenCalledWith('[plugin:boom] hydrate fehlgeschlagen:', expect.any(Error));
  err.mockRestore();
});

test('disabled plugin: no hydrate, no clientInit', async () => {
  mockActive({});
  await hydratePlugins(document.getElementById('c'), () => {});
  document.cookie = `temgine_consent=${encodeURIComponent(JSON.stringify({ statistics: true }))}; Path=/`;
  await runClientInit();
  expect(document.querySelector('[data-echo]').textContent).toBe('');
  expect(window.__echoInit).toBeUndefined();
});

test('clientInit waits for consent, runs once with public settings', async () => {
  mockActive({ echo: { echo_greeting: 'Hallo' } });
  await runClientInit();
  expect(window.__echoInit).toBeUndefined();
  document.cookie = `temgine_consent=${encodeURIComponent(JSON.stringify({ statistics: true }))}; Path=/`;
  await runClientInit();
  await runClientInit();
  expect(window.__echoInit).toBe(1);
  expect(window.__echoSettings).toEqual({ echo_greeting: 'Hallo' });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('without client plugins there is no request at all', async () => {
  _setClientPlugins({});
  global.fetch = jest.fn();
  const rendered = jest.fn();
  document.addEventListener('temgine:rendered', rendered);
  await hydratePlugins(document.getElementById('c'), () => {});
  await runClientInit();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(rendered).toHaveBeenCalledTimes(1);
  document.removeEventListener('temgine:rendered', rendered);
});
