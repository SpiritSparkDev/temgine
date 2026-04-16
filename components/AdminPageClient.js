import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import { LogOut, Moon, Sun, LayoutDashboard, FileText, Layout, Code, Users, Settings, Menu, FolderOpen, Box, HardDrive, Upload, FlaskConical, Compass } from 'lucide-react';
import DashboardView from './DashboardView';
import TemplatesViewModern from './TemplatesViewModern';
import PagesView from './PagesView';
import SettingsView from './SettingsView';
import UsersViewModern from './UsersViewModern';
import UserInvitationsView from './UserInvitationsView';
import CSSManagerViewModern from './CSSManagerViewModern';
import FileManagerView from './FileManagerView';
import BackupView from './BackupView';
import Toast from './Toast';
import ConfirmDialog from './ConfirmDialog';
import ContentModelsView from './ContentModelsView';
import ImporterView from './ImporterView';
import ErrorBoundary from './ErrorBoundary';
import NavigationView from './NavigationView';

export default function AdminPageClient() {
  const showDevHints = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
  const devTitle = (text) => (showDevHints ? text : undefined);
  const { data: session } = useSession();
  const [templateList, setTemplateList] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [templateCode, setTemplateCode] = useState('<section class="my-section">\n  <div class="container">\n    <h1>{{title}}</h1>\n    <p>{{text}}</p>\n  </div>\n</section>');
  const [pages, setPages] = useState([]);
  const [editingPage, setEditingPage] = useState(null);
  const [view, setView] = useState('dashboard');
  const [builderTab, setBuilderTab] = useState('templates');
  const [builderSearch, setBuilderSearch] = useState('');
  const [settingsTab, setSettingsTab] = useState('database');
  const [showBuilderQuickSwitch, setShowBuilderQuickSwitch] = useState(false);
  const [alphaTab, setAlphaTab] = useState('content-models');

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
      const legacyBuilderMap = {
        templates: 'templates',
        'content-models': 'content-models'
      };
      const allowed = ['dashboard','pages','builder','files','css','navigation','users','settings','backup','alpha'];

      if (saved && legacyBuilderMap[saved]) {
        setBuilderTab(legacyBuilderMap[saved]);
        setView('builder');
      } else if (saved && allowed.includes(saved)) {
        setView(saved);
      }
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
        setShowBuilderQuickSwitch(false);
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleSelectView = (nextView) => {
    setView(nextView);
    setMobileNavOpen(false);
  };

  useEffect(() => {
    const legacyBuilderMap = {
      templates: 'templates',
      'content-models': 'content-models'
    };

    if (legacyBuilderMap[view]) {
      setBuilderTab(legacyBuilderMap[view]);
      setView('builder');
    }
  }, [view]);

  const openBuilderTab = (tab) => {
    setBuilderTab(tab);
    setView('builder');
    setMobileNavOpen(false);
    setShowBuilderQuickSwitch(false);
    setBuilderSearch('');
  };

  const builderModules = [
    {
      id: 'templates',
      label: 'Templates',
      description: 'Block-Templates pflegen',
      icon: Layout,
      count: templateList.length
    },
    {
      id: 'content-models',
      label: 'Content Models',
      description: 'Datenstrukturen fuer Inhalte definieren (Alpha)',
      icon: Box,
      count: 'Alpha'
    },
    {
      id: 'importer',
      label: 'Inhalts-Importer',
      description: 'HTML zu Seite & Templates importieren (Alpha)',
      icon: Upload,
      count: 'Alpha'
    },
  ];

  const filteredBuilderModules = builderModules.filter((module) => {
    const q = builderSearch.trim().toLowerCase();
    if (!q) return true;
    return module.label.toLowerCase().includes(q) || module.description.toLowerCase().includes(q);
  });

  useEffect(() => {
    const onKeyDown = (event) => {
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (!isCmdK) return;
      if (view !== 'builder') return;
      event.preventDefault();
      setShowBuilderQuickSwitch((prev) => !prev);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  // Wrapper für BackupView die Objekt-Format akzeptiert
  const showToastForBackup = (opts) => {
    if (typeof opts === 'object' && opts.message) {
      setToast({ message: opts.message, type: opts.type || 'success' });
    } else if (typeof opts === 'string') {
      setToast({ message: opts, type: 'success' });
    }
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

  // Wrapper für BackupView die Objekt-Format akzeptiert
  const showConfirmForBackup = (opts) => {
    if (typeof opts === 'object') {
      setConfirmDialog({
        title: opts.title || 'Bestätigung',
        message: opts.message || '',
        onConfirm: async () => {
          setConfirmDialog(null);
          if (opts.onConfirm) {
            try {
              await opts.onConfirm();
            } catch (e) {
              console.error('Confirm action failed:', e);
            }
          }
        },
        onCancel: () => {
          setConfirmDialog(null);
        }
      });
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      setDarkMode(saved === 'true');
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', newMode.toString());
  };

  async function refreshTemplateList() {
    try {
      const tRes = await fetch('/api/templates');
      if (!tRes.ok) throw new Error(`API error: ${tRes.status}`);
      const t = await tRes.json();
      let list = Array.isArray(t) ? t : [];
      if (list.length > 0 && typeof list[0] === 'string') {
        list = list.map(n => ({ name: n, type: 'BLOCK' }));
      }
      setTemplateList(list);
    } catch (e) {
      console.error('[admin] Error loading templates:', e);
    }
  }

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const warnings = [];

      try {
        await refreshTemplateList();
      } catch (e) {
        warnings.push('Templates konnten nicht geladen werden.');
        if (isMounted) setTemplateList([]);
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
      // Reload from API to confirm server state (fixes delete reappearance + order persistence)
      await loadPagesFromApi();
      return true;
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      showToast('Fehler beim Speichern der Seite!', 'error');
      return false;
    }
  }

  // Reload pages from API and update local state. Returns the fresh list.
  async function loadPagesFromApi() {
    try {
      const res = await fetch('/api/pages?includeDrafts=true');
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.pages || []);
      setPages(list);
      return list;
    } catch (e) {
      console.error('[admin] loadPagesFromApi failed:', e);
      return pages;
    }
  }

  // Called by ImporterView when a new page has been successfully created.
  // Refreshes the pages list and navigates to the PageEditor for the new page.
  async function handlePageCreated(slug) {
    const freshPages = await loadPagesFromApi();
    // Find the newly created page in the fresh list (top-level)
    const newPage = (freshPages || []).find(p => String(p.slug) === String(slug));
    handleSelectView('pages');
    if (newPage) {
      setEditingPage(newPage);
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
      <div className={`admin-scope${darkMode ? ' dark-mode' : ''}`}>
      <Head>
        <title>Temgine CMS Admin</title>
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
          <a href="/" className="admin-logo-link" title="Temgine CMS">
            <img style={{ marginRight: '10px' }} src="/assets/light.png" alt="Temgine CMS" className="admin-logo-img" /> <h1 className='admin-logo'>Admin Bereich</h1>
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
              <li><button className={`menu-item ${view==='builder'?'active':''}`} onClick={() => handleSelectView('builder')}><Layout size={18} /> Templates</button></li>
              <li><button className={`menu-item ${view==='files'?'active':''}`} onClick={() => handleSelectView('files')}><FolderOpen size={18} /> Dateien</button></li>
              <li><button className={`menu-item ${view==='css'?'active':''}`} onClick={() => handleSelectView('css')}><Code size={18} /> CSS</button></li>
              <li><button className={`menu-item ${view==='navigation'?'active':''}`} onClick={() => handleSelectView('navigation')}><Compass size={18} /> Navigation</button></li>
              <li><button className={`menu-item ${view==='users'?'active':''}`} onClick={() => handleSelectView('users')}><Users size={18} /> Benutzer</button></li>
              <li><button className={`menu-item ${view==='settings'?'active':''}`} onClick={() => handleSelectView('settings')}><Settings size={18} /> Settings</button></li>
              <li><button className={`menu-item ${view==='backup'?'active':''}`} onClick={() => handleSelectView('backup')}><HardDrive size={18} /> Backup</button></li>
              <li><button className={`menu-item ${view==='alpha'?'active':''}`} onClick={() => handleSelectView('alpha')}><FlaskConical size={18} /> Alpha</button></li>
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
          {view === 'builder' && (
            <div className="builder-shell">

              <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                {builderTab === 'templates' && <TemplatesViewModern showToast={showToast} onSaved={refreshTemplateList} />}
                {builderTab === 'content-models' && <ContentModelsView />}
                {builderTab === 'importer' && <ImporterView showToast={showToast} onPageCreated={handlePageCreated} />}
              </div>

              {showBuilderQuickSwitch && (
                <div className="builder-quick-switch-overlay" onClick={() => setShowBuilderQuickSwitch(false)}>
                  <div className="builder-quick-switch-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="builder-quick-switch-head">
                      <div>
                        <h3>Modul wechseln</h3>
                        {showDevHints && <p className="editor-role-hint">Bereich: Schneller Wechsel zwischen den Builder-Modulen</p>}
                      </div>
                      <button type="button" className="builder-quick-close" onClick={() => setShowBuilderQuickSwitch(false)} title={devTitle('Schnellwechsel schliessen')} aria-label="Schnellwechsel schliessen">Schliessen</button>
                    </div>
                    <input
                      autoFocus
                      type="text"
                      className="builder-quick-search"
                      placeholder="Templates, Content Models..."
                      value={builderSearch}
                      onChange={(e) => setBuilderSearch(e.target.value)}
                      title={devTitle('Suche nach einem Builder-Modul')}
                      aria-label="Builder-Modul suchen"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && filteredBuilderModules.length > 0) {
                          openBuilderTab(filteredBuilderModules[0].id);
                        }
                      }}
                    />
                    <div className="builder-quick-results">
                      {filteredBuilderModules.length === 0 ? (
                        <div className="builder-quick-empty">Keine Treffer</div>
                      ) : (
                        filteredBuilderModules.map((module) => {
                          const Icon = module.icon;
                          return (
                            <button key={module.id} type="button" className="builder-quick-item" onClick={() => openBuilderTab(module.id)} title={devTitle(`Modul ${module.label} oeffnen: ${module.description}`)} aria-label={`Modul ${module.label} oeffnen`}>
                              <Icon size={14} />
                              <span>{module.label}</span>
                              <small>{module.description}</small>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {view === 'pages' && (
            <PagesView
              pages={pages}
              templateList={templateList}
              editingPage={editingPage}
              setEditingPage={setEditingPage}
              handleUpdatePages={handleUpdatePages}
            />
          )}
          {view === 'dashboard' && (
            <DashboardView
              templateList={templateList}
              pages={pages}
              setView={setView}
              showToast={showToast}
            />
          )}
          {view === 'files' && <FileManagerView showToast={showToast} />}
          {view === 'css' && <CSSManagerViewModern showToast={showToast} />}
          {view === 'navigation' && <NavigationView showToast={showToast} />}
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
          {view === 'backup' && (
            <ErrorBoundary>
              <BackupView onToast={showToastForBackup} onConfirm={showConfirmForBackup} />
            </ErrorBoundary>
          )}
          {view === 'alpha' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="settings-tabs-wrapper">
                <div className="settings-tabs">
                  <button
                    onClick={() => setAlphaTab('content-models')}
                    className={`settings-tab-btn ${alphaTab === 'content-models' ? 'active' : ''}`}
                  >
                    Content Models
                  </button>
                  <button
                    onClick={() => setAlphaTab('importer')}
                    className={`settings-tab-btn ${alphaTab === 'importer' ? 'active' : ''}`}
                  >
                    Importer
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                {alphaTab === 'content-models' && <ContentModelsView />}
                {alphaTab === 'importer' && <ImporterView showToast={showToast} onPageCreated={handlePageCreated} />}
              </div>
            </div>
          )}
        </main>
      </div>
      </div>
    </ErrorBoundary>
  );
}
