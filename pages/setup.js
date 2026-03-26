import { useState } from 'react';
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

  // Already set up – just show a message
  if (hasUsers) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.icon}>✅</div>
          <h1 style={styles.title}>Setup abgeschlossen</h1>
          <p style={styles.hint}>Es existiert bereits ein Benutzer-Account.</p>
          <button style={styles.btn} onClick={() => router.push('/login')}>
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
    } catch {
      setError('Netzwerkfehler. Bitte versuche es erneut.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.icon}>🔧</div>
        <h1 style={styles.title}>Ersteinrichtung</h1>
        <p style={styles.hint}>
          Kein Benutzer gefunden. Lege jetzt den ersten Admin-Account an.
          Du benötigst den <strong>Setup-Token</strong> aus der Server-Konfiguration.
        </p>

        <form onSubmit={handleSubmit} style={{ textAlign: 'left', marginTop: '1.5rem' }}>
          <Field label="Setup-Token *">
            <input
              style={styles.input}
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Aus .env.local: SETUP_TOKEN"
              required
            />
          </Field>

          <Field label="Name *">
            <input
              style={styles.input}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Admin"
              required
            />
          </Field>

          <Field label="E-Mail *">
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
            />
          </Field>

          <Field label="Passwort * (min. 8 Zeichen)">
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </Field>

          <Field label="Passwort bestätigen *">
            <input
              style={styles.input}
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              minLength={8}
              required
            />
          </Field>

          {error && <div style={styles.error}>{error}</div>}

          <button
            type="submit"
            style={{ ...styles.btn, marginTop: '1rem', opacity: loading ? 0.6 : 1 }}
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
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.9rem', color: '#444' }}>
        {label}
      </label>
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '2rem',
  },
  card: {
    background: 'white',
    padding: '2.5rem',
    borderRadius: '12px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
    maxWidth: '440px',
    width: '100%',
    textAlign: 'center',
  },
  icon: {
    fontSize: '2.5rem',
    marginBottom: '0.75rem',
  },
  title: {
    margin: '0 0 0.5rem',
    color: '#222',
    fontSize: '1.5rem',
    fontWeight: 700,
  },
  hint: {
    color: '#666',
    fontSize: '0.9rem',
    lineHeight: 1.5,
    margin: 0,
  },
  input: {
    width: '100%',
    padding: '0.65rem 0.75rem',
    border: '1px solid #ccc',
    borderRadius: '6px',
    fontSize: '0.95rem',
    boxSizing: 'border-box',
  },
  error: {
    padding: '0.65rem 0.75rem',
    background: '#fee2e2',
    color: '#dc2626',
    borderRadius: '6px',
    fontSize: '0.88rem',
    marginTop: '0.5rem',
  },
  btn: {
    width: '100%',
    padding: '0.75rem',
    fontSize: '1rem',
    fontWeight: 600,
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
};
