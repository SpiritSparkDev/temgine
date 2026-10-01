import dynamic from 'next/dynamic';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './api/auth/[...nextauth]';
import { prisma } from '../lib/prisma';
import { PERMISSIONS } from '../lib/auth';

const RepairView = dynamic(() => import('../components/RepairView'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '18px', color: '#666' }}>
      Reparatur-Werkzeug wird geladen...
    </div>
  ),
});

// Eigenständige Seite (domain.tld/repair), unabhängig von AdminPageClient — damit
// sie auch dann erreichbar/benutzbar ist, wenn der Seitenbaum so beschädigt ist,
// dass das Laden der großen Admin-SPA Probleme macht. ADMIN-only, da die hier
// angebotenen Fixes direkt und ungeprüft am Rohdatenbaum schreiben.
export async function getServerSideProps(context) {
  if (process.env.NEXT_PUBLIC_DEV_MODE === 'true') {
    return { props: {} };
  }

  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) {
    return { redirect: { destination: '/login?callbackUrl=%2Frepair', permanent: false } };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  if (!user || !PERMISSIONS.SETTINGS_EDIT.includes(user.role)) {
    return { redirect: { destination: '/admin', permanent: false } };
  }

  return { props: {} };
}

export default function Repair() {
  return <RepairView />;
}
