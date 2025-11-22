import React from 'react';

export default function DashboardView({ templateList, pages, snippets, setView }) {
    return (
        <div className="admin-editor-area">
            <div style={{ padding: 40 }}>
                <h2 style={{ marginBottom: 30 }}>Dashboard</h2>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 40 }}>
                        <div style={{ background: 'white', padding: 30, borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                            <h3 style={{ fontSize: '2rem', color: '#667eea', marginBottom: 10 }}>{templateList.length}</h3>
                            <p style={{ color: '#666', fontSize: '1.1rem' }}>Templates</p>
                        </div>
                        <div style={{ background: 'white', padding: 30, borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                            <h3 style={{ fontSize: '2rem', color: '#667eea', marginBottom: 10 }}>{pages.length}</h3>
                            <p style={{ color: '#666', fontSize: '1.1rem' }}>Seiten</p>
                        </div>
                        <div style={{ background: 'white', padding: 30, borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                            <h3 style={{ fontSize: '2rem', color: '#667eea', marginBottom: 10 }}>{snippets.length}</h3>
                            <p style={{ color: '#666', fontSize: '1.1rem' }}>Snippets</p>
                        </div>
                    </div>

                    <div style={{padding: 20, borderRadius: 10 }}>
                        <h4 style={{ marginBottom: 15 }}>Schnellzugriff</h4>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button className="primary" onClick={() => setView('templates')}>Neues Template erstellen</button>
                            <button className="primary" onClick={() => setView('pages')}>Neue Seite erstellen</button>
                            <button className="primary" onClick={() => setView('snippets')}>Snippets verwalten</button>
                        </div>
                    </div>
                </div>

                <div style={{ background: 'white', padding: 30, borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: 20 }}>
                    <h3 style={{ marginBottom: 20, fontSize: '1.5rem' }}>Veröffentlichte Seiten</h3>
                    {pages.length > 0 ? (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {pages.map(page => (
                                <li key={page.id} style={{ padding: '15px 0', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <strong style={{ fontSize: '1.1rem' }}>{page.title}</strong>
                                        <div style={{ color: '#666', fontSize: '0.9rem', marginTop: 5 }}>
                                            Template: {page.template || 'Standard'} • Blöcke: {(page.blocks || []).length}
                                        </div>
                                    </div>
                                    <a
                                        href={`/${page.slug}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            background: '#667eea',
                                            color: 'white',
                                            padding: '8px 20px',
                                            borderRadius: 5,
                                            textDecoration: 'none',
                                            fontSize: '0.9rem',
                                            fontWeight: 'bold'
                                        }}
                                    >
                                        Ansehen →
                                    </a>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p style={{ color: '#666' }}>Noch keine Seiten erstellt.</p>
                    )}
                </div>


            </div>
        </div>
    );
}
