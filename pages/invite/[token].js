import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { User, Mail, Key, Shield, CheckCircle2, AlertTriangle } from '../../lib/muiIcons';
import Head from 'next/head';

export default function InvitePage() {
  const router = useRouter();
  const { token } = router.query;
  
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(1); // 1: Willkommen, 2: Auth wählen, 3: Credentials eingeben
  const [authMethod, setAuthMethod] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    username: '',
    password: '',
    passwordConfirm: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (token) {
      validateInvitation();
    }
  }, [token]);

  async function validateInvitation() {
    try {
      const res = await fetch(`/api/users/accept-invitation?token=${token}`);
      const data = await res.json();

      if (data.invitation) {
        setInvitation(data.invitation);
        setFormData(prev => ({ ...prev, name: data.invitation.name || '' }));
      } else {
        setError(data.error || 'Einladung ungültig');
      }
    } catch (err) {
      setError('Fehler beim Laden der Einladung');
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthMethodSelect(method) {
    setAuthMethod(method);
    if (method === 'credentials') {
      setStep(3);
    }
    // OAuth wird direkt über handleOAuthSelect aufgerufen
  }

  async function handleOAuthSelect(provider) {
    setSubmitting(true);
    // Speichere Token in localStorage für nach OAuth-Rückkehr
    localStorage.setItem('inviteToken', token);
    // Leite direkt zum OAuth-Provider weiter
    signIn(provider, { callbackUrl: `/invite/${token}/complete` });
  }

  async function acceptInvitation(method, credentials = {}) {
    setSubmitting(true);
    
    // Bei OAuth: Frage nach E-Mail
    if (method === 'oauth' && !credentials.email) {
      const email = prompt('Bitte geben Sie Ihre E-Mail-Adresse ein:');
      if (!email) {
        setSubmitting(false);
        return;
      }
      credentials.email = email;
    }
    
    try {
      const res = await fetch('/api/users/setup-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          authMethod: method,
          ...credentials
        })
      });

      const data = await res.json();

      if (data.success) {
        if (method === 'oauth') {
          // Zeige Erfolg und leite zu Login
          setStep(4);
          setTimeout(() => {
            router.push('/login');
          }, 2000);
        } else {
          // Login mit neuen Credentials
          const result = await signIn('credentials', {
            username: credentials.username,
            password: credentials.password,
            redirect: false
          });

          if (result?.ok) {
            router.push('/admin');
          } else {
            setError('Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.');
          }
        }
      } else {
        setError(data.error || 'Fehler beim Erstellen des Accounts');
      }
    } catch (err) {
      setError('Fehler beim Erstellen des Accounts');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCredentialsSubmit(e) {
    e.preventDefault();

    if (formData.password !== formData.passwordConfirm) {
      setError('Passwörter stimmen nicht überein');
      return;
    }

    if (formData.password.length < 6) {
      setError('Passwort muss mindestens 6 Zeichen lang sein');
      return;
    }

    await acceptInvitation('credentials', {
      email: formData.email,
      name: formData.name,
      username: formData.username,
      password: formData.password
    });
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="loading-spinner">Lädt...</div>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="auth-page">
        <Head>
          <title>Einladung ungültig</title>
        </Head>
        <div className="auth-card">
          <div className="error-card">
            <AlertCircle size={48} color="#9b2318" />
            <h1>Einladung ungültig</h1>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <Head>
        <title>Willkommen zu Temgine CMS</title>
      </Head>

      <div className="auth-card wide">
        {step === 1 && (
          <>
            <div className="auth-icon">
              <Mail size={44} color="#c25208" />
            </div>
            <h1>Willkommen zu Temgine CMS!</h1>
            <p className="auth-hint">
              Sie wurden von <strong>{invitation.createdBy}</strong> eingeladen,
              Temgine CMS beizutreten.
            </p>

            <div className="invite-details">
              {invitation.name && (
                <div className="detail-item">
                  <User size={20} />
                  <div>
                    <div className="detail-label">Einladung für</div>
                    <div className="detail-value">{invitation.name}</div>
                  </div>
                </div>
              )}
              <div className="detail-item">
                <Shield size={20} />
                <div>
                  <div className="detail-label">Rolle</div>
                  <div className="detail-value">{invitation.role}</div>
                </div>
              </div>
            </div>

            <button className="auth-btn-primary" onClick={() => setStep(2)}>
              Account erstellen
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h1>Authentifizierung wählen</h1>
            <p className="auth-hint">Wie möchten Sie sich in Zukunft anmelden?</p>

            <div className="auth-methods">
              <button
                className="auth-method-btn"
                onClick={() => handleAuthMethodSelect('credentials')}
                disabled={submitting}
              >
                <Key size={28} />
                <div>
                  <h3>Benutzername &amp; Passwort</h3>
                  <p>Erstellen Sie ein lokales Konto mit eigenem Passwort</p>
                </div>
              </button>

              <div className="auth-method-separator"><span>oder</span></div>

              <button
                className="auth-method-btn oauth-github"
                onClick={() => handleOAuthSelect('github')}
                disabled={submitting}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                <div>
                  <h3>Mit GitHub anmelden</h3>
                </div>
              </button>

              <button
                className="auth-method-btn oauth-google"
                onClick={() => handleOAuthSelect('google')}
                disabled={submitting}
              >
                <svg width="28" height="28" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <div>
                  <h3>Mit Google anmelden</h3>
                </div>
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1>Zugangsdaten festlegen</h1>
            <p className="auth-hint">Erstellen Sie Ihr Passwort für die Anmeldung</p>

            <form onSubmit={handleCredentialsSubmit} className="credentials-form">
              <div className="form-group">
                <label>E-Mail *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="ihre@email.de"
                  required
                />
              </div>

              <div className="form-group">
                <label>Name (optional)</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Ihr Name"
                />
              </div>

              <div className="form-group">
                <label>Benutzername *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  placeholder="Benutzername"
                  required
                />
              </div>

              <div className="form-group">
                <label>Passwort *</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  placeholder="Mindestens 6 Zeichen"
                  required
                  minLength={6}
                />
              </div>

              <div className="form-group">
                <label>Passwort bestätigen *</label>
                <input
                  type="password"
                  value={formData.passwordConfirm}
                  onChange={(e) => setFormData({...formData, passwordConfirm: e.target.value})}
                  placeholder="Passwort wiederholen"
                  required
                />
              </div>

              {error && <div className="error-message">{error}</div>}

              <div className="form-actions">
                <button
                  type="button"
                  className="auth-btn-secondary"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                >
                  Zurück
                </button>
                <button
                  type="submit"
                  className="auth-btn-primary"
                  disabled={submitting}
                  style={{ marginTop: 0 }}
                >
                  {submitting ? 'Erstelle Account...' : 'Account erstellen'}
                </button>
              </div>
            </form>
          </>
        )}

        {step === 4 && (
          <div className="invite-success">
            <CheckCircle size={56} color="#1d7a3a" />
            <h1>Account erstellt!</h1>
            <p className="auth-hint">
              Ihr Account wurde erfolgreich erstellt. Sie werden zum Login weitergeleitet...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
