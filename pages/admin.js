import dynamic from 'next/dynamic';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './api/auth/[...nextauth]';

const AdminPageClient = dynamic(() => import('../components/AdminPageClient'), {
  ssr: false,
  loading: () => (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontSize: '18px',
      color: '#666'
    }}>
      Admin wird geladen...
    </div>
  )
});

export async function getServerSideProps(context) {
  console.log('[admin] getServerSideProps start', {
    url: context?.resolvedUrl,
    devMode: process.env.DEV_MODE === 'true',
  });

  // DEV_MODE: skip auth check entirely
  if (process.env.DEV_MODE === 'true') {
    console.log('[admin] getServerSideProps dev mode bypass');
    return { props: {} };
  }

  const session = await getServerSession(context.req, context.res, authOptions);

  console.log('[admin] getServerSideProps session', {
    hasSession: Boolean(session),
    user: session?.user?.email || session?.user?.name || null,
  });

  if (!session) {
    console.log('[admin] getServerSideProps redirecting to login');
    return {
      redirect: {
        destination: '/login?callbackUrl=%2Fadmin',
        permanent: false,
      },
    };
  }

  console.log('[admin] getServerSideProps returning props');
  return { props: {} };
}

export default function Admin() {
  return <AdminPageClient />;
}
