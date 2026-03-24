import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import { LogOut, Moon, Sun, LayoutDashboard, FileText, Layout, Code, Users, Settings, Menu, FolderOpen } from 'lucide-react';
import DashboardView from './DashboardView';
import TemplatesViewModern from './TemplatesViewModern';
import PagesView from './PagesView';
import SnippetsView from './SnippetsView';
import SettingsView from './SettingsView';
import UsersViewModern from './UsersViewModern';
import UserInvitationsView from './UserInvitationsView';
import CSSManagerViewModern from './CSSManagerViewModern';
import NavigationViewModern from './NavigationViewModern';
import FileManagerView from './FileManagerView';
import Toast from './Toast';
import ConfirmDialog from './ConfirmDialog';
import ContentModelsView from './ContentModelsView';
import ErrorBoundary from './ErrorBoundary';

export default function AdminPageClient() {
  const { data: session } = useSession();
  const [templateList, setTemplateList] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [templateCode, setTemplateCode] = useState('<section class="my-section">\n  <div class="container">\n    <h1>{{title}}</h1>\n    <p>{{text}}</p>\n  </div>\n</section>');
  const [snippets, setSnippets] = useState([]);
  const [pages, setPages] = useState([]);
  const [editingPage, setEditingPage] = useState(null);
  const [view, setView] = useState('dashboard');
  const [settingsTab, setSettingsTab] = useState('database');

  useEffect(() => {
    if (view === 'users') {
      setSettingsTab('users');
    } else if (view === 'settings') {
      setSettingsTab('database');
    }
  }, [view]);
  
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadWarnings, setLoadWarnings] = useState([]);
  const router = useRouter();

  useEffect(() => {
    try {
      const saved = localStorage.getItem('adminView');
      const allowed = ['dashboard','pages','templates','navigation','snippets','files','css','users','settings','content-models'];
      if (saved && allowed.includes(saved)) setView(saved);
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('adminView', view);
    } catch (e) {}
  }, [view]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileNavOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleSelectView = (nextView) => {
    setView(nextView);
    setMobileNavOpen(false);
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const showConfirm = (message) => {
    return new Promise((resolve) => {
      setConfirmDialog({
        message,
        onConfirm: () => {
          setConfirmDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setConfirmDialog(null);
          resolve(false);
        }
      });
    });
  };

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      const isDark = saved === 'true';
      setDarkMode(isDark);
      if (isDark) {
        document.documentElement.classList.add('dark-mode');
      }
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', newMode.toString());
    if (newMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  };

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const warnings = [];

      try {
        const tRes = await fetch('/api/templates');
        if (!tRes.ok) throw new Error(`API error: ${tRes.status}`);
        const t = await tRes.json();
        let list = Array.isArray(t) ? t : [];
        if (list.length > 0 && typeof list[0] === 'string') {
          list = list.map(n => ({ name: n, type: 'SITE' }));
        }
        if (isMounted) setTemplateList(list);
      } catch (e) { 
        console.error('[admin] Error loading templates:', e);
        warnings.push('Templates konnten nicht geladen werden.');
        if (isMounted) setTemplateList([]);
      }

      try {
        const sRes = await fetch('/api/snippets');
        if (!sRes.ok) throw new Error(`API error: ${sRes.status}`);
        const s = await sRes.json();
        if (isMounted) {
          setSnippets(Array.isArray(s) && s.length > 0 ? s : [
            { label: 'Titel', snippet: '{{title}}' },
            { label: 'Text', snippet: '{{text}}' },
            { label: 'Bild', snippet: '{{images.0}}' }
          ]);
        }
      } catch (e) { 
        console.error('[admin] Error loading snippets:', e);
        warnings.push('Snippets konnten nicht geladen werden.');
        if (isMounted) setSnippets([]);
      }

      try {
        const pRes = await fetch('/api/pages?includeDrafts=true');
        if (!pRes.ok) throw new Error(`API error: ${pRes.status}`);
        const p = await pRes.json();
        if (isMounted) setPages(Array.isArray(p) ? p : (p.pages || []));
      } catch (e) { 
        console.error('[admin] Error loading pages:', e);
        warnings.push('Seiten konnten nicht geladen werden.');
        if (isMounted) setPages([]);
      }

      if (isMounted) {
        setLoadWarnings(warnings);
        setInitialLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleUpdatePages(updated) {
    setPages(updated);
    try {
      const response = await fetch('/api/pages', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(updated) 
      });
      if (!response.ok) {
        throw new Error('Speichern fehlgeschlagen');
      }
      return true;
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      showToast('Fehler beim Speichern der Seite!', 'error');
      return false;
    }
  }

  async function loadTemplate(name) {
    if (!name) return;
    const res = await fetch(`/api/templates?name=${encodeURIComponent(name)}`);
    if (res.ok) {
      const data = await res.json();
      setTemplateName(name);
      setTemplateCode(data.code || '');
    }
  }

  async function saveTemplate() {
    const name = templateName.trim();
    if (!name) {
      showToast('Bitte Namen eingeben', 'error');
      return;
    }
    await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, code: templateCode }) });
    showToast('Template erfolgreich gespeichert!', 'success');
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }

  async function deleteTemplate() {
    const name = templateName.trim();
    if (!name) {
      showToast('Kein Template ausgewählt', 'error');
      return;
    }
    const confirmed = await showConfirm(`Template "${name}" wirklich löschen?`);
    if (!confirmed) return;
    
    try {
      const response = await fetch('/api/templates', { 
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      
      if (!response.ok) {
        const error = await response.json();
        showToast(error.error || 'Fehler beim Löschen', 'error');
        return;
      }
      
      setTemplateName('');
      setTemplateCode('<section class="my-section">\n  <div class="container">\n    <h1>{{title}}</h1>\n    <p>{{text}}</p>\n     </div>\n</section>');
      const t = await fetch('/api/templates').then(r => r.json()).catch(() => []);
      setTemplateList(Array.isArray(t) ? t : (t.templates || []));
      showToast('Template erfolgreich gelöscht', 'success');
    } catch (error) {
      showToast('Fehler beim Löschen: ' + error.message, 'error');
    }
  }

  return (
    <ErrorBoundary>
      <Head>
        <title>TempHelix Admin</title>
      </Head>
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
      {confirmDialog && (
        <ConfirmDialog 
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
        />
      )}
      {process.env.NEXT_PUBLIC_DEV_MODE === 'true' && (
        <div style={{
          background: '#ff9800',
          color: '#000',
          padding: '8px 16px',
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '14px',
          borderBottom: '2px solid #f57c00'
        }}>
          ⚠️ DEVELOPMENT MODE - Authentifizierung deaktiviert
        </div>
      )}
      <div className="admin-navbar">
        <div className="admin-navbar-left">
          <button
            className="admin-mobile-menu-btn"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Navigation öffnen"
            title="Navigation öffnen"
          >
            <Menu size={18} />
          </button>
          <a href="/" className="admin-logo-link" title="TempHelix">
            <img src="/assets/Logo.png" alt="TempHelix" className="admin-logo-img" /> <h1 className='admin-logo'>TempHelix CMS Admin</h1>
          </a>
        </div>
        <div className="admin-navbar-right">
          <button 
            className="admin-theme-toggle" 
            onClick={toggleDarkMode}
            aria-label={darkMode ? 'Light Mode aktivieren' : 'Dark Mode aktivieren'}
            title={darkMode ? 'Light Mode' : 'Dark Mode'}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {session?.user && (
            <div className="admin-user-menu">
              <span className="admin-username">{session.user.name || session.user.email}</span>
              <button className="admin-logout-btn" onClick={() => signOut({ callbackUrl: '/login' })}>
                <LogOut size={16} style={{ marginRight: '0.5rem' }} />
                Abmelden
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="admin-main">
        {mobileNavOpen && (
          <div
            className="admin-sidebar-overlay"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}
        <aside className={`admin-sidebar ${mobileNavOpen ? 'open' : ''}`}>
          <nav className="admin-nav" aria-label="Admin Navigation">
            <button
              className="admin-sidebar-close"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Navigation schließen"
            >
              Schließen
            </button>
            <ul>
              <li><button className={`menu-item ${view==='dashboard'?'active':''}`} onClick={() => handleSelectView('dashboard')}><LayoutDashboard size={18} /> Dashboard</button></li>
              <li><button className={`menu-item ${view==='pages'?'active':''}`} onClick={() => handleSelectView('pages')}><FileText size={18} /> Pages</button></li>
              <li><button className={`menu-item ${view==='templates'?'active':''}`} onClick={() => handleSelectView('templates')}><Layout size={18} /> Templates</button></li>
              <li><button className={`menu-item ${view==='content-models'?'active':''}`} onClick={() => handleSelectView('content-models')}><Code size={18} /> Content Models</button></li>
              <li><button className={`menu-item ${view==='navigation'?'active':''}`} onClick={() => handleSelectView('navigation')}><Menu size={18} /> Navigation</button></li>
              <li><button className={`menu-item ${view==='snippets'?'active':''}`} onClick={() => handleSelectView('snippets')}><Code size={18} /> Snippets</button></li>
              <li><button className={`menu-item ${view==='files'?'active':''}`} onClick={() => handleSelectView('files')}><FolderOpen size={18} /> Dateien</button></li>
              <li><button className={`menu-item ${view==='css'?'active':''}`} onClick={() => handleSelectView('css')}><Code size={18} /> CSS</button></li>
              <li><button className={`menu-item ${view==='users'?'active':''}`} onClick={() => handleSelectView('users')}><Users size={18} /> Benutzer</button></li>
              <li><button className={`menu-item ${view==='settings'?'active':''}`} onClick={() => handleSelectView('settings')}><Settings size={18} /> Settings</button></li>
            </ul>
            <div className="menu-sep" />
          </nav>
        </aside>

        <main className="admin-editor">
          {initialLoading && (
            <div className="admin-view-loading" role="status" aria-live="polite">
              Lade Admin-Daten...
            </div>
          )}
          {!initialLoading && loadWarnings.length > 0 && (
            <div className="admin-load-warning" role="status" aria-live="polite">
              <strong>Hinweis:</strong> {loadWarnings.join(' ')}
            </div>
          )}
          {view === 'templates' && <TemplatesViewModern showToast={showToast} />}
          {view === 'content-models' && <ContentModelsView />}
          {view === 'pages' && (
            <PagesView
              pages={pages}
              templateList={templateList}
              editingPage={editingPage}
              setEditingPage={setEditingPage}
              handleUpdatePages={handleUpdatePages}
            />
          )}
          {view === 'snippets' && <SnippetsView showToast={showToast} />}
          {view === 'navigation' && <NavigationViewModern showToast={showToast} />}
          {view === 'dashboard' && (
            <DashboardView
              templateList={templateList}
              pages={pages}
              snippets={snippets}
              setView={setView}
              showToast={showToast}
            />
          )}
          {view === 'files' && <FileManagerView showToast={showToast} />}
          {view === 'css' && <CSSManagerViewModern showToast={showToast} />}
          {view === 'users' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="settings-tabs-wrapper">
                <div className="settings-tabs">
                  <button
                    onClick={() => setSettingsTab('users')}
                    className={`settings-tab-btn ${settingsTab === 'users' ? 'active' : ''}`}
                  >
                    Benutzer
                  </button>
                  <button
                    onClick={() => setSettingsTab('invitations')}
                    className={`settings-tab-btn ${settingsTab === 'invitations' ? 'active' : ''}`}
                  >
                    Einladungen
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                {settingsTab === 'users' && <UsersViewModern showToast={showToast} />}
                {settingsTab === 'invitations' && <UserInvitationsView showToast={showToast} />}
              </div>
            </div>
          )}
          {view === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="settings-tabs-wrapper">
                <div className="settings-tabs">
                  <button
                    onClick={() => setSettingsTab('database')}
                    className={`settings-tab-btn ${settingsTab === 'database' ? 'active' : ''}`}
                  >
                    Datenbank
                  </button>
                  <button
                    onClick={() => setSettingsTab('css')}
                    className={`settings-tab-btn ${settingsTab === 'css' ? 'active' : ''}`}
                  >
                    CSS-Dateien
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                {settingsTab === 'database' && <SettingsView showToast={showToast} />}
                {settingsTab === 'css' && <CSSManagerViewModern showToast={showToast} />}
              </div>
            </div>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
