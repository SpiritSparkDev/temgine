import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { prisma } from '../lib/prisma';

/**
 * /setup — Erstlogin-Seite
 *
 * Nur zugänglich wenn noch kein User in der DB existiert.
 * Erstellt den ersten Admin-Account mit dem konfigurierten SETUP_TOKEN.
 */
export default function SetupPage({ hasUsers }) {
  const router = useRouter();
  const [token, setToken]       = useState('');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // Prefill from the setup link logged at server boot (?token=...)
  useEffect(() => {
    if (typeof router.query.token === 'string') setToken(router.query.token);
  }, [router.query.token]);

  // Already set up – just show a message
  if (hasUsers) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-icon">✅</div>
          <h1>Setup abgeschlossen</h1>
          <p className="auth-hint">Es existiert bereits ein Benutzer-Account.</p>
          <button className="auth-btn-primary" onClick={() => router.push('/login')}>
            Zum Login
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwörter stimmen nicht überein.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/setup/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupToken: token, name, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Fehler beim Erstellen des Accounts.');
        return;
      }

      // Success — go to login
      router.push('/login?setup=done');
    } catch (e) {
      setError('Netzwerkfehler: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-icon">🔧</div>
        <h1>Ersteinrichtung</h1>
        <p className="auth-hint">
          Kein Benutzer gefunden. Lege jetzt den ersten Admin-Account an.
          {token
            ? ' Der Setup-Token wurde aus dem Link übernommen.'
            : ' Öffne den Setup-Link aus der Server-Konsole, oder trage den Setup-Token manuell ein.'}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <Field label="Setup-Token *">
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Aus dem Setup-Link in der Server-Konsole"
              autoComplete="off"
              required
            />
          </Field>

          <Field label="Name *">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Admin"
              autoComplete="name"
              required
            />
          </Field>

          <Field label="E-Mail *">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@example.com"
              autoComplete="email"
              required
            />
          </Field>

          <Field label="Passwort * (min. 8 Zeichen)">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
            />
          </Field>

          <Field label="Passwort bestätigen *">
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
            />
          </Field>

          {error && <div className="auth-error">{error}</div>}

          <button
            type="submit"
            className="auth-btn-primary"
            disabled={loading}
          >
            {loading ? 'Erstelle Account…' : 'Admin-Account anlegen'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="auth-field">
      <label>{label}</label>
      {children}
    </div>
  );
}

// ─── Server-side: check user count ──────────────────────────────────────────

export async function getServerSideProps() {
  try {
    const count = await prisma.user.count();
    return { props: { hasUsers: count > 0 } };
  } catch {
    // DB not reachable – show the form anyway (API will reject with proper error)
    return { props: { hasUsers: false } };
  }
}
