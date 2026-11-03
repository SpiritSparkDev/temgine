import React, { useState, useEffect } from 'react';
import { Toggle, Card, Row, SaveButton } from './SettingsUi';
import { getClientPlugins } from '../lib/plugins/client';

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

const INPUT_TYPES = { text: 'text', url: 'url', number: 'number', secret: 'password' };

// Formular aus plugin.json → settings, wenn das Plugin kein eigenes SettingsPanel hat.
// Secrets sind write-only: leer lassen = unverändert, „gesetzt“ zeigt einen gespeicherten Wert.
function PluginSettingsForm({ plugin, values, showToast, onSaved }) {
  const entries = Object.entries(plugin.settings);
  const isSecret = (def) => def.type === 'secret' || def.secret === true;
  const [form, setForm] = useState(() => Object.fromEntries(entries.map(([key, def]) => [key, isSecret(def) ? '' : values[key] ?? ''])));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const save = async () => {
    setSaving(true);
    try {
      for (const [key, def] of entries) {
        if (isSecret(def) && !form[key]) continue;
        await putSetting(key, form[key]);
      }
      showToast(`${plugin.name}: Einstellungen gespeichert`, 'success');
      setForm((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, isSecret(plugin.settings[k]) ? '' : v])));
      onSaved();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/plugins/${plugin.id}/__test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const d = await res.json().catch(() => ({}));
      setTestResult(res.ok ? d : { ok: false, message: d.error || `HTTP ${res.status}` });
    } catch (e) {
      setTestResult({ ok: false, message: e.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card
      title={plugin.name}
      description={plugin.description}
      footer={(
        <>
          <SaveButton onClick={save} saving={saving} />
          {plugin.hasTest && (
            <button type="button" className="st-btn" onClick={test} disabled={testing}>
              {testing ? 'Teste…' : 'Verbindung testen'}
            </button>
          )}
          {testResult && <span className={testResult.ok ? '' : 'st-error'}>{testResult.ok ? '✓ ' : '✗ '}{testResult.message || (testResult.ok ? 'OK' : 'Fehlgeschlagen')}</span>}
        </>
      )}
    >
      {!entries.length && <p className="st-note">Dieses Plugin hat keine Einstellungen.</p>}
      {entries.map(([key, def]) => (
        <Row key={key} label={def.label || key} hint={isSecret(def) && values[`${key}_set`] ? 'gesetzt — leer lassen, um den Wert zu behalten' : def.hint} stacked={def.type !== 'bool'}>
          {def.type === 'bool' ? (
            <Toggle checked={form[key] === 'true'} onChange={(on) => setForm((f) => ({ ...f, [key]: on ? 'true' : 'false' }))} label={def.label || key} />
          ) : def.type === 'json' ? (
            <textarea
              className="st-input"
              rows={8}
              spellCheck={false}
              style={{ fontFamily: 'monospace' }}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              placeholder={def.secret && values[`${key}_set`] ? 'gesetzt' : def.placeholder || '{ }'}
            />
          ) : (
            <input
              type={INPUT_TYPES[def.type]}
              className="st-input"
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              placeholder={def.type === 'secret' && values[`${key}_set`] ? 'gesetzt' : def.placeholder || ''}
              autoComplete={def.type === 'secret' ? 'new-password' : undefined}
            />
          )}
        </Row>
      ))}
    </Card>
  );
}

const STATE_LABEL = { loaded: 'eingespielt', build: 'Sync + Neu-Build nötig', invalid: 'ungültig' };

/**
 * Git-Quellen: Repo-URLs hinterlegen und holen. Geholt wird nur in den Cache (data/plugin-sources/);
 * aktiv wird ein Plugin erst nach `npm run plugins:sync` und Neu-Build (Next bündelt Plugins beim Build).
 */
function GitSources({ showToast }) {
  const [sources, setSources] = useState(null);
  const [url, setUrl] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => fetch('/api/plugins/__sources').then((r) => (r.ok ? r.json() : { sources: [] })).then((d) => setSources(d.sources || [])).catch(() => setSources([]));
  useEffect(() => { load(); }, []);

  const call = async (key, method, body, okMessage) => {
    setBusy(key);
    try {
      const res = await fetch('/api/plugins/__sources', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Fehlgeschlagen');
      showToast(okMessage, 'success');
      return true;
    } catch (e) {
      showToast(e.message, 'error');
      return false;
    } finally {
      setBusy('');
      load();
    }
  };

  const add = async () => {
    if (await call('add', 'POST', { url, ref }, 'Quelle geholt')) { setUrl(''); setRef(''); }
  };

  return (
    <Card
      title="Git-Quellen"
      description="Git-Repositories mit Plugins (plugin.json im Hauptordner oder in Unterordnern). „Holen“ klont sie in data/plugin-sources/ und prüft die Manifeste. Aktiv wird ein Plugin erst nach „npm run plugins:sync“ und einem Neu-Build (z. B. docker compose up -d --build); Temgine baut sich nicht selbst neu."
    >
      {sources === null && <p className="st-note">Lade Quellen…</p>}
      {sources && !sources.length && <p className="st-note">Noch keine Git-Quellen.</p>}
      {(sources || []).map((s) => {
        const key = `${s.url}#${s.ref}`;
        return (
          <Row key={key} label={`${s.url}${s.ref ? ` @ ${s.ref}` : ''}`} hint={s.fetchedAt ? `Stand ${s.commit} · geholt ${new Date(s.fetchedAt).toLocaleString('de-DE')}` : 'noch nicht geholt'} stacked>
            {s.error && <p className="st-error">✗ {s.error}</p>}
            {s.plugins.map((p) => (
              <p key={p.id} className="st-note" style={{ margin: '2px 0' }}>
                <strong>{p.name} {p.version}</strong> — {STATE_LABEL[p.state]}
                {p.errors.length > 0 && <span className="st-error"> ({p.errors.join('; ')})</span>}
              </p>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button type="button" className="st-btn" disabled={!!busy} onClick={() => call(key, 'POST', { action: 'fetch', url: s.url, ref: s.ref }, 'Quelle aktualisiert')}>{busy === key ? 'Hole…' : 'Neu holen'}</button>
              <button type="button" className="st-btn" disabled={!!busy} onClick={() => window.confirm('Quelle samt Cache entfernen? Bereits eingespielte Plugins bleiben erhalten.') && call(key, 'DELETE', { url: s.url, ref: s.ref }, 'Quelle entfernt')}>Entfernen</button>
            </div>
          </Row>
        );
      })}
      <Row label="Neue Quelle" hint="https://… oder git@host:pfad.git; Branch oder Tag optional" stacked>
        <input type="text" className="st-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/name/mein-plugin.git" aria-label="Git-URL" />
        <input type="text" className="st-input" style={{ marginTop: 6 }} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Branch oder Tag (optional)" aria-label="Branch oder Tag" />
        <div style={{ marginTop: 8 }}>
          <button type="button" className="st-btn" disabled={!url.trim() || !!busy} onClick={add}>{busy === 'add' ? 'Hole…' : 'Hinzufügen und holen'}</button>
        </div>
      </Row>
    </Card>
  );
}

/**
 * Einstellungen → Plugins: Liste aller eingebauten Plugins mit Aktivieren-Schalter und pro
 * aktivem Plugin ein Unter-Tab mit dessen SettingsPanel (plugins/<id>/client.js) oder dem
 * automatisch erzeugten Formular aus plugin.json.
 */
export default function PluginsPanel({ showToast }) {
  const [plugins, setPlugins] = useState(null);
  const [values, setValues] = useState({});
  const [sub, setSub] = useState('overview');
  const [busy, setBusy] = useState('');

  const load = () => Promise.all([
    fetch('/api/plugins?all=1').then((r) => (r.ok ? r.json() : [])),
    fetch('/api/settings').then((r) => (r.ok ? r.json() : {})),
  ]).then(([list, settings]) => {
    setPlugins(Array.isArray(list) ? list : []);
    setValues(settings || {});
  }).catch(() => setPlugins([]));

  useEffect(() => { load(); }, []);

  const toggle = async (plugin, on) => {
    setBusy(plugin.id);
    try {
      await putSetting(`plugin_${plugin.id}_enabled`, on ? 'true' : 'false');
      setPlugins((list) => list.map((p) => (p.id === plugin.id ? { ...p, enabled: on } : p)));
      showToast(`${plugin.name} ${on ? 'aktiviert' : 'deaktiviert'}`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy('');
    }
  };

  if (!plugins) return <p className="st-note">Lade Plugins…</p>;
  const active = plugins.filter((p) => p.enabled);
  const current = active.find((p) => p.id === sub);
  const CustomPanel = current && getClientPlugins()[current.id]?.SettingsPanel;

  return (
    <>
      <nav className="st-tabs" role="tablist">
        {[{ id: 'overview', name: 'Übersicht' }, ...active].map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={(current?.id || 'overview') === p.id} className={`st-tab${(current?.id || 'overview') === p.id ? ' is-active' : ''}`} onClick={() => setSub(p.id)}>
            {p.name}
          </button>
        ))}
      </nav>

      {!current && (
        <Card title="Eingebaute Plugins" description="Plugins sind Teil des Codes (Ordner plugins/). Ein neues Plugin ist standardmäßig aus.">
          {!plugins.length && <p className="st-note">Keine Plugins eingebaut.</p>}
          {plugins.map((p) => (
            <Row key={p.id} label={`${p.name} ${p.version}`} hint={p.description}>
              <Toggle checked={p.enabled} onChange={(on) => toggle(p, on)} disabled={busy === p.id} label={`${p.name} aktivieren/deaktivieren`} />
            </Row>
          ))}
        </Card>
      )}
      {!current && <GitSources showToast={showToast} />}

      {current && (CustomPanel
        ? <CustomPanel showToast={showToast} plugin={current} />
        : <PluginSettingsForm key={current.id} plugin={current} values={values} showToast={showToast} onSaved={load} />)}
    </>
  );
}
