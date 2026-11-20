import React, { useState, useEffect, useCallback } from 'react';

const API = '/api/plugins/designer-api/v1';
const box = { border: '1px solid var(--border-color)', borderRadius: '6px', padding: '1rem', marginBottom: '1.25rem' };
const input = { padding: '0.5rem 0.65rem', border: '1px solid var(--border-color)', borderRadius: '4px' };
const btn = (primary, disabled) => ({
  padding: '0.5rem 1.1rem', background: primary ? '#10b981' : 'transparent', color: primary ? 'white' : 'var(--text-primary)',
  border: primary ? 'none' : '1px solid var(--border-color)', borderRadius: '4px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});
const TTLS = [[24, '1 Tag'], [24 * 7, '7 Tage'], [24 * 30, '30 Tage'], [24 * 90, '90 Tage'], [24 * 365, '1 Jahr']];
const fmt = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const group = (code) => `${code.slice(0, 4)} ${code.slice(4)}`;

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}

/**
 * „Designer verbinden“: Kopplungscode erzeugen (8 Ziffern, 5 Minuten, einmalig), aktive Verbindungen mit Widerruf,
 * Schalter für die Passwort-Anmeldung. Läuft mit der Admin-Sitzung von Temgine; Doku: docs/TEMGINE-API.md im Designer-Repo.
 */
export default function DesignerPanel({ showToast }) {
  const [info, setInfo] = useState(null);
  const [access, setAccess] = useState('write');
  const [ttlHours, setTtlHours] = useState(24 * 30);
  const [issued, setIssued] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  const [status, setStatus] = useState(null); // Plugin-Version, Schalter, Token-Zähler
  const [audit, setAudit] = useState(null); // letzte 20 Designer-Aktionen

  const load = useCallback(() => Promise.all([
    api('GET', '/admin/connections').then(setInfo),
    api('GET', '/admin/status').then(setStatus),
    api('GET', '/admin/audit').then((a) => setAudit(a.items)),
  ]).catch((e) => showToast(e.message, 'error')), [showToast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); if (okMsg) showToast(okMsg, 'success'); await load(); } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  };
  const left = issued ? Math.max(0, Math.round((Date.parse(issued.expiresAt) - now) / 1000)) : 0;

  const setSwitch = (key, on, msg) => run(() => api('PUT', '/admin/switches', { [key]: on }), msg);

  return (
    <div>
      <div style={box} data-testid="designer-status">
        <h3 style={{ marginTop: 0 }}>Status</h3>
        {!status ? <p>Lade …</p> : (
          <p style={{ marginTop: 0 }}>
            Designer-Zugriff: <strong>{status.disabled ? 'ausgeschaltet' : status.readOnly ? 'nur lesend' : 'aktiv'}</strong> · Plugin-Version {status.pluginVersion || '–'} · Temgine {status.temgineVersion || '–'} · Aktive Tokens: <strong data-testid="active-tokens">{status.activeTokens}</strong>
          </p>
        )}
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="checkbox" checked={status ? status.disabled : false} disabled={!status || busy}
            onChange={(e) => setSwitch('disabled', e.target.checked, e.target.checked ? 'Designer-Zugriff ausgeschaltet' : 'Designer-Zugriff eingeschaltet')} />
          Designer-Zugriff aus
        </label>
        <p style={{ margin: '0.25rem 0 0.75rem', opacity: 0.7 }}>Alle Anfragen des Designers werden mit „DESIGNER_DISABLED“ (403) abgewiesen; Verbindungen bleiben bestehen und gelten nach dem Einschalten wieder.</p>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="checkbox" checked={status ? status.readOnly : false} disabled={!status || busy}
            onChange={(e) => setSwitch('readOnly', e.target.checked, e.target.checked ? 'Designer global auf „nur lesen“ gestellt' : 'Schreibzugriff des Designers erlaubt')} />
          Nur lesen (für alle Verbindungen, unabhängig vom Token)
        </label>
      </div>

      <div style={box}>
        <h3 style={{ marginTop: 0 }}>Designer verbinden</h3>
        <p>Im Temgine Designer „Mit Temgine verbinden“ wählen, diese Adresse eintragen und den Code eingeben. Das Passwort wird dem Designer nie anvertraut.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={input} value={access} onChange={(e) => setAccess(e.target.value)} aria-label="Zugriff">
            <option value="write">Lesen und Schreiben</option>
            <option value="read">Nur lesen</option>
          </select>
          <select style={input} value={ttlHours} onChange={(e) => setTtlHours(Number(e.target.value))} aria-label="Laufzeit der Verbindung">
            {TTLS.map(([h, l]) => <option key={h} value={h}>Verbindung gilt {l}</option>)}
          </select>
          <button type="button" style={btn(true, busy)} disabled={busy} onClick={() => run(async () => setIssued(await api('POST', '/admin/pairing-codes', { access, ttlHours })))}>Code erzeugen</button>
        </div>
        {issued && (
          <p style={{ marginBottom: 0 }}>
            {left > 0
              ? <>Code: <strong data-testid="pairing-code" style={{ fontSize: '1.8rem', letterSpacing: '0.15em', fontFamily: 'monospace' }}>{group(issued.code)}</strong> (noch {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} gültig, nur einmal verwendbar)</>
              : 'Der Code ist abgelaufen. Bitte einen neuen erzeugen.'}
          </p>
        )}
      </div>

      <div style={box}>
        <h3 style={{ marginTop: 0 }}>Aktive Verbindungen</h3>
        {!info ? <p>Lade …</p> : !info.tokens.length ? <p>Keine aktive Verbindung.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left' }}><th>Bezeichnung</th><th>Benutzer</th><th>Zugriff</th><th>Art</th><th>Seit</th><th>Läuft ab</th><th /></tr></thead>
            <tbody>
              {info.tokens.map((t) => (
                <tr key={t.id}>
                  <td>{t.label || '–'}</td><td>{t.name}</td><td>{t.access === 'read' ? 'nur lesen' : 'lesen + schreiben'}</td>
                  <td>{t.via === 'code' ? 'Code' : 'Passwort'}</td><td>{fmt(t.createdAt)}</td><td>{fmt(t.expiresAt)}</td>
                  <td><button type="button" style={btn(false, busy)} disabled={busy} onClick={() => window.confirm('Verbindung widerrufen? Der Designer verliert sofort den Zugriff.') && run(() => api('DELETE', `/admin/connections/${t.id}`), 'Verbindung widerrufen')}>Widerrufen</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {info && <p style={{ marginBottom: 0, opacity: 0.7 }}>Offene Kopplungscodes: {info.openCodes}</p>}
      </div>

      <div style={box}>
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="checkbox" checked={info ? info.passwordLogin : true} disabled={!info || busy}
            onChange={(e) => run(() => api('PUT', '/admin/password-login', { enabled: e.target.checked }), e.target.checked ? 'Passwort-Anmeldung erlaubt' : 'Passwort-Anmeldung abgeschaltet')} />
          Anmeldung des Designers mit Benutzername und Passwort erlauben
        </label>
        <p style={{ marginBottom: 0, opacity: 0.7 }}>Abgeschaltet: der Designer kann sich nur noch per Kopplungscode verbinden. Bereits ausgestellte Verbindungen bleiben bis zum Widerruf gültig.</p>
      </div>

      <div style={box}>
        <h3 style={{ marginTop: 0 }}>Letzte Designer-Aktionen</h3>
        {!audit ? <p>Lade …</p> : !audit.length ? <p>Noch keine Aktionen.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="designer-audit">
            <thead><tr style={{ textAlign: 'left' }}><th>Zeit</th><th>Aktion</th><th>Objekt</th><th>Benutzer</th></tr></thead>
            <tbody>
              {audit.map((a) => <tr key={a.id}><td>{fmt(a.createdAt)}</td><td>{a.action}</td><td>{a.resourceId || '–'}</td><td>{a.user || '–'}</td></tr>)}
            </tbody>
          </table>
        )}
        <p style={{ marginBottom: 0, opacity: 0.7 }}>Die letzten 20 Einträge aus dem Audit-Log (Aktionen „designer.*“).</p>
      </div>
    </div>
  );
}
