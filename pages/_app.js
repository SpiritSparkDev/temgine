import '../styles/global.css'
import '../styles/auth.css'
import '../styles/admin.css'
import '../styles/admin-foundation.css'
import '../styles/admin-feedback.css'
import '../styles/page-editor.css'
import '../styles/templates-structure.css'
import '../styles/admin-data-views.css'
import '../styles/buttons.css'
import '../styles/page-tree.css'
import '../styles/editor-common.css'
import '../styles/file-manager.css'
import '../styles/users.css'
import '../styles/navigation-view.css'
import '../styles/blog-view.css'
import '../styles/cookie-consent-view.css'
import { SessionProvider } from 'next-auth/react';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { installConsentBridge, getConsent, isAllowed } from '../lib/cookieConsentRuntime';

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  const router = useRouter();

  const loadExternalCSS = async () => {
    try {
      const res = await fetch('/api/css');
      const data = await res.json();
      const files = data.files || [];

      document.querySelectorAll('link[data-extern-css]').forEach(link => link.remove());

      files.filter(f => f.enabled !== false).forEach((f) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = typeof f === 'string' ? `/extern_css/${f}` : f.href;
        link.dataset.externCss = 'true';
        document.head.appendChild(link);
      });
    } catch (error) {
      console.error('Fehler beim Laden der externen CSS-Dateien:', error);
    }
  };

  const loadExternalJS = async () => {
    try {
      const res = await fetch('/api/js');
      const data = await res.json();
      const files = data.files || [];
      const consent = getConsent();

      // Additive only: removing a <script> doesn't undo it, and re-adding one
      // re-executes it (duplicate analytics init/pageviews). A consent
      // withdrawal therefore only takes effect after a reload.
      const existingSrcs = new Set(
        Array.from(document.querySelectorAll('script[data-extern-js]')).map((s) => s.src)
      );

      files
        .filter(f => f.enabled !== false)
        .filter(f => isAllowed(f.category || null, consent))
        .forEach((f) => {
          const href = typeof f === 'string' ? `/extern_js/${f}` : f.href;
          if (existingSrcs.has(new URL(href, window.location.origin).href)) return;
          const script = document.createElement('script');
          script.src = href;
          script.defer = true;
          script.dataset.externJs = 'true';
          document.body.appendChild(script);
        });
    } catch (error) {
      console.error('Fehler beim Laden der externen JS-Dateien:', error);
    }
  };

  const loadFonts = () => {
    const existing = document.getElementById('temgine-font-face');
    if (existing) existing.remove();

    const link = document.createElement('link');
    link.id = 'temgine-font-face';
    link.rel = 'stylesheet';
    link.href = '/api/fonts-css';
    document.head.appendChild(link);
  };

  const loadCookieConsent = async () => {
    try {
      const res = await fetch('/api/cookies');
      const data = await res.json();
      installConsentBridge(data.services || []);

      if (!document.getElementById('temgine-cookie-banner-style')) {
        const style = document.createElement('style');
        style.id = 'temgine-cookie-banner-style';
        style.textContent = data.banner?.css || '';
        document.head.appendChild(style);
      }

      if (!document.getElementById('temgine-cookie-banner-root')) {
        const root = document.createElement('div');
        root.id = 'temgine-cookie-banner-root';
        root.innerHTML = data.banner?.html || '';
        document.body.appendChild(root);

        const script = document.createElement('script');
        script.textContent = data.banner?.js || '';
        document.body.appendChild(script);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Cookie-Einstellungen:', error);
    }
  };

  useEffect(() => {
    const path = router && router.pathname ? router.pathname : '';
    const isBackend = path.startsWith('/admin') || path.startsWith('/api') || path.startsWith('/invite') || path.startsWith('/_next') || path.startsWith('/auth');

    const componentOptOut = !!(Component && Component.noExternCss);
    const propsOptOut = !!(pageProps && pageProps.noExternCss);

    if (!isBackend && !componentOptOut && !propsOptOut) {
      loadCookieConsent();
      loadExternalCSS();
      loadExternalJS();
      loadFonts();
    }
  }, [router && router.pathname, Component]);

  useEffect(() => {
    const handler = () => { loadExternalJS(); };
    window.addEventListener('temgine:consent-changed', handler);
    return () => window.removeEventListener('temgine:consent-changed', handler);
  }, []);

  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      <Head>
        {/* Favicon files served from /public/favicon/ */}
        <link rel="icon" href="/favicon/favicon.ico" />
        <link rel="shortcut icon" href="/favicon/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png" />
        <link rel="manifest" href="/favicon/site.webmanifest" />
        <meta name="theme-color" content="#ffffff" />
        {/* Site logo (served from public/assets/) - social preview */}
        <meta property="og:image" content="/assets/light.png" />
        <meta name="twitter:image" content="/assets/light.png" />
        <meta name="msapplication-TileImage" content="/assets/light.png" />
      </Head>
      <Component {...pageProps} />
    </SessionProvider>
  );
}
