import React, { useState, useEffect } from 'react';

// [key, Label, Typ, Platzhalter] — Typ: text | password | textarea | checkbox
const FIELDS = {
  sftp: [
    ['host', 'Host', 'text', 'sftp.example.com'], ['port', 'Port', 'text', '22'],
    ['username', 'Benutzer', 'text'], ['password', 'Passwort', 'password'],
    ['privateKey', 'Privater Schlüssel (optional)', 'textarea'], ['basePath', 'Startordner', 'text', '/'],
  ],
  nextcloud: [
    ['url', 'Nextcloud-URL', 'text', 'https://cloud.example.com'], ['username', 'Benutzer', 'text'],
    ['password', 'App-Passwort', 'password'], ['basePath', 'Startordner', 'text', 'Fotos'],
  ],
  s3: [
    ['endpoint', 'Endpoint (leer = AWS)', 'text', 'https://s3.example.com'], ['region', 'Region', 'text', 'eu-central-1'],
    ['bucket', 'Bucket', 'text'], ['accessKeyId', 'Access Key ID', 'text'],
    ['secretAccessKey', 'Secret Access Key', 'password'], ['basePath', 'Präfix / Startordner', 'text'],
  ],
};
const SECRETS = { sftp: ['password', 'privateKey'], nextcloud: ['password'], s3: ['secretAccessKey'] };
const TYPE_LABEL = { sftp: 'SFTP', nextcloud: 'Nextcloud', s3: 'S3' };

async function api(body, method = 'POST') {
  const res = await fetch('/api/external-sources', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

/**
 * Add-on "Externe Quellen" (SFTP / Nextcloud / S3): Schalter + Verwaltung der Quellen.
 * Der Import selbst läuft im Dateimanager (ExternalImportModal). Geheimnisse sind write-only.
 */
export default function ExternalSourcesPanel({ showToast }) {
  const [enabled, setEnabled] = useState(false);
  const [sources, setSources] = useState([]);
  const [tests, setTests] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/external-sources').then((r) => r.json()).then((d) => {
      setEnabled(!!d.enabled);
      setSources(d.sources || []);
    }).catch(() => {});
  }, []);

  const toggle = async (on) => {
    const res = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'external_sources_enabled', value: String(on) }),
    });
    if (res.ok) setEnabled(on); else showToast('Fehler beim Speichern', 'error');
  };

  const update = (i, patch) => setSources((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const updateCfg = (i, k, v) => setSources((s) => s.map((x, j) => (j === i ? { ...x, config: { ...x.config, [k]: v } } : x)));
  const add = (type) => setSources((s) => [...s, { id: undefined, type, name: TYPE_LABEL[type], config: {} }]);

  const save = async () => {
    setSaving(true);
    const d = await api({ sources }, 'PUT').catch(() => ({ error: 'Netzwerkfehler' }));
    setSaving(false);
    if (d.error) return showToast(d.error, 'error');
    setSources(d.sources);
    showToast('Externe Quellen gespeichert', 'success');
  };

  const test = async (i) => {
    setTests((t) => ({ ...t, [i]: '…' }));
    const d = await api({ action: 'test', source: sources[i] }).catch((e) => ({ ok: false, error: e.message }));
    setTests((t) => ({ ...t, [i]: d.ok ? `✓ Verbunden — ${d.count} Einträge im Startordner` : `⚠ ${d.error}` }));
  };

  return (
    <section className="st-card">
      <header className="st-card-head">
        <h3>Externe Quellen (Add-on)</h3>
        <p>Importiert Bilder, Dateien und ganze Ordner von SFTP, Nextcloud oder S3 in die Mediathek. Der Import startet im Dateimanager über „Von externer Quelle“.</p>
      </header>
      <div className="st-card-body">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} />
          <strong>Add-on aktivieren</strong>
        </label>

        {enabled && (
          <>
            {sources.map((s, i) => (
              <div key={s.id || i} style={{ border: '1px solid var(--border-color)', borderRadius: 6, padding: 12, marginBottom: 12, display: 'grid', gap: 8, maxWidth: 560 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="st-input" value={s.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Name" />
                  <span style={{ alignSelf: 'center', whiteSpace: 'nowrap' }}>{TYPE_LABEL[s.type]}</span>
                </div>
                {FIELDS[s.type].map(([k, label, type, ph]) => {
                  const isSet = s.config[`${k}_set`];
                  const common = {
                    className: 'st-input', value: s.config[k] || '', placeholder: isSet ? '•••• (gesetzt — leer lassen zum Behalten)' : ph,
                    onChange: (e) => updateCfg(i, k, e.target.value), autoComplete: 'off',
                  };
                  return (
                    <label key={k} style={{ display: 'grid', gap: 2 }}>
                      <small>{label}</small>
                      {type === 'textarea' ? <textarea rows={3} {...common} /> : <input type={type} {...common} />}
                    </label>
                  );
                })}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="st-btn" onClick={() => test(i)}>Verbindung testen</button>
                  <button type="button" className="st-btn" onClick={() => setSources((x) => x.filter((_, j) => j !== i))}>Entfernen</button>
                  {tests[i] && <small>{tests[i]}</small>}
                </div>
                {!s.id && <small>Zum Testen mit Geheimnissen: erst Eingeben, dann testen; zum Behalten speichern.</small>}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.keys(FIELDS).map((t) => <button key={t} type="button" className="st-btn" onClick={() => add(t)}>+ {TYPE_LABEL[t]}</button>)}
              <button type="button" className="st-btn st-btn-primary" onClick={save} disabled={saving}>{saving ? 'Speichern…' : 'Quellen speichern'}</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
