// components/CookieConsentView.js
import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Cookie, RefreshCw, Plus, Trash2, Edit2 } from '../lib/muiIcons';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

const CATEGORY_LABELS = {
  necessary: 'Notwendig',
  functional: 'Funktional',
  statistics: 'Statistik',
  marketing: 'Marketing',
};

const emptyManualService = () => ({
  id: `manual-${Date.now()}`,
  name: '',
  provider: '',
  category: 'marketing',
  cookies: [{ name: '', purpose: '', duration: '' }],
  privacyUrl: '',
  source: 'manual',
});

export default function CookieConsentView({ showToast }) {
  const [activeTab, setActiveTab] = useState('services');
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [banner, setBanner] = useState({ html: '', css: '', js: '' });
  const [bannerDefaults, setBannerDefaults] = useState({ html: '', css: '', js: '' });
  const [bannerTab, setBannerTab] = useState('html');

  useEffect(() => { loadData(); }, []);

  function loadData() {
    setLoading(true);
    fetch('/api/cookies')
      .then(r => r.json())
      .then(data => {
        setServices(data.services || []);
        setBanner(data.banner || { html: '', css: '', js: '' });
        setBannerDefaults(data.bannerDefaults || { html: '', css: '', js: '' });
      })
      .catch(() => showToast('Fehler beim Laden', 'error'))
      .finally(() => setLoading(false));
  }

  function persistServices(next) {
    const toSave = next.filter(s => s.category !== 'necessary');
    fetch('/api/cookies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ services: toSave }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setServices(next);
          showToast('Gespeichert', 'success');
        } else {
          showToast(data.error || 'Fehler beim Speichern', 'error');
        }
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'));
  }

  function handleScan() {
    setScanning(true);
    fetch('/api/admin/cookies/scan', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.error) { showToast(data.error, 'error'); return; }
        showToast(`Scan abgeschlossen: ${data.addedCount} neue Dienste gefunden`, 'success');
        loadData();
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'))
      .finally(() => setScanning(false));
  }

  function handleDeleteService(id) {
    persistServices(services.filter(s => s.id !== id));
  }

  function handleCategoryChange(id, category) {
    persistServices(services.map(s => s.id === id ? { ...s, category } : s));
  }

  function handleSaveManualService(service) {
    const exists = services.some(s => s.id === service.id);
    const next = exists ? services.map(s => s.id === service.id ? service : s) : [...services, service];
    persistServices(next);
    setEditingService(null);
  }

  function persistBannerField(field, content) {
    fetch('/api/cookies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ banner: { field, content } }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) showToast('Banner gespeichert', 'success');
        else showToast(data.error || 'Fehler beim Speichern', 'error');
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'));
  }

  function handleBannerChange(field, value) {
    setBanner(prev => ({ ...prev, [field]: value }));
  }

  function handleBannerReset(field) {
    const value = bannerDefaults[field];
    setBanner(prev => ({ ...prev, [field]: value }));
    persistBannerField(field, value);
  }

  if (loading) return <div className="admin-view-loading">Lade Cookie-Einstellungen...</div>;

  return (
    <div className="editor-container">
      <div className="editor-sidebar" style={{ width: 200 }}>
        <div className="editor-header"><h2><Cookie size={18} /> Cookies</h2></div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li><button className={`menu-item ${activeTab === 'services' ? 'active' : ''}`} onClick={() => setActiveTab('services')}>Erkannte Dienste</button></li>
          <li><button className={`menu-item ${activeTab === 'banner' ? 'active' : ''}`} onClick={() => setActiveTab('banner')}>Banner</button></li>
        </ul>
      </div>

      <div className="editor-main" style={{ padding: 20, overflow: 'auto' }}>
        {activeTab === 'services' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <button className="btn-secondary" onClick={handleScan} disabled={scanning}>
                <RefreshCw size={16} style={{ marginRight: 6 }} />
                {scanning ? 'Scanne...' : 'Jetzt scannen'}
              </button>
              <button className="btn-primary" onClick={() => setEditingService(emptyManualService())}>
                <Plus size={16} style={{ marginRight: 6 }} /> Dienst manuell hinzufügen
              </button>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 12 }}>
              Hinweis: Die Kategorie hier dient der Cookie-Erklärung im Banner. Für das tatsächliche Blockieren
              externer Skripte die Kategorie im <strong>JS-Manager</strong> zuweisen; eingebettete Inhalte
              (YouTube, Google Maps, …) verwenden immer die eingebaute Kategorie.
            </p>

            <table className="admin-data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Anbieter</th>
                  <th>Kategorie</th>
                  <th>Cookies</th>
                  <th>Quelle</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {services.map(service => (
                  <tr key={service.id}>
                    <td>{service.name}</td>
                    <td>{service.provider}</td>
                    <td>
                      {service.category === 'necessary' ? (
                        CATEGORY_LABELS.necessary
                      ) : (
                        <select value={service.category} onChange={e => handleCategoryChange(service.id, e.target.value)}>
                          <option value="functional">Funktional</option>
                          <option value="statistics">Statistik</option>
                          <option value="marketing">Marketing</option>
                        </select>
                      )}
                    </td>
                    <td>{(service.cookies || []).map(c => c.name).join(', ')}</td>
                    <td>{service.source === 'manual' ? 'Manuell' : service.source === 'detected' ? 'Erkannt' : '—'}</td>
                    <td>
                      {service.category !== 'necessary' && (
                        <>
                          <button className="icon-btn-small" onClick={() => setEditingService(service)}><Edit2 size={14} /></button>
                          <button className="icon-btn-small delete" onClick={() => handleDeleteService(service.id)}><Trash2 size={14} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {editingService && (
              <ServiceEditModal
                service={editingService}
                onCancel={() => setEditingService(null)}
                onSave={handleSaveManualService}
              />
            )}
          </div>
        )}

        {activeTab === 'banner' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {['html', 'css', 'js'].map(field => (
                <button
                  key={field}
                  className={`btn-secondary ${bannerTab === field ? 'active' : ''}`}
                  onClick={() => setBannerTab(field)}
                >
                  {field.toUpperCase()}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <button className="btn-secondary" onClick={() => handleBannerReset(bannerTab)}>Auf Standard zurücksetzen</button>
              <button className="btn-primary" onClick={() => persistBannerField(bannerTab, banner[bannerTab])}>Speichern</button>
            </div>
            <div style={{ height: 500 }}>
              <CodeEditor
                height="100%"
                language={bannerTab === 'js' ? 'javascript' : bannerTab}
                value={banner[bannerTab]}
                onChange={value => handleBannerChange(bannerTab, value || '')}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceEditModal({ service, onCancel, onSave }) {
  const [draft, setDraft] = useState(service);

  function updateCookie(index, field, value) {
    setDraft(prev => ({ ...prev, cookies: prev.cookies.map((c, i) => i === index ? { ...c, [field]: value } : c) }));
  }

  function addCookieRow() {
    setDraft(prev => ({ ...prev, cookies: [...prev.cookies, { name: '', purpose: '', duration: '' }] }));
  }

  function removeCookieRow(index) {
    setDraft(prev => ({ ...prev, cookies: prev.cookies.filter((_, i) => i !== index) }));
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h3>Dienst {service.source === 'manual' ? 'bearbeiten' : 'anpassen'}</h3>
        <label>Name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>Anbieter<input value={draft.provider} onChange={e => setDraft({ ...draft, provider: e.target.value })} /></label>
        <label>Kategorie
          <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>
            <option value="functional">Funktional</option>
            <option value="statistics">Statistik</option>
            <option value="marketing">Marketing</option>
          </select>
        </label>
        <label>Datenschutzlink<input value={draft.privacyUrl || ''} onChange={e => setDraft({ ...draft, privacyUrl: e.target.value })} /></label>

        <h4>Cookies</h4>
        {draft.cookies.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input placeholder="Name" value={c.name} onChange={e => updateCookie(i, 'name', e.target.value)} />
            <input placeholder="Zweck" value={c.purpose} onChange={e => updateCookie(i, 'purpose', e.target.value)} />
            <input placeholder="Laufzeit" value={c.duration} onChange={e => updateCookie(i, 'duration', e.target.value)} />
            <button type="button" className="icon-btn-small delete" onClick={() => removeCookieRow(i)}><Trash2 size={14} /></button>
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={addCookieRow}><Plus size={14} /> Cookie hinzufügen</button>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn-secondary" onClick={onCancel}>Abbrechen</button>
          <button className="btn-primary" onClick={() => onSave(draft)}>Speichern</button>
        </div>
      </div>
    </div>
  );
}
