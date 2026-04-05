import '../styles/global.css'
import '../styles/admin.css'
import '../styles/admin-foundation.css'
import '../styles/admin-feedback.css'
import '../styles/page-editor.css'
import '../styles/templates-structure.css'
import '../styles/admin-data-views.css'
import '../styles/snippets.css'
import '../styles/buttons.css'
import '../styles/page-tree.css'
import '../styles/editor-common.css'
import '../styles/file-manager.css'
import '../styles/users.css'
import { SessionProvider } from 'next-auth/react';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  const router = useRouter();

  useEffect(() => {
    // Lade externe CSS-Dateien dynamisch in der richtigen Reihenfolge
    const loadExternalCSS = async () => {
      try {
        const res = await fetch('/api/css');
        const data = await res.json();
        const files = data.files || [];
        
        // Entferne alte externe CSS Links
        document.querySelectorAll('link[data-extern-css]').forEach(link => link.remove());
        
        // Füge <link> Tags in der angegebenen Reihenfolge hinzu
        files.forEach((file) => {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = `/extern_css/${file}`;
          link.dataset.externCss = 'true';
          document.head.appendChild(link);
        });
      } catch (error) {
        console.error('Fehler beim Laden der externen CSS-Dateien:', error);
      }
    };

    // Don't load editor-managed external CSS on admin or backend routes
    const path = router && router.pathname ? router.pathname : '';
    const isBackend = path.startsWith('/admin') || path.startsWith('/api') || path.startsWith('/invite') || path.startsWith('/_next') || path.startsWith('/auth');

    // Allow per-page/component opt-out via `Component.noExternCss` or `pageProps.noExternCss`
    const componentOptOut = !!(Component && Component.noExternCss);
    const propsOptOut = !!(pageProps && pageProps.noExternCss);

    if (!isBackend && !componentOptOut && !propsOptOut) {
      loadExternalCSS();
    }
  }, [router && router.pathname, Component, pageProps]);

  return (
    <SessionProvider session={session}>
      <Head>
        {/* Favicon files served from /public/favicon/ */}
        <link rel="icon" href="/favicon/favicon.ico" />
        <link rel="shortcut icon" href="/favicon/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png" />
        <link rel="manifest" href="/favicon/site.webmanifest" />
        <meta name="theme-color" content="#ffffff" />
        {/* Site logo (served from public/assets/) - preload and social preview */}
        <link rel="preload" as="image" href="/assets/light.png" />
        <meta property="og:image" content="/assets/light.png" />
        <meta name="twitter:image" content="/assets/light.png" />
        <meta name="msapplication-TileImage" content="/assets/light.png" />
      </Head>
      <Component {...pageProps} />
    </SessionProvider>
  );
}
