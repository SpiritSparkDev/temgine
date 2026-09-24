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
