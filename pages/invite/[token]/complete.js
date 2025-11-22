import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { CheckCircle, AlertCircle } from 'lucide-react';

export default function CompleteInvite() {
  const router = useRouter();
  const { token } = router.query;
  const { data: session, status } = useSession();
  const [processing, setProcessing] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      setError('Keine Anmeldung erkannt. Bitte versuchen Sie es erneut.');
      setProcessing(false);
      return;
    }

    completeInvitation();
  }, [session, status, token]);

  async function completeInvitation() {
    try {
      const res = await fetch('/api/users/setup-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token || localStorage.getItem('inviteToken'),
          authMethod: 'oauth',
          email: session.user.email
        })
      });

      const data = await res.json();

      if (data.success) {
        localStorage.removeItem('inviteToken');
        setTimeout(() => {
          router.push('/admin');
        }, 2000);
      } else {
        setError(data.error || 'Fehler beim Abschließen der Einladung');
        setProcessing(false);
      }
    } catch (err) {
      setError('Fehler beim Abschließen der Einladung');
      setProcessing(false);
    }
  }

  return (
    <div className="invite-page">
      <div className="invite-container">
        {processing && !error && (
          <div className="invite-card success">
            <CheckCircle size={64} color="#10b981" />
            <h1>Account wird erstellt...</h1>
            <p className="invite-text">
              Sie werden gleich weitergeleitet.
            </p>
          </div>
        )}

        {error && (
          <div className="error-card">
            <AlertCircle size={48} color="#dc2626" />
            <h1>Fehler</h1>
            <p>{error}</p>
            <button 
              className="btn-primary"
              onClick={() => router.push('/login')}
              style={{ marginTop: '1rem' }}
            >
              Zur Anmeldung
            </button>
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
          max-width: 500px;
          width: 100%;
        }

        .invite-card,
        .error-card {
          background: white;
          border-radius: 16px;
          padding: 3rem;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        h1 {
          font-size: 2rem;
          margin: 1rem 0;
          color: #1f2937;
        }

        .invite-text {
          color: #6b7280;
          font-size: 1.125rem;
        }

        .btn-primary {
          padding: 0.875rem 1.5rem;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          border: none;
          cursor: pointer;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          transition: all 0.2s;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
      `}</style>
    </div>
  );
}
