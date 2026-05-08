import '../styles/global.css'
import '../styles/auth.css'
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
import '../styles/navigation-view.css'
import '../styles/blog-view.css'
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
        
        // Füge <link> Tags in der angegebenen Reihenfolge hinzu (nur aktivierte Dateien)
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

        // Entferne alte externe JS Tags
        document.querySelectorAll('script[data-extern-js]').forEach(script => script.remove());

        // Füge Skripte in Reihenfolge hinzu (nur aktivierte Dateien)
        files.filter(f => f.enabled !== false).forEach((f) => {
          const script = document.createElement('script');
          script.src = typeof f === 'string' ? `/extern_js/${f}` : f.href;
          script.defer = true;
          script.dataset.externJs = 'true';
          document.body.appendChild(script);
        });
      } catch (error) {
        console.error('Fehler beim Laden der externen JS-Dateien:', error);
      }
    };

    // Don't load editor-managed external CSS on admin or backend routes
    const path = router && router.pathname ? router.pathname : '';
    const isBackend = path.startsWith('/admin') || path.startsWith('/api') || path.startsWith('/invite') || path.startsWith('/_next') || path.startsWith('/auth');

    // Allow per-page/component opt-out via `Component.noExternCss` or `pageProps.noExternCss`
    const componentOptOut = !!(Component && Component.noExternCss);
    const propsOptOut = !!(pageProps && pageProps.noExternCss);

    const loadFonts = () => {
      // Remove any previously injected font link
      const existing = document.getElementById('temgine-font-face');
      if (existing) existing.remove();

      const link = document.createElement('link');
      link.id = 'temgine-font-face';
      link.rel = 'stylesheet';
      link.href = '/api/fonts-css';
      document.head.appendChild(link);
    };

    if (!isBackend && !componentOptOut && !propsOptOut) {
      loadExternalCSS();
      loadExternalJS();
      loadFonts();
    }
  }, [router && router.pathname, Component]);

  return (
    <SessionProvider session={session}>
      <Head>
        {/* Font Awesome Icons CDN */}
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
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
