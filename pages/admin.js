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
  // DEV_MODE: skip auth check entirely
  if (process.env.DEV_MODE === 'true') {
    return { props: {} };
  }

  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session) {
    return {
      redirect: {
        destination: '/login?callbackUrl=%2Fadmin',
        permanent: false,
      },
    };
  }

  return { props: {} };
}

export default function Admin() {
  return <AdminPageClient />;
}
