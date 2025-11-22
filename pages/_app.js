import '../styles/global.css'
import '../styles/admin.css'
import '../styles/snippets.css'
import '../styles/buttons.css'
import '../styles/templates.css'
import '../styles/admin-components.css'
import '../styles/page-tree.css'
import '../styles/editor-common.css'
import '../styles/file-manager.css'
import '../styles/users.css'
/* toolbar.css removed — floating toolbar removed; snippets live in TemplatesViewModern */
import { SessionProvider } from 'next-auth/react';
import { useEffect } from 'react';
import Head from 'next/head';

export default function App({ Component, pageProps: { session, ...pageProps } }) {
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

    loadExternalCSS();
  }, []);

  return (
    <SessionProvider session={session}>
      <Component {...pageProps} />
    </SessionProvider>
  );
}
