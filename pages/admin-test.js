import { useSession } from 'next-auth/react';

export default function AdminTest() {
  const { data: session } = useSession();

  if (!session) {
    return <div>Not logged in</div>;
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Admin Test Page</h1>
      <p>User: {session.user.email}</p>
      <p>Dieser Page funktioniert — Das bedeutet die Komponenten in /admin sind das Problem.</p>
    </div>
  );
}
