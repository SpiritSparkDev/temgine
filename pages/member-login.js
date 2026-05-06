import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signIn, useSession } from 'next-auth/react';

export default function MemberLoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const redirect = router.query.redirect || '/';
  const verified = router.query.verified === '1';
  const tokenError = router.query.error;

  // If already logged in as a member, redirect away
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.accountType === 'member') {
      router.replace(redirect);
    }
  }, [status, session, router, redirect]);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.email || !form.password) { setError('Bitte E-Mail und Passwort eingeben.'); return; }

    setLoading(true);
    try {
      const result = await signIn('member-credentials', {
        redirect: false,
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      if (result?.error) {
        setError('E-Mail oder Passwort ist falsch, oder das Konto ist nicht verifiziert/gesperrt.');
      } else {
        router.replace(redirect);
      }
    } catch {
      setError('Ein Fehler ist aufgetreten. Bitte versuche es erneut.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head><title>Mitglieder-Login</title></Head>
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Mitglieder-Login</h1>

          {verified && (
            <div style={styles.successBox}>E-Mail bestätigt! Du kannst dich jetzt anmelden.</div>
          )}
          {tokenError === 'invalid-token' && (
            <div style={styles.errorBox}>Ungültiger oder bereits verwendeter Bestätigungslink.</div>
          )}
          {tokenError === 'token-expired' && (
            <div style={styles.errorBox}>Der Bestätigungslink ist abgelaufen. Bitte registriere dich erneut.</div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div style={{ marginBottom: '16px' }}>
              <label style={styles.label}>E-Mail</label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                autoComplete="username"
                style={styles.input}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={styles.label}>Passwort</label>
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
                style={styles.input}
              />
            </div>

            {error && <div style={styles.errorBox}>{error}</div>}

            <button type="submit" style={styles.btn} disabled={loading}>
              {loading ? 'Anmelden…' : 'Anmelden'}
            </button>
          </form>

          <p style={styles.footerText}>
            Noch kein Konto? <Link href="/register" style={styles.link}>Jetzt registrieren</Link>
          </p>
        </div>
      </div>
    </>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '24px' },
  card: { background: '#fff', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '40px', width: '100%', maxWidth: '400px' },
  heading: { margin: '0 0 28px', fontSize: '1.5rem', fontWeight: 700, color: '#111' },
  label: { display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' },
  errorBox: { background: '#fee2e2', color: '#991b1b', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.875rem' },
  successBox: { background: '#dcfce7', color: '#166534', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.875rem' },
  btn: { width: '100%', padding: '11px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', marginTop: '8px' },
  footerText: { marginTop: '20px', textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' },
  link: { color: '#3b82f6', textDecoration: 'none' },
};
