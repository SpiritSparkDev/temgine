import dynamic from 'next/dynamic';

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

export default function Admin() {
  return <AdminPageClient />;
}
