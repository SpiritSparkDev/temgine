/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, act } from '@testing-library/react';

jest.mock('next/router', () => {
  const router = { pathname: '/[...slug]', asPath: '/foo', query: { slug: ['foo'] }, replace: () => {} };
  return { useRouter: () => router };
});
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
// Not used on the static-snapshot path; mocked to avoid an unrelated ESM (marked) load issue.
jest.mock('../lib/templateEngine', () => ({ renderPage: jest.fn(), collectNavigationBlockIds: jest.fn(() => []) }));
jest.mock('../lib/contactFormRuntime', () => ({ hydrateContactForms: jest.fn() }));

import Home from '../pages/index';
import CatchAll from '../pages/[...slug]';

const PAGE_HTML = '<main><p>Hallo</p><iframe src="https://www.youtube.com/embed/abc"></iframe></main>';

const response = (body, contentType = 'application/json') => ({
  ok: true,
  headers: { get: () => contentType },
  json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

describe.each([['pages/index.js', Home], ['pages/[...slug].js', CatchAll]])('%s embed gating', (_name, PageComponent) => {
  beforeEach(() => {
    document.cookie = 'temgine_consent=; Max-Age=0; Path=/';
    global.fetch = jest.fn(async (url) => {
      if (url.startsWith('/api/settings')) return response({ liveRenderMode: 'static' });
      if (url.startsWith('/__live/index.html') || url.startsWith('/__live/foo/index.html')) return response(PAGE_HTML, 'text/html');
      if (url.startsWith('/__live/__meta.json')) return response({ ok: true });
      return response({});
    });
  });

  test('the HTML React inserts never contains a live YouTube iframe src', async () => {
    // React's dangerouslySetInnerHTML assigns element.innerHTML — the moment a
    // real browser would start fetching any <iframe src>. Record every string.
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    const written = [];
    Object.defineProperty(Element.prototype, 'innerHTML', {
      ...desc,
      set(value) { written.push(String(value)); desc.set.call(this, value); },
    });
    try {
      render(<PageComponent />);
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    } finally {
      Object.defineProperty(Element.prototype, 'innerHTML', desc);
    }

    const pageWrites = written.filter((s) => s.includes('Hallo'));
    expect(pageWrites.length).toBeGreaterThan(0);
    pageWrites.forEach((s) => expect(s).not.toMatch(/<iframe[^>]*\ssrc="https:\/\/www\.youtube\.com/));
    expect(document.querySelector('.tcb-embed-placeholder')).not.toBeNull();
  });

  test('with marketing consent the iframe renders with its src', async () => {
    document.cookie = `temgine_consent=${encodeURIComponent(JSON.stringify({ necessary: true, marketing: true }))}; Path=/`;
    render(<PageComponent />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(document.querySelector('iframe').getAttribute('src')).toBe('https://www.youtube.com/embed/abc');
  });
});
