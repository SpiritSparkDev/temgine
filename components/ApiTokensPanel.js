import React, { useState, useEffect } from 'react';
import { Card, Row } from './SettingsUi';

const fmt = (d) => (d ? new Date(d).toLocaleString('de-DE') : '–');

/** Einstellungen → API-Zugänge: Token für externe Werkzeuge (Rolle Moderator, Lesen + Schreiben). */
export default function ApiTokensPanel({ showToast }) {
  const [tokens, setTokens] = useState([]);
  const [name, setName] = useState('');
  const [days, setDays] = useState('30');
  const [fresh, setFresh] = useState(null);

  const load = () => fetch('/api/settings/api-tokens').then((r) => r.json()).then((d) => setTokens(d.tokens || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    const res = await fetch('/api/settings/api-tokens', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, days: Number(days) }),
    });
    const d = await res.json();
    if (!res.ok) return showToast(d.error || 'Fehler', 'error');
    setFresh(d.token); setName(''); load();
  };

  const revoke = async (id) => {
    if (!window.confirm('Token widerrufen? Es funktioniert danach sofort nicht mehr.')) return;
    const res = await fetch(`/api/settings/api-tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) load(); else showToast('Fehler beim Widerrufen', 'error');
  };

  return (
    <>
      <Card title="API-Zugänge" description="Token für externe Werkzeuge (z. B. Claude). Ein Token darf wie ein Moderator Seiten, Templates, CSS/JS, Navigation und Dateien lesen und ändern – nicht aber Benutzer, Einstellungen, Backup/Import oder Reparatur. Änderungen stehen im Audit-Log. Aufruf: Header „Authorization: Bearer <Token>“.">
        <Row label="Neues Token" stacked>
          <div className="st-inline">
            <input type="text" placeholder="Name, z. B. Claude" value={name} onChange={(e) => setName(e.target.value)} />
            <select value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="7">7 Tage</option><option value="30">30 Tage</option>
              <option value="90">90 Tage</option><option value="365">1 Jahr</option>
            </select>
            <button type="button" className="btn-primary" disabled={!name.trim()} onClick={create}>Erzeugen</button>
          </div>
        </Row>
        {fresh && (
          <Row label="Dein Token" hint="Wird nur jetzt angezeigt – danach nicht mehr abrufbar." stacked>
            <code style={{ wordBreak: 'break-all' }}>{fresh}</code>{' '}
            <button type="button" onClick={() => navigator.clipboard?.writeText(fresh)}>Kopieren</button>{' '}
            <button type="button" onClick={() => setFresh(null)}>Schließen</button>
          </Row>
        )}
      </Card>
      <Card title="Vorhandene Token">
        {tokens.length === 0 && <p>Noch keine Token.</p>}
        {tokens.map((t) => (
          <Row key={t.id} label={`${t.name} (${t.prefix}…)`} hint={`Läuft ab: ${fmt(t.expiresAt)} · Zuletzt benutzt: ${fmt(t.lastUsedAt)}`}>
            {t.revokedAt ? <em>widerrufen</em> : <button type="button" onClick={() => revoke(t.id)}>Widerrufen</button>}
          </Row>
        ))}
      </Card>
    </>
  );
}
