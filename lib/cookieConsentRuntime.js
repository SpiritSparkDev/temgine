import { findCatalogServiceForIframe } from './cookieCatalog';

export const CONSENT_COOKIE_NAME = 'temgine_consent';
const CONSENT_EVENT = 'temgine:consent-changed';
const CATEGORY_LABELS = { functional: 'Funktional', statistics: 'Statistik', marketing: 'Marketing' };

export function isAllowed(category, consent) {
  if (category === 'necessary') return true;
  if (!consent) return false;
  return !!consent[category];
}

export function parseConsentCookie(cookieString) {
  const raw = String(cookieString || '');
  const row = raw.split('; ').find((part) => part.indexOf(`${CONSENT_COOKIE_NAME}=`) === 0);
  if (!row) return null;
  try {
    const value = decodeURIComponent(row.slice(CONSENT_COOKIE_NAME.length + 1));
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_e) {
    return null;
  }
}

export function getConsent() {
  if (typeof document === 'undefined') return null;
  return parseConsentCookie(document.cookie);
}

function writeConsentCookie(consent) {
  if (typeof document === 'undefined') return;
  const value = encodeURIComponent(JSON.stringify(consent));
  const maxAge = 60 * 60 * 24 * 365;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE_NAME}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
}

export function setConsent(partial) {
  const current = getConsent() || { necessary: true, functional: false, statistics: false, marketing: false };
  const next = { ...current, ...partial, necessary: true, timestamp: new Date().toISOString() };
  writeConsentCookie(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: next }));
  }
  return next;
}

export function acceptAll() {
  return setConsent({ functional: true, statistics: true, marketing: true });
}

export function rejectAll() {
  return setConsent({ functional: false, statistics: false, marketing: false });
}

export function installConsentBridge(services) {
  if (typeof window === 'undefined') return;
  window.temgineConsent = {
    get: getConsent,
    set: setConsent,
    acceptAll,
    rejectAll,
    services: services || [],
    onChange(callback) {
      window.addEventListener(CONSENT_EVENT, (e) => callback(e.detail));
    },
  };
}

function ensurePlaceholderStyles() {
  if (document.getElementById('temgine-embed-placeholder-style')) return;
  const style = document.createElement('style');
  style.id = 'temgine-embed-placeholder-style';
  style.textContent = '.tcb-embed-placeholder{display:flex;flex-direction:column;align-items:center;'
    + 'justify-content:center;gap:8px;min-height:200px;background:#f1f1f1;border:1px dashed #999;'
    + 'padding:16px;text-align:center;font-family:sans-serif;font-size:14px;color:#333;}'
    + '.tcb-embed-placeholder button{padding:8px 16px;border:none;border-radius:4px;'
    + 'background:#222;color:#fff;cursor:pointer;}';
  document.head.appendChild(style);
}

function blockIframe(iframe, service) {
  const originalSrc = iframe.getAttribute('src');
  const placeholder = document.createElement('div');
  placeholder.className = 'tcb-embed-placeholder';
  placeholder.dataset.tcbCategory = service.category;

  const text = document.createElement('p');
  text.textContent = `Dieser Inhalt (${service.name}) wurde blockiert, da die Kategorie `
    + `"${CATEGORY_LABELS[service.category] || service.category}" noch nicht zugestimmt wurde.`;
  placeholder.appendChild(text);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Inhalt laden';
  button.addEventListener('click', () => {
    setConsent({ [service.category]: true });
    iframe.setAttribute('src', originalSrc);
    placeholder.replaceWith(iframe);
  });
  placeholder.appendChild(button);

  iframe.removeAttribute('src');
  iframe.replaceWith(placeholder);
}

export function hydrateConsentGatedEmbeds(container) {
  if (!container || typeof document === 'undefined') return;
  ensurePlaceholderStyles();
  const consent = getConsent();
  container.querySelectorAll('iframe[src]').forEach((iframe) => {
    const service = findCatalogServiceForIframe(iframe.getAttribute('src'));
    if (!service) return;
    if (isAllowed(service.category, consent)) return;
    blockIframe(iframe, service);
  });
}

if (typeof window !== 'undefined' && !window.__temgineConsentListenerInstalled) {
  window.__temgineConsentListenerInstalled = true;
  window.addEventListener(CONSENT_EVENT, (event) => {
    const consent = event.detail;
    document.querySelectorAll('.tcb-embed-placeholder').forEach((placeholder) => {
      if (isAllowed(placeholder.dataset.tcbCategory, consent)) {
        const button = placeholder.querySelector('button');
        if (button) button.click();
      }
    });
  });
}
