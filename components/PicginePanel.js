import React, { useState, useEffect } from 'react';

const labelStyle = { display: 'block', marginBottom: '0.4rem', fontWeight: 600 };
const inputStyle = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  border: '1px solid var(--border-color)',
  borderRadius: '4px',
  boxSizing: 'border-box',
};
const buttonStyle = (disabled, primary) => ({
  padding: '0.6rem 1.5rem',
  background: primary ? '#10b981' : 'transparent',
  color: primary ? 'white' : 'var(--text-primary)',
  border: primary ? 'none' : '1px solid var(--border-color)',
  borderRadius: '4px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1,
});

/**
 * Anbindung an die Picgine-Foto-App (Galerien via {{#picgine:name}}, siehe
 * help/picgine-galerien.md). Der API-Schlüssel ist write-only: /api/settings gibt
 * ihn nie heraus, nur "picgine_api_key_set".
 */
export default function PicginePanel({ showToast }) {
  const [picgineUrl, setPicgineUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeySet, setApiKeySet] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('/api/picgine/webhook');

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/picgine/webhook`);
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setPicgineUrl(data.picgine_url || '');
        setApiKeySet(!!data.picgine_api_key_set);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    const url = picgineUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      showToast('Die Picgine-URL muss mit http:// oder https:// beginnen.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const entries = [['picgine_url', url]];
      if (apiKey.trim()) entries.push(['picgine_api_key', apiKey.trim()]);
      for (const [key, value] of entries) {
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'Fehler beim Speichern');
        }
      }
      if (apiKey.trim()) {
        setApiKeySet(true);
        setApiKey('');
      }
      showToast('Picgine-Einstellungen gespeichert', 'success');
    } catch (e) {
      showToast(e.message || 'Fehler beim Speichern', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/test-picgine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picgineUrl: picgineUrl.trim(), apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      setTestResult(data.ok
        ? { ok: true, message: `Verbunden — ${data.count} Galerie(n) gefunden` }
        : { ok: false, message: data.error || 'Verbindung fehlgeschlagen' });
    } catch (e) {
      setTestResult({ ok: false, message: e.message || 'Test fehlgeschlagen' });
    } finally {
      setIsTesting(false);
    }
  };

  const canTest = !!picgineUrl.trim() && (apiKeySet || !!apiKey.trim());

  return (
    <section style={{ marginTop: '2.5rem' }}>
      <h3 style={{ marginBottom: '0.5rem' }}>Picgine (Foto-Galerien)</h3>
      <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
        Verbindet Temgine mit einer Picgine-Installation. Galerien werden in Templates über
        {' '}<code>{'{{#picgine:name}}…{{/picgine:name}}'}</code> eingebunden und im Seiten-Editor ausgewählt.
      </p>

      <div style={{ display: 'grid', gap: '1rem', maxWidth: '520px' }}>
        <div>
          <label style={labelStyle}>Picgine-URL</label>
          <input
            type="url"
            value={picgineUrl}
            onChange={(e) => setPicgineUrl(e.target.value)}
            placeholder="https://pics.example.com"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>API-Schlüssel</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={apiKeySet ? '•••••••• (gesetzt — leer lassen, um ihn zu behalten)' : 'Client-Schlüssel aus Picgine'}
            autoComplete="new-password"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleSave} disabled={isSaving} style={buttonStyle(isSaving, true)}>
            {isSaving ? 'Speichern…' : 'Speichern'}
          </button>
          <button onClick={handleTestConnection} disabled={isTesting || !canTest} style={buttonStyle(isTesting || !canTest, false)}>
            {isTesting ? 'Teste…' : 'Verbindung testen'}
          </button>
          {testResult && (
            <span style={{ fontSize: '0.85rem', color: testResult.ok ? '#15803d' : '#b91c1c' }}>
              {testResult.ok ? '✓' : '⚠'} {testResult.message}
            </span>
          )}
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
          Webhook: In Picgine beim Client als Webhook-URL <code>{webhookUrl}</code> eintragen. Bei
          Galerie-Änderungen wird dann der statische Live-Snapshot automatisch neu gebaut.
        </p>
      </div>
    </section>
  );
}
