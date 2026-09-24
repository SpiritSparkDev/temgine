// components/CookieConsentView.js
import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Cookie, RefreshCw, Plus, Trash2, Edit2, X } from '../lib/muiIcons';

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
    <div className="cookie-consent-view">
      <div className="users-header">
        <h2><Cookie size={20} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} /> Cookies</h2>
      </div>

      <div className="tabs-container">
        <button className={activeTab === 'services' ? 'tab-active' : 'tab-inactive'} onClick={() => setActiveTab('services')}>
          Erkannte Dienste
        </button>
        <button className={activeTab === 'banner' ? 'tab-active' : 'tab-inactive'} onClick={() => setActiveTab('banner')}>
          Banner
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'services' && (
          <div>
            <div className="cookie-toolbar">
              <button className="btn-icon-label" onClick={handleScan} disabled={scanning}>
                <RefreshCw size={14} />
                {scanning ? 'Scanne...' : 'Jetzt scannen'}
              </button>
              <button className="btn-icon-label" onClick={() => setEditingService(emptyManualService())}>
                <Plus size={14} /> Dienst manuell hinzufügen
              </button>
            </div>

            <p className="cookie-hint-text">
              Hinweis: Die Kategorie hier dient der Cookie-Erklärung im Banner. Für das tatsächliche Blockieren
              externer Skripte die Kategorie im <strong>JS-Manager</strong> zuweisen; eingebettete Inhalte
              (YouTube, Google Maps, …) verwenden immer die eingebaute Kategorie.
            </p>

            <div className="users-table-wrapper">
              <table className="users-table cookie-services-table">
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
                          <select
                            className="blog-form-select"
                            value={service.category}
                            onChange={e => handleCategoryChange(service.id, e.target.value)}
                          >
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
                          <div className="cookie-row-actions">
                            <button className="icon-btn-small" onClick={() => setEditingService(service)} title="Bearbeiten"><Edit2 size={14} /></button>
                            <button className="icon-btn-small delete" onClick={() => handleDeleteService(service.id)} title="Löschen"><Trash2 size={14} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
            <div className="cookie-banner-toolbar">
              {['html', 'css', 'js'].map(field => (
                <button
                  key={field}
                  className={bannerTab === field ? 'tab-active' : 'tab-inactive'}
                  onClick={() => setBannerTab(field)}
                >
                  {field.toUpperCase()}
                </button>
              ))}
              <div className="spacer" />
              <button className="btn-secondary" onClick={() => handleBannerReset(bannerTab)}>Auf Standard zurücksetzen</button>
              <button className="icon-btn" onClick={() => persistBannerField(bannerTab, banner[bannerTab])}>Speichern</button>
            </div>
            <div className="cookie-banner-editor-wrapper">
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
    <div className="blog-modal-overlay" onClick={onCancel}>
      <div className="blog-modal" onClick={e => e.stopPropagation()}>
        <div className="blog-modal__header">
          <div className="blog-modal__header-icon"><Cookie size={18} /></div>
          <h3 className="blog-modal__title">Dienst {service.source === 'manual' ? 'bearbeiten' : 'anpassen'}</h3>
          <button type="button" className="blog-modal__close" onClick={onCancel} title="Schließen"><X size={16} /></button>
        </div>

        <div className="blog-modal__body">
          <div className="blog-form-field">
            <label className="blog-form-label">Name</label>
            <input className="blog-form-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="blog-form-field">
            <label className="blog-form-label">Anbieter</label>
            <input className="blog-form-input" value={draft.provider} onChange={e => setDraft({ ...draft, provider: e.target.value })} />
          </div>
          <div className="blog-form-field">
            <label className="blog-form-label">Kategorie</label>
            <select className="blog-form-select" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>
              <option value="functional">Funktional</option>
              <option value="statistics">Statistik</option>
              <option value="marketing">Marketing</option>
            </select>
          </div>
          <div className="blog-form-field">
            <label className="blog-form-label">Datenschutzlink</label>
            <input className="blog-form-input" value={draft.privacyUrl || ''} onChange={e => setDraft({ ...draft, privacyUrl: e.target.value })} />
          </div>

          <div className="blog-modal__section-head">Cookies</div>
          {draft.cookies.map((c, i) => (
            <div key={i} className="cookie-row">
              <input className="blog-form-input" placeholder="Name" value={c.name} onChange={e => updateCookie(i, 'name', e.target.value)} />
              <input className="blog-form-input" placeholder="Zweck" value={c.purpose} onChange={e => updateCookie(i, 'purpose', e.target.value)} />
              <input className="blog-form-input" placeholder="Laufzeit" value={c.duration} onChange={e => updateCookie(i, 'duration', e.target.value)} />
              <button type="button" className="icon-btn-small delete" onClick={() => removeCookieRow(i)} title="Cookie entfernen"><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className="blog-btn blog-btn--secondary" onClick={addCookieRow}><Plus size={14} /> Cookie hinzufügen</button>
        </div>

        <div className="blog-modal__footer">
          <button className="blog-btn blog-btn--secondary" onClick={onCancel}>Abbrechen</button>
          <button className="blog-btn blog-btn--primary" onClick={() => onSave(draft)}>Speichern</button>
        </div>
      </div>
    </div>
  );
}
