/**
 * @jest-environment jsdom
 */
const {
  isAllowed,
  parseConsentCookie,
  getConsent,
  setConsent,
  hydrateConsentGatedEmbeds,
} = require('../lib/cookieConsentRuntime');

describe('isAllowed', () => {
  test('necessary is always allowed', () => {
    expect(isAllowed('necessary', null)).toBe(true);
    expect(isAllowed('necessary', { marketing: false })).toBe(true);
  });

  test('an unclassified (null) category is blocked even with consent present', () => {
    expect(isAllowed(null, null)).toBe(false);
    expect(isAllowed(null, { marketing: true })).toBe(false);
  });

  test('other categories follow the consent object', () => {
    expect(isAllowed('marketing', { marketing: true })).toBe(true);
    expect(isAllowed('marketing', { marketing: false })).toBe(false);
    expect(isAllowed('marketing', null)).toBe(false);
  });
});

describe('parseConsentCookie', () => {
  test('parses a valid consent cookie value', () => {
    const cookieStr = `other=1; temgine_consent=${encodeURIComponent(JSON.stringify({ necessary: true, marketing: true }))}`;
    expect(parseConsentCookie(cookieStr)).toEqual({ necessary: true, marketing: true });
  });

  test('returns null when the cookie is missing', () => {
    expect(parseConsentCookie('other=1')).toBeNull();
  });

  test('returns null for malformed JSON', () => {
    expect(parseConsentCookie('temgine_consent=not-json')).toBeNull();
  });
});

describe('setConsent / getConsent', () => {
  beforeEach(() => { document.cookie = 'temgine_consent=; Max-Age=0; Path=/'; });

  test('setConsent persists categories and getConsent reads them back', () => {
    setConsent({ marketing: true, statistics: false });
    const consent = getConsent();
    expect(consent.necessary).toBe(true);
    expect(consent.marketing).toBe(true);
    expect(consent.statistics).toBe(false);
  });

  test('setConsent dispatches a temgine:consent-changed event', () => {
    const handler = jest.fn();
    window.addEventListener('temgine:consent-changed', handler);
    setConsent({ marketing: true });
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('temgine:consent-changed', handler);
  });
});

describe('hydrateConsentGatedEmbeds', () => {
  beforeEach(() => { document.cookie = 'temgine_consent=; Max-Age=0; Path=/'; });

  test('replaces a blocked YouTube iframe with a placeholder', () => {
    document.body.innerHTML = '<div id="c"><iframe src="https://www.youtube.com/embed/abc"></iframe></div>';
    hydrateConsentGatedEmbeds(document.getElementById('c'));
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('.tcb-embed-placeholder')).not.toBeNull();
  });

  test('leaves an already-consented iframe untouched', () => {
    setConsent({ marketing: true });
    document.body.innerHTML = '<div id="c"><iframe src="https://www.youtube.com/embed/abc"></iframe></div>';
    hydrateConsentGatedEmbeds(document.getElementById('c'));
    expect(document.querySelector('iframe')).not.toBeNull();
  });

  test('leaves an unrecognized iframe domain untouched', () => {
    document.body.innerHTML = '<div id="c"><iframe src="https://example.com/widget"></iframe></div>';
    hydrateConsentGatedEmbeds(document.getElementById('c'));
    expect(document.querySelector('iframe')).not.toBeNull();
  });

  test('clicking the placeholder button restores the iframe and grants consent', () => {
    document.body.innerHTML = '<div id="c"><iframe src="https://www.youtube.com/embed/abc"></iframe></div>';
    hydrateConsentGatedEmbeds(document.getElementById('c'));
    document.querySelector('.tcb-embed-placeholder button').click();
    expect(document.querySelector('iframe').getAttribute('src')).toBe('https://www.youtube.com/embed/abc');
    expect(getConsent().marketing).toBe(true);
  });
});

describe('stripBlockedIframeSrcs', () => {
  const { stripBlockedIframeSrcs } = require('../lib/cookieConsentRuntime');
  const yt = '<p>x</p><iframe width="560" src="https://www.youtube.com/embed/abc" allowfullscreen></iframe>';

  test('a not-yet-consented catalog iframe has no fetchable src left in the HTML string', () => {
    const out = stripBlockedIframeSrcs(yt, null);
    expect(out).not.toContain(' src="https://www.youtube.com');
    expect(out).toContain('data-tcb-src="https://www.youtube.com/embed/abc"');
    expect(out).toContain('width="560"');
    expect(out).toContain('allowfullscreen');
    // Parsed by a real DOM, the iframe has no src attribute at all.
    const div = document.createElement('div');
    div.innerHTML = out;
    expect(div.querySelector('iframe').hasAttribute('src')).toBe(false);
  });

  test('handles single quotes too', () => {
    const out = stripBlockedIframeSrcs("<iframe src='https://www.youtube.com/embed/abc'></iframe>", { marketing: false });
    expect(out).toBe("<iframe data-tcb-src='https://www.youtube.com/embed/abc'></iframe>");
  });

  test('an already-consented iframe passes through unchanged', () => {
    expect(stripBlockedIframeSrcs(yt, { marketing: true })).toBe(yt);
  });

  test('an unmatched iframe passes through unchanged', () => {
    const html = '<iframe src="https://example.com/widget"></iframe>';
    expect(stripBlockedIframeSrcs(html, null)).toBe(html);
  });

  test('null/empty html returns an empty string', () => {
    expect(stripBlockedIframeSrcs(null, null)).toBe('');
  });
});

describe('hydrateConsentGatedEmbeds with pre-stripped iframes', () => {
  beforeEach(() => { document.cookie = 'temgine_consent=; Max-Age=0; Path=/'; });

  test('promotes an already-consented data-tcb-src iframe back to a live src', () => {
    setConsent({ marketing: true });
    document.body.innerHTML = '<div id="c"><iframe data-tcb-src="https://www.youtube.com/embed/abc"></iframe></div>';
    hydrateConsentGatedEmbeds(document.getElementById('c'));
    const iframe = document.querySelector('iframe');
    expect(iframe.getAttribute('src')).toBe('https://www.youtube.com/embed/abc');
    expect(iframe.hasAttribute('data-tcb-src')).toBe(false);
    expect(document.querySelector('.tcb-embed-placeholder')).toBeNull();
  });

  test('turns a still-disallowed data-tcb-src iframe into a placeholder; click restores it', () => {
    document.body.innerHTML = '<div id="c"><iframe data-tcb-src="https://www.youtube.com/embed/abc"></iframe></div>';
    hydrateConsentGatedEmbeds(document.getElementById('c'));
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('.tcb-embed-placeholder')).not.toBeNull();
    document.querySelector('.tcb-embed-placeholder button').click();
    const iframe = document.querySelector('iframe');
    expect(iframe.getAttribute('src')).toBe('https://www.youtube.com/embed/abc');
    expect(iframe.hasAttribute('data-tcb-src')).toBe(false);
  });
});

describe('placeholder click vs. global consent listener', () => {
  beforeEach(() => { document.cookie = 'temgine_consent=; Max-Age=0; Path=/'; });

  test('one click dispatches exactly one consent-changed event and sets src exactly once', () => {
    document.body.innerHTML = '<div id="c"><iframe src="https://www.youtube.com/embed/abc"></iframe></div>';
    const iframe = document.querySelector('iframe');
    hydrateConsentGatedEmbeds(document.getElementById('c'));

    const seenAtEvent = [];
    const handler = jest.fn(() => {
      seenAtEvent.push({
        placeholders: document.querySelectorAll('.tcb-embed-placeholder').length,
        src: iframe.getAttribute('src'),
      });
    });
    window.addEventListener('temgine:consent-changed', handler);
    const setAttr = jest.spyOn(iframe, 'setAttribute');

    document.querySelector('.tcb-embed-placeholder button').click();

    expect(handler).toHaveBeenCalledTimes(1);
    // When listeners (global placeholder listener, _app's JS loader) see the
    // event, the DOM swap is already done — nothing left to re-click.
    expect(seenAtEvent).toEqual([{ placeholders: 0, src: 'https://www.youtube.com/embed/abc' }]);
    expect(setAttr.mock.calls.filter(([name]) => name === 'src')).toHaveLength(1);
    expect(document.querySelector('.tcb-embed-placeholder')).toBeNull();
    window.removeEventListener('temgine:consent-changed', handler);
    setAttr.mockRestore();
  });
});
