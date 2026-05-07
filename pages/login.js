import { signIn, useSession, getProviders } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';

function HealthRow({ label, ok, message, extra }) {
  return (
    <div className="health-row">
      <span className={`health-dot ${ok ? 'ok' : 'fail'}`} />
      <span className="health-label">{label}</span>
      <span className="health-msg">{message}{extra ? ` — ${extra}` : ''}</span>
    </div>
  );
}

export default function Login({ providers }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const redirectingRef = useRef(false);
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const runHealthCheck = async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data);
    } catch (e) {
      setHealth({ error: 'Health-Check nicht erreichbar: ' + e.message });
    } finally {
      setHealthLoading(false);
    }
  };

  // Resolve a safe redirect target from ?callbackUrl — only allow same-origin paths
  const getSafeCallbackUrl = () => {
    const raw = router.query.callbackUrl;
    if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) {
      return raw;
    }
    return '/admin';
  };

  useEffect(() => {
    if (status === 'authenticated' && !redirectingRef.current) {
      redirectingRef.current = true;
      router.push(getSafeCallbackUrl());
    }
  }, [status, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const result = await signIn('credentials', {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Falscher Benutzername oder Passwort');
      } else if (result?.ok) {
        // Explicit redirect — does not rely on session status update
        if (!redirectingRef.current) {
          redirectingRef.current = true;
          router.push(getSafeCallbackUrl());
        }
      } else {
        setError('Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-icon">🔐</div>
        <h1>Admin Login</h1>
        <p className="auth-hint">
          Melden Sie sich an, um auf den Admin-Bereich zuzugreifen.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="login-username">Benutzername</label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="login-password">Passwort</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-btn-primary" disabled={loading}>
            {loading ? 'Anmelden...' : 'Anmelden'}
          </button>
        </form>

        {providers && Object.values(providers).filter(p => p.id !== 'credentials').length > 0 && (
          <>
            <div className="auth-divider"><span>oder</span></div>

            <div className="auth-oauth-group">
              {providers?.github && (
                <button
                  className="auth-oauth-btn github"
                  onClick={() => signIn('github', { callbackUrl: '/admin' })}
                >
                  <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  Mit GitHub anmelden
                </button>
              )}
            </div>
          </>
        )}

        <p className="auth-footer-hint">
          Bitte verwenden Sie ein angelegtes Benutzerkonto oder OAuth.
        </p>

        <div className="health-panel">
          <button
            type="button"
            className="health-toggle"
            onClick={runHealthCheck}
            disabled={healthLoading}
          >
            {healthLoading ? 'Prüfe…' : 'System-Status prüfen'}
          </button>

          {health && !health.error && (
            <div className="health-results">
              <HealthRow
                label="Umgebung"
                ok={health.env?.ok}
                message={health.env?.message}
              />
              <HealthRow
                label="Datenbank"
                ok={health.database?.ok}
                message={health.database?.message}
              />
              <HealthRow
                label="Schema"
                ok={health.schema?.ok}
                message={health.schema?.message}
                extra={health.schema?.userCount !== undefined ? `${health.schema.userCount} Benutzer` : undefined}
              />
            </div>
          )}

          {health?.error && (
            <div className="health-error">{health.error}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps(context) {
  // Redirect to /setup if no users exist yet
  try {
    const { prisma } = await import('../lib/prisma');
    const count = await prisma.user.count();
    if (count === 0) {
      return { redirect: { destination: '/setup', permanent: false } };
    }
  } catch (_) {}

  const providers = await getProviders();
  return {
    props: { providers: providers || {} },
  };
}
