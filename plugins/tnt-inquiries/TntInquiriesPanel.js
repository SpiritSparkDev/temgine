import React, { useState, useEffect, useCallback } from 'react';

const API = '/api/plugins/tnt-inquiries';
const STATUS = { pending: 'wartet', delivered: 'zugestellt', failed: 'fehlgeschlagen' };
const STATUS_COLOR = { pending: '#b7791f', delivered: '#2f855a', failed: '#c53030' };

async function call(url, method, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('de-DE') : '–');

/**
 * Plugin "Anfrage-Weiterleitung an TNT Manager" (nur Admin). Das Token ist write-only:
 * es wird nur im Eingabefeld gehalten, solange der Admin es tippt, und nach dem Speichern geleert.
 */
export default function TntInquiriesPanel({ showToast }) {
  const [cfg, setCfg] = useState(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [editToken, setEditToken] = useState(false);
  const [token, setToken] = useState('');
  const [maps, setMaps] = useState({}); // formId -> { fields, privacyField }
  const [suggested, setSuggested] = useState({}); // `${formId}:${key}` -> true (nur Vorschlag)
  const [urlError, setUrlError] = useState('');
  const [status, setStatus] = useState('');
  const [outbox, setOutbox] = useState([]);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((d) => {
    setCfg(d);
    setBaseUrl(d.baseUrl || '');
    const m = {};
    const sug = {};
    (d.forms || []).forEach((f) => {
      const fields = {};
      f.fields.forEach((fl) => {
        const saved = f.mapping?.[fl.key];
        if (saved) fields[fl.key] = saved;
        else if (fl.suggested) { fields[fl.key] = fl.suggested; sug[`${f.formId}:${fl.key}`] = true; }
        else fields[fl.key] = '';
      });
      m[f.formId] = { fields, privacyField: f.privacyField || f.suggestedPrivacyField || '' };
    });
    setMaps(m);
    setSuggested(sug);
  }, []);

  const loadOutbox = useCallback(() => {
    fetch(`${API}/outbox?limit=50`).then((r) => r.json()).then((d) => setOutbox(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API}/config`).then((r) => r.json()).then(apply).catch(() => {});
    loadOutbox();
    const t = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) loadOutbox(); }, 30000);
    return () => clearInterval(t);
  }, [apply, loadOutbox]);

  const put = async (body, okMsg) => {
    setBusy(true);
    const { ok, data } = await call(`${API}/config`, 'PUT', body).catch(() => ({ ok: false, data: { error: 'Netzwerkfehler' } }));
    setBusy(false);
    if (!ok) { setStatus(data.error || 'Fehler beim Speichern'); showToast(data.error || 'Fehler beim Speichern', 'error'); return false; }
    apply(data);
    setToken(''); setEditToken(false);
    setStatus(okMsg); showToast(okMsg, 'success');
    return true;
  };

  const save = () => {
    if (!/^https:\/\//i.test(baseUrl.trim())) { setUrlError('Die Basis-URL muss mit https:// beginnen.'); return; }
    setUrlError('');
    const body = { baseUrl: baseUrl.trim(), mappings: maps };
    if (editToken && token) body.token = token;
    put(body, 'Weiterleitung gespeichert');
  };

  const removeToken = () => {
    if (window.confirm('Token wirklich entfernen? Die Weiterleitung wird dadurch nicht mehr funktionieren.')) put({ token: null }, 'Token entfernt');
  };

  const test = async () => {
    setStatus('Teste Verbindung…');
    const { data } = await call(`${API}/test`, 'POST').catch(() => ({ data: { ok: false, status: null, hint: 'Netzwerkfehler' } }));
    setStatus(data.ok ? 'Verbindung OK' : `Fehler${data.status ? ` (Status ${data.status})` : ''}: ${data.hint || ''}`);
  };

  const retry = async (id) => {
    const { ok } = await call(`${API}/outbox/retry`, 'POST', { id }).catch(() => ({ ok: false }));
    showToast(ok ? 'Erneuter Versand angestoßen' : 'Erneut senden fehlgeschlagen', ok ? 'success' : 'error');
    loadOutbox();
  };

  const setField = (formId, key, value) => {
    setMaps((m) => ({ ...m, [formId]: { ...m[formId], fields: { ...m[formId].fields, [key]: value } } }));
    setSuggested((s) => { const n = { ...s }; delete n[`${formId}:${key}`]; return n; });
  };

  if (!cfg) return <section className="st-card"><div className="st-card-body">Lade…</div></section>;

  const groups = [];
  (cfg.targets || []).forEach((t) => {
    let g = groups.find((x) => x.name === t.group);
    if (!g) { g = { name: t.group, items: [] }; groups.push(g); }
    g.items.push(t);
  });
  const reasons = cfg.readyReasons || [];
  
  return (
    <section className="st-card">
      <header className="st-card-head">
        <h3>Anfrage-Weiterleitung an TNT Manager (Plugin)</h3>
        <p>Leitet Formular-Absendungen serverseitig und nur per HTTPS als Anfrage an den TNT Manager weiter.</p>
      </header>
      <div className="st-card-body" style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
        {cfg.alert && (
          <div role="alert" style={{ border: '1px solid #c53030', borderRadius: 6, padding: 10 }}>
            <strong>Token oder HTTPS-Konfiguration prüfen – Absendungen werden gehalten</strong>
            <div><small>Fehlercode {cfg.alert.code}{cfg.alert.since ? `, seit ${fmt(cfg.alert.since)}` : ''}</small></div>
          </div>
        )}

        <div>
          <span style={{ fontWeight: 600, color: cfg.ready ? STATUS_COLOR.delivered : 'inherit' }}>{cfg.ready ? 'Bereit – Weiterleitung arbeitet' : 'Noch nicht bereit'}</span>
          <div id="tnt-ready">
            {!cfg.ready && <small>Die Weiterleitung arbeitet erst, wenn alle Punkte erfüllt sind (Ein- und Ausschalten: Einstellungen → Plugins → Übersicht):</small>}
            {reasons.length > 0 && <ul style={{ margin: '4px 0 0 18px' }}>{reasons.map((r) => <li key={r}><small>{r}</small></li>)}</ul>}
          </div>
        </div>

        <label style={{ display: 'grid', gap: 2 }}>
          <small>Basis-URL (https://…)</small>
          <input className="st-input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://tnt.example.com" autoComplete="off" aria-invalid={!!urlError} />
          {urlError && <small role="alert" style={{ color: '#c53030' }}>{urlError}</small>}
        </label>

        <div style={{ display: 'grid', gap: 4 }}>
          <small>Token</small>
          {!editToken ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>{cfg.tokenSet ? `•••• ${cfg.tokenHint || 'gesetzt'}` : 'nicht gesetzt'}</span>
              <button type="button" className="st-btn" aria-label="Token ändern" onClick={() => setEditToken(true)}>Token ändern</button>
              {cfg.tokenSet && <button type="button" className="st-btn" aria-label="Token entfernen" onClick={removeToken}>Token entfernen</button>}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="password" className="st-input" aria-label="Neues Token" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
              <button type="button" className="st-btn" aria-label="Token-Änderung abbrechen" onClick={() => { setEditToken(false); setToken(''); }}>Abbrechen</button>
            </div>
          )}
        </div>

        {(cfg.forms || []).map((f) => (
          <fieldset key={f.formId} style={{ border: '1px solid var(--border-color)', borderRadius: 6, padding: 12 }}>
            <legend>{f.label}</legend>
            <table style={{ width: '100%' }}>
              <thead><tr><th align="left">Formularfeld</th><th align="left">Zielfeld</th></tr></thead>
              <tbody>
                {f.fields.map((fl) => {
                  const id = `tnt-${f.formId}-${fl.key}`;
                  return (
                    <tr key={fl.key}>
                      <td><label htmlFor={id}>{fl.label}</label></td>
                      <td>
                        <select id={id} className="st-input" value={maps[f.formId]?.fields[fl.key] || ''} onChange={(e) => setField(f.formId, fl.key, e.target.value)}>
                          <option value="">nicht übertragen</option>
                          {groups.map((g) => (
                            <optgroup key={g.name} label={g.name}>{g.items.map((t) => <option key={t.path} value={t.path}>{t.label}</option>)}</optgroup>
                          ))}
                        </select>
                        {suggested[`${f.formId}:${fl.key}`] && <small> Vorschlag – erst nach Speichern aktiv</small>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <label style={{ display: 'grid', gap: 2, marginTop: 8 }}>
              <small>Datenschutz-Checkbox</small>
              <select className="st-input" aria-label={`Datenschutz-Checkbox ${f.label}`} value={maps[f.formId]?.privacyField || ''}
                onChange={(e) => setMaps((m) => ({ ...m, [f.formId]: { ...m[f.formId], privacyField: e.target.value } }))}>
                <option value="">– bitte wählen –</option>
                {f.fields.map((fl) => <option key={fl.key} value={fl.key}>{fl.label}</option>)}
              </select>
              <small>Pflicht: Ohne Datenschutz-Checkbox ist keine Aktivierung möglich.</small>
            </label>
          </fieldset>
        ))}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="st-btn st-btn-primary" aria-label="Speichern" onClick={save} disabled={busy}>Speichern</button>
          <button type="button" className="st-btn" aria-label="Verbindung testen" onClick={test}>Verbindung testen</button>
        </div>
        <div aria-live="polite">{status && <small>{status}</small>}</div>

        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <h4 style={{ margin: 0 }}>Letzte Absendungen</h4>
            <button type="button" className="st-btn" aria-label="Aktualisieren" onClick={loadOutbox}>Aktualisieren</button>
          </div>
          <table style={{ width: '100%', marginTop: 8 }}>
            <thead>
              <tr><th align="left">Zeit</th><th align="left">Formular</th><th align="left">Status</th><th align="left">Versuche</th><th align="left">Nächster Versuch</th><th align="left">Statuscode</th><th /></tr>
            </thead>
            <tbody>
              {outbox.map((o) => (
                <tr key={o.id}>
                  <td>{fmt(o.createdAt)}</td>
                  <td>{o.formId}</td>
                  <td><span style={{ color: STATUS_COLOR[o.status] }}>{STATUS[o.status] || o.status}</span></td>
                  <td>{o.attempts}</td>
                  <td>{o.status === 'pending' ? fmt(o.nextAttemptAt) : '–'}</td>
                  <td>{o.lastStatusCode ?? '–'}</td>
                  <td>{o.status === 'failed' && <button type="button" className="st-btn" aria-label="Erneut senden" onClick={() => retry(o.id)}>Erneut senden</button>}</td>
                </tr>
              ))}
              {outbox.length === 0 && <tr><td colSpan={7}><small>Keine Absendungen.</small></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
