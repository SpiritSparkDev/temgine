/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, act } from '@testing-library/react';

jest.mock('next/router', () => ({ useRouter: () => ({ pathname: '/' }) }));
jest.mock('next-auth/react', () => ({ SessionProvider: ({ children }) => children }));
jest.mock('next/head', () => ({ __esModule: true, default: () => null }));

import App from '../pages/_app';

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('_app extern_js loading on consent change', () => {
  beforeEach(() => {
    document.cookie = 'temgine_consent=; Max-Age=0; Path=/';
    document.body.innerHTML = '';
    global.fetch = jest.fn(async (url) => ({
      ok: true,
      json: async () => (url === '/api/js'
        ? { files: [
          { href: '/extern_js/necessary.js', category: 'necessary' },
          { href: '/extern_js/stats.js', category: 'statistics' },
        ] }
        : { files: [], services: [], banner: {} }),
    }));
  });

  const count = (name) => document.querySelectorAll(`script[data-extern-js][src$="${name}"]`).length;

  test('repeated consent-changed events never re-add an already-loaded script', async () => {
    const Page = () => null;
    render(<App Component={Page} pageProps={{}} />);
    await flush();
    expect(count('necessary.js')).toBe(1);
    expect(count('stats.js')).toBe(0);

    const initialTag = document.querySelector('script[src$="necessary.js"]');

    document.cookie = `temgine_consent=${encodeURIComponent(JSON.stringify({ necessary: true, statistics: true }))}; Path=/`;
    await act(async () => { window.dispatchEvent(new CustomEvent('temgine:consent-changed')); });
    await flush();
    await act(async () => { window.dispatchEvent(new CustomEvent('temgine:consent-changed')); });
    await flush();

    expect(count('necessary.js')).toBe(1);
    expect(count('stats.js')).toBe(1);
    // Same DOM node — never removed and re-inserted (which would re-execute it).
    expect(document.querySelector('script[src$="necessary.js"]')).toBe(initialTag);
  });
});
