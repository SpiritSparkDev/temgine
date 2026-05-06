import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', name: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setErrors(prev => ({ ...prev, [e.target.name]: null }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.email) errs.email = 'E-Mail ist erforderlich.';
    if (!form.password || form.password.length < 8) errs.password = 'Mindestens 8 Zeichen.';
    if (form.password !== form.confirm) errs.confirm = 'Passwörter stimmen nicht überein.';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setStatus('loading');
    try {
      const res = await fetch('/api/member/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, name: form.name, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 200) {
        if (data.fields) setErrors(data.fields);
        setMessage(data.error || 'Registrierung fehlgeschlagen.');
        setStatus('error');
      } else {
        setMessage(data.message || 'Registrierung erfolgreich.');
        setStatus('success');
      }
    } catch {
      setMessage('Ein Fehler ist aufgetreten. Bitte versuche es erneut.');
      setStatus('error');
    }
  }

  return (
    <>
      <Head><title>Registrieren</title></Head>
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Konto erstellen</h1>

          {status === 'success' ? (
            <div style={styles.successBox}>
              <p>{message}</p>
              <Link href="/member-login" style={styles.link}>Zum Login →</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <Field label="E-Mail *" name="email" type="email" value={form.email} onChange={handleChange} error={errors.email} />
              <Field label="Name (optional)" name="name" type="text" value={form.name} onChange={handleChange} />
              <Field label="Passwort * (min. 8 Zeichen)" name="password" type="password" value={form.password} onChange={handleChange} error={errors.password} />
              <Field label="Passwort bestätigen *" name="confirm" type="password" value={form.confirm} onChange={handleChange} error={errors.confirm} />

              {status === 'error' && !Object.keys(errors).length && (
                <div style={styles.errorBox}>{message}</div>
              )}

              <button type="submit" style={styles.btn} disabled={status === 'loading'}>
                {status === 'loading' ? 'Bitte warten…' : 'Registrieren'}
              </button>
            </form>
          )}

          <p style={styles.footerText}>
            Bereits registriert? <Link href="/member-login" style={styles.link}>Anmelden</Link>
          </p>
        </div>
      </div>
    </>
  );
}

function Field({ label, name, type, value, onChange, error }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={styles.label}>{label}</label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={type === 'password' ? 'new-password' : 'on'}
        style={{ ...styles.input, ...(error ? styles.inputError : {}) }}
      />
      {error && <div style={styles.fieldError}>{error}</div>}
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '24px' },
  card: { background: '#fff', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '40px', width: '100%', maxWidth: '420px' },
  heading: { margin: '0 0 28px', fontSize: '1.5rem', fontWeight: 700, color: '#111' },
  label: { display: 'block', marginBottom: '6px', fontSize: '0.875rem', fontWeight: 500, color: '#374151' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' },
  inputError: { borderColor: '#ef4444' },
  fieldError: { marginTop: '4px', fontSize: '0.8rem', color: '#ef4444' },
  errorBox: { background: '#fee2e2', color: '#991b1b', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.875rem' },
  successBox: { background: '#dcfce7', color: '#166534', borderRadius: '6px', padding: '16px', marginBottom: '16px', fontSize: '0.9rem' },
  btn: { width: '100%', padding: '11px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', marginTop: '8px' },
  footerText: { marginTop: '20px', textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' },
  link: { color: '#3b82f6', textDecoration: 'none' },
};
