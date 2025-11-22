import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { User, Mail, Key, Shield, CheckCircle, AlertCircle } from 'lucide-react';
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
      <div className="invite-page">
        <div className="invite-container">
          <div className="loading-spinner">Lädt...</div>
        </div>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="invite-page">
        <Head>
          <title>Einladung ungültig</title>
        </Head>
        <div className="invite-container">
          <div className="error-card">
            <AlertCircle size={48} color="#dc2626" />
            <h1>Einladung ungültig</h1>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="invite-page">
      <Head>
        <title>Willkommen zu TempHelix</title>
      </Head>
      
      <div className="invite-container">
        {step === 1 && (
          <div className="invite-card">
            <div className="invite-icon">
              <Mail size={48} color="#667eea" />
            </div>
            <h1>Willkommen zu TempHelix!</h1>
            <p className="invite-text">
              Sie wurden von <strong>{invitation.createdBy}</strong> eingeladen, 
              TempHelix beizutreten.
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

            <button className="btn-primary" onClick={() => setStep(2)}>
              Account erstellen
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="invite-card">
            <h1>Authentifizierung wählen</h1>
            <p className="invite-text">
              Wie möchten Sie sich in Zukunft anmelden?
            </p>

            <div className="auth-methods">
              <button 
                className="auth-method-btn"
                onClick={() => handleAuthMethodSelect('credentials')}
                disabled={submitting}
              >
                <Key size={32} />
                <h3>Benutzername & Passwort</h3>
                <p>Erstellen Sie ein lokales Konto mit eigenem Passwort</p>
              </button>

              <div className="auth-method-separator">
                <span>oder</span>
              </div>

              <button 
                className="auth-method-btn oauth-github"
                onClick={() => handleOAuthSelect('github')}
                disabled={submitting}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                <h3>Mit GitHub anmelden</h3>
              </button>

              <button 
                className="auth-method-btn oauth-google"
                onClick={() => handleOAuthSelect('google')}
                disabled={submitting}
              >
                <svg width="32" height="32" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <h3>Mit Google anmelden</h3>
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="invite-card">
            <h1>Zugangsdaten festlegen</h1>
            <p className="invite-text">
              Erstellen Sie Ihr Passwort für die Anmeldung
            </p>

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
                  className="btn-secondary"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                >
                  Zurück
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Erstelle Account...' : 'Account erstellen'}
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 4 && (
          <div className="invite-card success">
            <CheckCircle size={64} color="#16a34a" />
            <h1>Account erstellt!</h1>
            <p className="invite-text">
              Ihr Account wurde erfolgreich erstellt. Sie werden zum Login weitergeleitet...
            </p>
          </div>
        )}
      </div>

      <style jsx>{`
        .invite-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }

        .invite-container {
          width: 100%;
          max-width: 600px;
        }

        .invite-card {
          background: white;
          border-radius: 16px;
          padding: 3rem;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .invite-card.success {
          text-align: center;
        }

        .invite-icon {
          text-align: center;
          margin-bottom: 2rem;
        }

        .invite-card h1 {
          font-size: 2rem;
          margin: 0 0 1rem 0;
          color: #1f2937;
          text-align: center;
        }

        .invite-text {
          text-align: center;
          color: #6b7280;
          font-size: 1.125rem;
          margin-bottom: 2rem;
        }

        .invite-details {
          background: #f9fafb;
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 2rem;
        }

        .detail-item {
          display: flex;
          gap: 1rem;
          align-items: flex-start;
          margin-bottom: 1rem;
        }

        .detail-item:last-child {
          margin-bottom: 0;
        }

        .detail-label {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .detail-value {
          font-size: 1rem;
          font-weight: 600;
          color: #1f2937;
        }

        .auth-methods {
          display: grid;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .auth-method-separator {
          text-align: center;
          position: relative;
          margin: 0.5rem 0;
        }

        .auth-method-separator span {
          background: white;
          padding: 0 1rem;
          color: #9ca3af;
          font-size: 0.875rem;
          position: relative;
          z-index: 1;
        }

        .auth-method-separator::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          height: 1px;
          background: #e5e7eb;
        }

        .auth-method-btn {
          background: #f9fafb;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .auth-method-btn:hover:not(:disabled) {
          background: white;
          border-color: #667eea;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
        }

        .auth-method-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .auth-method-btn h3 {
          margin: 0;
          color: #1f2937;
          font-size: 1.125rem;
        }

        .auth-method-btn p {
          margin: 0;
          color: #6b7280;
          font-size: 0.875rem;
        }

        .auth-method-btn.oauth-github {
          background: #24292e;
          color: white;
          border-color: #24292e;
        }

        .auth-method-btn.oauth-github:hover:not(:disabled) {
          background: #1a1e22;
          border-color: #1a1e22;
          box-shadow: 0 4px 12px rgba(36, 41, 46, 0.4);
        }

        .auth-method-btn.oauth-github h3 {
          color: white;
        }

        .auth-method-btn.oauth-google {
          background: white;
          border-color: #dadce0;
        }

        .auth-method-btn.oauth-google:hover:not(:disabled) {
          border-color: #4285f4;
          box-shadow: 0 4px 12px rgba(66, 133, 244, 0.2);
        }

        .credentials-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-group label {
          font-weight: 600;
          color: #374151;
        }

        .form-group input {
          padding: 0.75rem;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 1rem;
          transition: border-color 0.2s;
        }

        .form-group input:focus {
          outline: none;
          border-color: #667eea;
        }

        .error-message {
          background: #fee2e2;
          color: #dc2626;
          padding: 0.75rem;
          border-radius: 8px;
          font-size: 0.875rem;
        }

        .form-actions {
          display: flex;
          gap: 1rem;
          margin-top: 1rem;
        }

        .btn-primary,
        .btn-secondary {
          flex: 1;
          padding: 0.875rem 1.5rem;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .btn-secondary {
          background: #f3f4f6;
          color: #374151;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #e5e7eb;
        }

        .btn-primary:disabled,
        .btn-secondary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .error-card {
          background: white;
          border-radius: 16px;
          padding: 3rem;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .error-card h1 {
          color: #1f2937;
          margin: 1rem 0;
        }

        .error-card p {
          color: #6b7280;
        }

        .loading-spinner {
          text-align: center;
          color: white;
          font-size: 1.25rem;
        }
      `}</style>
    </div>
  );
}
