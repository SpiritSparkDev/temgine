import React, { useState, useEffect } from 'react';
import MatomoPanel from './MatomoPanel';

const AUTOSAVE_KEY = 'temphelix_autosave_enabled';
const TAB_KEY = 'temgine_settings_tab';
const DEFAULT_LOGO = '/assets/light.png';

const TABS = [
  { id: 'general', label: 'Allgemein' },
  { id: 'seo', label: 'SEO' },
  { id: 'stats', label: 'Statistik' },
  { id: 'live', label: 'Live & Wartung' },
];

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`st-toggle${checked ? ' is-on' : ''}`}
    >
      <span />
    </button>
  );
}

// Karte mit Titel/Beschreibung; Inhalt sind Zeilen (Row) oder freie Elemente
function Card({ title, description, children, footer }) {
  return (
    <section className="st-card">
      <header className="st-card-head">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      <div className="st-card-body">{children}</div>
      {footer && <footer className="st-card-foot">{footer}</footer>}
    </section>
  );
}

// Zeile: links Label + Hilfetext, rechts das Bedienelement
function Row({ label, hint, children, stacked }) {
  return (
    <div className={`st-row${stacked ? ' is-stacked' : ''}`}>
      <div className="st-row-label">
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </div>
      <div className="st-row-control">{children}</div>
    </div>
  );
}

function SaveButton({ onClick, saving, children = 'Speichern' }) {
  return (
    <button type="button" className="st-btn st-btn-primary" onClick={onClick} disabled={saving}>
      {saving ? 'Speichern…' : children}
    </button>
  );
}

export default function SettingsView({ showToast }) {
  const [tab, setTab] = useState('general');
  // Alle einfachen Text-/Zahl-Einstellungen: { settingKey: value }
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState('');
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [folderDragDropEnabled, setFolderDragDropEnabled] = useState(false);
  const [seoIndexingEnabled, setSeoIndexingEnabled] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // --- Live-Render ---
  const [liveRenderMode, setLiveRenderMode] = useState('dynamic');
  const [isSavingLiveMode, setIsSavingLiveMode] = useState(false);
  const [isRenderingLive, setIsRenderingLive] = useState(false);
  const [live, setLive] = useState({ status: '', at: '', duration: '', routes: '', error: '' });

  const val = (key, fallback = '') => (values[key] !== undefined ? values[key] : fallback);
  const setVal = (key) => (e) => setValues((prev) => ({ ...prev, [key]: e.target.value }));

  useEffect(() => {
    const stored = localStorage.getItem(AUTOSAVE_KEY);
    if (stored !== null) setAutosaveEnabled(stored !== 'false');
    try {
      const t = localStorage.getItem(TAB_KEY);
      if (TABS.some((x) => x.id === t)) setTab(t);
    } catch (_e) { /* storage nicht verfügbar */ }
  }, []);

  const selectTab = (id) => {
    setTab(id);
    try { localStorage.setItem(TAB_KEY, id); } catch (_e) { /* ignorieren */ }
  };

  const applyLive = (data) => setLive({
    status: data.liveRenderLastStatus || '',
    at: data.liveRenderLastAt || '',
    duration: data.liveRenderLastDurationMs || '',
    routes: data.liveRenderLastRoutes || '',
    error: data.liveRenderLastError || '',
  });

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setValues(data);
        if (data.folderDragDropEnabled !== undefined) setFolderDragDropEnabled(data.folderDragDropEnabled === 'true');
        if (data.seo_indexing_enabled !== undefined) setSeoIndexingEnabled(data.seo_indexing_enabled !== 'false');
        if (data.liveRenderMode) setLiveRenderMode(data.liveRenderMode);
        applyLive(data);
      })
      .catch(() => {});
  }, []);

  const putSetting = async (key, value) => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: String(value ?? '') }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Fehler beim Speichern');
    }
  };

  // Speichert mehrere Einstellungen nacheinander; `entries` = [[key, value], ...]
  const saveEntries = async (name, entries, message) => {
    setSaving(name);
    try {
      for (const [key, value] of entries) await putSetting(key, value);
      showToast(message, 'success');
      return true;
    } catch (e) {
      showToast(e.message || 'Fehler beim Speichern', 'error');
      return false;
    } finally {
      setSaving('');
    }
  };

  const saveKeys = (name, keys, message, extra = []) =>
    saveEntries(name, [...keys.map((k) => [k, val(k)]), ...extra], message);

  const handleAutosaveToggle = (enabled) => {
    setAutosaveEnabled(enabled);
    localStorage.setItem(AUTOSAVE_KEY, String(enabled));
    showToast(enabled ? 'Autospeichern aktiviert' : 'Autospeichern deaktiviert', 'success');
  };

  const handleFolderDragDrop = async (enabled) => {
    setSaving('dragdrop');
    try {
      await putSetting('folderDragDropEnabled', enabled);
      setFolderDragDropEnabled(enabled);
      showToast(enabled ? 'Drag-and-Drop für Ordner aktiviert' : 'Drag-and-Drop für Ordner deaktiviert', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving('');
    }
  };

  const handleSaveRetention = () => {
    const n = parseInt(val('revisionRetentionDays', '7'), 10);
    if (isNaN(n) || n < 0) {
      showToast('Bitte eine gültige Anzahl Tage eingeben (≥ 0)', 'error');
      return;
    }
    saveEntries('retention', [['revisionRetentionDays', n]], 'Einstellung gespeichert');
  };

  // --- Admin-Logo ---
  const announceLogoChange = () => window.dispatchEvent(new Event('admin-logo-changed'));

  const saveLogo = async (url, message) => {
    setValues((prev) => ({ ...prev, admin_logo_url: url }));
    if (await saveEntries('logo', [['admin_logo_url', url]], message)) announceLogoChange();
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Bitte eine Bilddatei wählen', 'error');
      return;
    }
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/files', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      const url = data.file?.url || data.files?.[0]?.url;
      if (!res.ok || !url) throw new Error(data.error || 'Upload fehlgeschlagen');
      await saveLogo(url, 'Logo hochgeladen und gespeichert');
    } catch (err) {
      showToast(err.message || 'Upload fehlgeschlagen', 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  // --- Live-Render ---
  const reloadLive = async () => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const data = await res.json();
      if (data.liveRenderMode) setLiveRenderMode(data.liveRenderMode);
      applyLive(data);
    } catch (_e) { /* ignorieren */ }
  };

  const handleSaveLiveMode = async (nextMode) => {
    setIsSavingLiveMode(true);
    try {
      await putSetting('liveRenderMode', nextMode);
      setLiveRenderMode(nextMode);
      showToast(`Live-Modus gespeichert: ${nextMode === 'static' ? 'Statisch' : 'Dynamisch'}`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setIsSavingLiveMode(false);
    }
  };

  const handleRenderLiveNow = async () => {
    setIsRenderingLive(true);
    setLive((prev) => ({ ...prev, status: 'running', error: '' }));
    try {
      const res = await fetch('/api/admin/render-live', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Render fehlgeschlagen');
      showToast(`Live erfolgreich gerendert (${data.renderedRoutes || 0} Seiten)`, 'success');
      await reloadLive();
    } catch (e) {
      setLive((prev) => ({ ...prev, status: 'error', error: e.message || 'Render fehlgeschlagen' }));
      showToast(e.message || 'Render fehlgeschlagen', 'error');
    } finally {
      setIsRenderingLive(false);
    }
  };

  const logoUrl = val('admin_logo_url');

  return (
    <div className="admin-editor-area st-page">
      <div className="st-header">
        <h2>Einstellungen</h2>
        <nav className="st-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`st-tab${tab === t.id ? ' is-active' : ''}`} onClick={() => selectTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="st-content">
        {tab === 'general' && (
          <>
            <Card title="Erscheinungsbild" description="Das Logo oben links im Admin-Bereich. Ohne eigene Angabe wird das Temgine-Logo verwendet.">
              <Row label="Aktuelles Logo" hint="Vorschau auf der Admin-Navigationsleiste">
                <div className="st-logo-preview">
                  <img src={logoUrl || DEFAULT_LOGO} alt="Admin-Logo" onError={(e) => { e.currentTarget.style.opacity = 0.3; }} onLoad={(e) => { e.currentTarget.style.opacity = 1; }} />
                </div>
              </Row>
              <Row label="Logo hochladen" hint="PNG, SVG, JPG oder WebP, max. 10 MB">
                <label className={`st-btn${uploadingLogo ? ' is-disabled' : ''}`}>
                  {uploadingLogo ? 'Lade hoch…' : 'Datei wählen…'}
                  <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} hidden />
                </label>
              </Row>
              <Row label="oder Logo-URL" hint="Absoluter Link oder Pfad, z. B. /uploads/logo.png" stacked>
                <div className="st-inline">
                  <input type="text" className="st-input" value={logoUrl} onChange={setVal('admin_logo_url')} placeholder="https://example.com/logo.png" />
                  <SaveButton onClick={() => saveLogo(logoUrl.trim(), 'Logo gespeichert')} saving={saving === 'logo'} />
                  <button type="button" className="st-btn" onClick={() => saveLogo('', 'Standard-Logo wiederhergestellt')} disabled={!logoUrl || saving === 'logo'}>
                    Zurücksetzen
                  </button>
                </div>
              </Row>
            </Card>

            <Card title="Editor &amp; Dateien">
              <Row label="Autospeichern" hint="Änderungen werden automatisch nach 1,2 Sekunden gespeichert.">
                <Toggle checked={autosaveEnabled} onChange={handleAutosaveToggle} label="Autospeichern ein-/ausschalten" />
              </Row>
              <Row label="Ordner per Drag-and-Drop" hint="Standardmäßig deaktiviert. Fehleranfällig, kann je nach Browser oder Dateistruktur unzuverlässig sein.">
                <Toggle checked={folderDragDropEnabled} onChange={handleFolderDragDrop} disabled={saving === 'dragdrop'} label="Ordner per Drag-and-Drop ein-/ausschalten" />
              </Row>
            </Card>

            <Card
              title="Versionierung"
              description="Wie lange alte Seitenversionen gespeichert bleiben. Ältere Versionen werden beim nächsten Speichern gelöscht. 0 = keine Aufbewahrung. Standard: 7 Tage; auch durch Wiederherstellung entstandene Versionen unterliegen der Frist."
            >
              <Row label="Aufbewahrungsdauer (Tage)">
                <div className="st-inline">
                  <input type="number" min="0" className="st-input st-input-narrow" value={val('revisionRetentionDays', '7')} onChange={setVal('revisionRetentionDays')} />
                  <SaveButton onClick={handleSaveRetention} saving={saving === 'retention'} />
                </div>
              </Row>
            </Card>
          </>
        )}

        {tab === 'seo' && (
          <>
            <Card
              title="Link-Vorschau"
              description="Standardwerte für jede Seite ohne eigenes Meta-Bild bzw. eigene Beschreibung (z. B. Startseite oder 404). So sieht jeder geteilte Link plausibel aus."
              footer={<SaveButton onClick={() => saveKeys('seoDefaults', ['seo_site_name', 'seo_default_description', 'seo_default_og_image', 'seo_twitter_handle'], 'SEO-Standardwerte gespeichert')} saving={saving === 'seoDefaults'} />}
            >
              <Row label="Website-Name" stacked>
                <input type="text" className="st-input" value={val('seo_site_name')} onChange={setVal('seo_site_name')} placeholder="z. B. Meine Firma GmbH" />
              </Row>
              <Row label="Standard Meta-Beschreibung" stacked>
                <textarea className="st-input" rows={2} value={val('seo_default_description')} onChange={setVal('seo_default_description')} placeholder="Kurzbeschreibung, die verwendet wird, wenn eine Seite keine eigene hat" />
              </Row>
              <Row label="Standard-Vorschaubild (Open Graph)" hint="Empfohlen: 1200×630 px (1,91:1), damit es auf Facebook, LinkedIn & Co. nicht zugeschnitten wird." stacked>
                <input type="url" className="st-input" value={val('seo_default_og_image')} onChange={setVal('seo_default_og_image')} placeholder="https://example.com/vorschaubild.jpg" />
              </Row>
              <Row label="X (Twitter) Handle" stacked>
                <input type="text" className="st-input" value={val('seo_twitter_handle')} onChange={setVal('seo_twitter_handle')} placeholder="@firmenname" />
              </Row>
            </Card>

            <Card
              title="Suchmaschinen & Struktur"
              description="Wirkt sich auf alle Seiten aus: Titel-Vorlage, strukturierte Daten (Organization-Schema für Google) und die Sichtbarkeit für Suchmaschinen."
              footer={<SaveButton onClick={() => saveKeys('seoAdvanced', ['seo_title_template', 'seo_organization_name', 'seo_organization_logo', 'seo_google_site_verification', 'seo_bing_site_verification', 'seo_robots_txt_extra_disallow'], 'SEO-Struktureinstellungen gespeichert', [['seo_indexing_enabled', seoIndexingEnabled]])} saving={saving === 'seoAdvanced'} />}
            >
              <Row label="Titel-Vorlage" hint="%s wird durch den Seitentitel ersetzt. Leer: „Seitentitel – Website-Name“." stacked>
                <input type="text" className="st-input" value={val('seo_title_template')} onChange={setVal('seo_title_template')} placeholder="%s – Meine Firma GmbH" />
              </Row>
              <Row label="Organisationsname" hint="Für strukturierte Daten" stacked>
                <input type="text" className="st-input" value={val('seo_organization_name')} onChange={setVal('seo_organization_name')} placeholder="z. B. Meine Firma GmbH" />
              </Row>
              <Row label="Organisations-Logo (URL)" stacked>
                <input type="url" className="st-input" value={val('seo_organization_logo')} onChange={setVal('seo_organization_logo')} placeholder="https://example.com/logo.png" />
              </Row>
              <Row label="Google Search Console" hint="Verifizierungscode (Inhalt des content-Attributs, ohne Meta-Tag)" stacked>
                <input type="text" className="st-input" value={val('seo_google_site_verification')} onChange={setVal('seo_google_site_verification')} />
              </Row>
              <Row label="Bing Webmaster Tools" hint="Verifizierungscode (Inhalt des content-Attributs, ohne Meta-Tag)" stacked>
                <input type="text" className="st-input" value={val('seo_bing_site_verification')} onChange={setVal('seo_bing_site_verification')} />
              </Row>
              <Row label="Zusätzliche robots.txt Disallow-Pfade" hint="Ein Pfad pro Zeile, ergänzt die Standard-Sperrliste (/admin, /api)." stacked>
                <textarea className="st-input" rows={3} value={val('seo_robots_txt_extra_disallow')} onChange={setVal('seo_robots_txt_extra_disallow')} placeholder={'/intern\n/entwuerfe'} />
              </Row>
              <div className={`st-danger${seoIndexingEnabled ? '' : ' is-active'}`}>
                <Toggle checked={!seoIndexingEnabled} onChange={(on) => setSeoIndexingEnabled(!on)} label="Indexierung durch Suchmaschinen global deaktivieren" />
                <div>
                  <strong>Indexierung global deaktivieren</strong>
                  <small>Für Staging/Test: erzwingt <code>noindex, nofollow</code> auf allen Seiten und <code>Disallow: /</code> in der robots.txt, unabhängig von den Seiteneinstellungen.</small>
                </div>
              </div>
            </Card>
          </>
        )}

        {tab === 'stats' && <MatomoPanel showToast={showToast} />}

        {tab === 'live' && (
          <>
            <Card title="Staging / Live-Auslieferung" description="Die Vorschau bleibt dynamisch über die Datenbank. Für eine ausfallsichere Live-Seite kannst du hier einen statischen Snapshot rendern.">
              <Row label="Live-Modus">
                <div className="st-inline">
                  <select className="st-input st-input-narrow" value={liveRenderMode} onChange={(e) => handleSaveLiveMode(e.target.value)} disabled={isSavingLiveMode}>
                    <option value="dynamic">Dynamisch (DB/API)</option>
                    <option value="static">Statisch (Snapshot)</option>
                  </select>
                  <button type="button" className="st-btn st-btn-primary" onClick={handleRenderLiveNow} disabled={isRenderingLive}>
                    {isRenderingLive ? 'Rendere Live…' : 'Live jetzt rendern'}
                  </button>
                </div>
              </Row>
              <dl className="st-facts">
                <div><dt>Status</dt><dd>{live.status || 'n/a'}</dd></div>
                <div><dt>Letzter Render</dt><dd>{live.at || 'n/a'}</dd></div>
                <div><dt>Dauer</dt><dd>{live.duration ? `${live.duration} ms` : 'n/a'}</dd></div>
                <div><dt>Gerenderte Seiten</dt><dd>{live.routes || 'n/a'}</dd></div>
              </dl>
              {live.error && <p className="st-error">Letzter Fehler: {live.error}</p>}
              <small className="st-note">Tipp: Mit <strong>?preview=1</strong> an der Seiten-URL erzwingst du die dynamische Vorschau.</small>
            </Card>

            <Card
              title="Wartung & Reparatur"
              description="Findet und behebt Datenintegritätsprobleme im Seitenbaum (z. B. doppelte Slugs oder IDs), die das Speichern mit „Slug(s) mehrfach vergeben“ blockieren können, auch wenn der Editor selbst nicht mehr speichern kann."
              footer={<a href="/repair" className="st-btn">Reparatur-Werkzeug öffnen</a>}
            />
          </>
        )}
      </div>
    </div>
  );
}
