import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { CheckCircle, AlertCircle } from '../../../lib/muiIcons';

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
    <div className="auth-page">
      <div className="auth-card">
        {processing && !error && (
          <div className="invite-success">
            <CheckCircle size={56} color="#1d7a3a" />
            <h1>Account wird erstellt...</h1>
            <p className="auth-hint">Sie werden gleich weitergeleitet.</p>
          </div>
        )}

        {error && (
          <div className="error-card">
            <AlertCircle size={44} color="#9b2318" />
            <h1>Fehler</h1>
            <p>{error}</p>
            <button
              className="auth-btn-primary"
              onClick={() => router.push('/login')}
            >
              Zur Anmeldung
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
