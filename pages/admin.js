import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import { LogOut, Moon, Sun, LayoutDashboard, FileText, Layout, Code, Users, Settings, Menu, FolderOpen } from 'lucide-react';
import DashboardView from '../components/DashboardView';
import TemplatesViewModern from '../components/TemplatesViewModern';
import PagesView from '../components/PagesView';
import SnippetsView from '../components/SnippetsView';
import SettingsView from '../components/SettingsView';
import UsersView from '../components/UsersView';
import UsersViewModern from '../components/UsersViewModern';
import UserInvitationsView from '../components/UserInvitationsView';
import CSSManagerViewModern from '../components/CSSManagerViewModern';
import NavigationViewModern from '../components/NavigationViewModern';
import FileManagerView from '../components/FileManagerView';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import ContentModelsView from '../components/ContentModelsView';
// RightToolbar removed — snippet toolbox moved into TemplatesViewModern

export default function Admin() {
  const { data: session } = useSession();
  const [templateList, setTemplateList] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [templateCode, setTemplateCode] = useState('<section class="my-section">\n  <div class="container">\n    <h1>{{title}}</h1>\n    <p>{{text}}</p>\n  </div>\n</section>');
  const [snippets, setSnippets] = useState([]);
  const [pages, setPages] = useState([]);
  const [editingPage, setEditingPage] = useState(null);
  const [view, setView] = useState('dashboard');
  const [settingsTab, setSettingsTab] = useState('database');

  // Setze richtigen Tab wenn View wechselt
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
  const router = useRouter();

  // Load saved view from localStorage on first mount (keep user on same menu after reload)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('adminView');
      const allowed = ['dashboard','pages','templates','navigation','snippets','files','css','users','settings','content-models'];
      if (saved && allowed.includes(saved)) setView(saved);
    } catch (e) {
      // ignore storage errors
    }
  }, []);

  // Persist current view so reload stays on the same menu
  useEffect(() => {
    try {
      localStorage.setItem('adminView', view);
    } catch (e) {}
  }, [view]);

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

  // Dark Mode initialisieren
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
    (async () => {
      try {
        const t = await fetch('/api/templates').then(r => r.json()).catch(() => []);
        let list = Array.isArray(t) ? t : [];
        if (list.length > 0 && typeof list[0] === 'string') {
          // older format: array of names
          list = list.map(n => ({ name: n, type: 'SITE' }));
        }
        setTemplateList(list);
      } catch (e) { setTemplateList([]); }
      try {
        const s = await fetch('/api/snippets').then(r => r.json()).catch(() => []);
        setSnippets(Array.isArray(s) && s.length > 0 ? s : [
          { label: 'Titel', snippet: '{{title}}' },
          { label: 'Text', snippet: '{{text}}' },
          { label: 'Bild', snippet: '{{images.0}}' }
        ]);
      } catch (e) { setSnippets([]); }
      try {
        // Admin should see drafts as well
        const p = await fetch('/api/pages?includeDrafts=true').then(r => r.json()).catch(() => []);
        setPages(Array.isArray(p) ? p : (p.pages || []));
      } catch (e) { setPages([]); }
    })();
  }, []);

  async function handleUpdatePages(updated) {
    setPages(updated);
    // persist pages to API
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
    <>
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
      <div className="admin-navbar">
        <div className="admin-navbar-left">
          <h1 className="admin-logo">TempHelix</h1>
        </div>
        <div className="admin-navbar-right">
          <button 
            className="admin-theme-toggle" 
            onClick={toggleDarkMode}
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
        <aside className="admin-sidebar">
          <nav className="admin-nav">
            <ul>
              <li><button className={`menu-item ${view==='dashboard'?'active':''}`} onClick={() => setView('dashboard')}><LayoutDashboard size={18} /> Dashboard</button></li>
              <li><button className={`menu-item ${view==='pages'?'active':''}`} onClick={() => setView('pages')}><FileText size={18} /> Pages</button></li>
              <li><button className={`menu-item ${view==='templates'?'active':''}`} onClick={() => setView('templates')}><Layout size={18} /> Templates</button></li>
              <li><button className={`menu-item ${view==='content-models'?'active':''}`} onClick={() => setView('content-models')}><Code size={18} /> Content Models</button></li>
              <li><button className={`menu-item ${view==='navigation'?'active':''}`} onClick={() => setView('navigation')}><Menu size={18} /> Navigation</button></li>
              <li><button className={`menu-item ${view==='snippets'?'active':''}`} onClick={() => setView('snippets')}><Code size={18} /> Snippets</button></li>
              <li><button className={`menu-item ${view==='files'?'active':''}`} onClick={() => setView('files')}><FolderOpen size={18} /> Dateien</button></li>
              <li><button className={`menu-item ${view==='css'?'active':''}`} onClick={() => setView('css')}><Code size={18} /> CSS</button></li>
              <li><button className={`menu-item ${view==='users'?'active':''}`} onClick={() => setView('users')}><Users size={18} /> Benutzer</button></li>
              <li><button className={`menu-item ${view==='settings'?'active':''}`} onClick={() => setView('settings')}><Settings size={18} /> Settings</button></li>
            </ul>
            <div className="menu-sep" />
          </nav>

          {/* Template-Sidebar entfernt - Template-Auswahl jetzt im Hauptbereich */}
        </aside>

        <main className="admin-editor">
          {view === 'dashboard' && <h1>Admin Dashboard</h1>}
          {view === 'pages' && <h1>Seitenmanagement</h1>}
          {view === 'files' && <h1>Dateimanagement</h1>}
          {view === 'users' && <h1>Benutzerverwaltung</h1>}
          {view === 'settings' && <h1>Settings</h1>}

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
          {/* Right toolbar removed — snippets live inside Templates editor now */}
        </main>
      </div>
    </>
  );
}
