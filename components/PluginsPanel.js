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
  const [form, setForm] = useState(() => Object.fromEntries(entries.map(([key, def]) => [key, def.type === 'secret' ? '' : values[key] ?? ''])));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const save = async () => {
    setSaving(true);
    try {
      for (const [key, def] of entries) {
        if (def.type === 'secret' && !form[key]) continue;
        await putSetting(key, form[key]);
      }
      showToast(`${plugin.name}: Einstellungen gespeichert`, 'success');
      setForm((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, plugin.settings[k].type === 'secret' ? '' : v])));
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
        <Row key={key} label={def.label || key} hint={def.type === 'secret' && values[`${key}_set`] ? 'gesetzt — leer lassen, um den Wert zu behalten' : def.hint} stacked={def.type !== 'bool'}>
          {def.type === 'bool' ? (
            <Toggle checked={form[key] === 'true'} onChange={(on) => setForm((f) => ({ ...f, [key]: on ? 'true' : 'false' }))} label={def.label || key} />
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

      {current && (CustomPanel
        ? <CustomPanel showToast={showToast} plugin={current} />
        : <PluginSettingsForm key={current.id} plugin={current} values={values} showToast={showToast} onSaved={load} />)}
    </>
  );
}
