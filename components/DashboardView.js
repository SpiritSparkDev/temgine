import React, { useState, useEffect } from 'react';
import { Database, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export default function DashboardView({ templateList, pages, snippets, setView }) {
    const [dbHealth, setDbHealth] = useState(null);
    const [dbLoading, setDbLoading] = useState(true);

    useEffect(() => {
        checkDatabaseHealth();
        // Alle 30 Sekunden aktualisieren
        const interval = setInterval(checkDatabaseHealth, 30000);
        return () => clearInterval(interval);
    }, []);

    const checkDatabaseHealth = async () => {
        try {
            const res = await fetch('/api/database/health');
            const data = await res.json();
            setDbHealth(data);
        } catch (error) {
            setDbHealth({ status: 'error', connected: false, error: error.message });
        } finally {
            setDbLoading(false);
        }
    };

    return (
        <div className="admin-editor-area">
            <div style={{ padding: 40 }}>
                <h2 style={{ marginBottom: 30 }}>Dashboard</h2>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 40 }}>
                    <div style={{ background: 'var(--bg-secondary)', padding: 30, borderRadius: 10, boxShadow: '0 2px 8px var(--shadow)' }}>
                        <h3 style={{ fontSize: '2rem', color: '#667eea', marginBottom: 10 }}>{templateList.length}</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Templates</p>
                    </div>
                    <div style={{ background: 'var(--bg-secondary)', padding: 30, borderRadius: 10, boxShadow: '0 2px 8px var(--shadow)' }}>
                        <h3 style={{ fontSize: '2rem', color: '#667eea', marginBottom: 10 }}>{pages.length}</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Seiten</p>
                    </div>
                    <div style={{ background: 'var(--bg-secondary)', padding: 30, borderRadius: 10, boxShadow: '0 2px 8px var(--shadow)' }}>
                        <h3 style={{ fontSize: '2rem', color: '#667eea', marginBottom: 10 }}>{snippets.length}</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Snippets</p>
                    </div>

                    {/* Database Health Monitor */}
                    <div style={{ 
                        background: dbHealth?.connected ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', 
                        padding: 30, 
                        borderRadius: 10, 
                        boxShadow: '0 2px 8px var(--shadow)',
                        border: `2px solid ${dbHealth?.connected ? '#86efac' : '#fca5a5'}`
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15 }}>
                            <Database size={24} color={dbHealth?.connected ? '#22c55e' : '#ef4444'} />
                            <h4 style={{ margin: 0, fontSize: '1.1rem' }}>Database Status</h4>
                        </div>
                        {dbLoading ? (
                            <p style={{ color: 'var(--text-secondary)' }}>Überprüfe...</p>
                        ) : dbHealth?.connected ? (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <CheckCircle size={18} color="#22c55e" />
                                    <span style={{ fontWeight: 'bold', color: '#22c55e' }}>Verbunden</span>
                                </div>
                                <div style={{ fontSize: '0.85rem', color: '#666', lineHeight: 1.6 }}>
                                    <div>Verbindungszeit: {dbHealth.connectionTime}</div>
                                    <div>Tabellen: {dbHealth.tables}</div>
                                    <div style={{ fontSize: '0.75rem', marginTop: 8, opacity: 0.7 }}>
                                        Letzter Check: {new Date(dbHealth.timestamp).toLocaleTimeString('de-DE')}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <XCircle size={18} color="#ef4444" />
                                    <span style={{ fontWeight: 'bold', color: '#ef4444' }}>Getrennt</span>
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {dbHealth?.error || 'Keine Verbindung zur Datenbank'}
                                </div>
                            </div>
                        )}
                        <button 
                            onClick={checkDatabaseHealth}
                            style={{
                                marginTop: 15,
                                padding: '6px 12px',
                                fontSize: '0.85rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: 5,
                                background: 'var(--bg-secondary)',
                                cursor: 'pointer'
                            }}
                        >
                            Neu prüfen
                        </button>
                    </div>
                </div>

                <div style={{ background: 'var(--bg-secondary)', padding: 30, borderRadius: 10, boxShadow: '0 2px 8px var(--shadow)', marginBottom: 40 }}>
                    <h4 style={{ marginBottom: 15 }}>Schnellzugriff</h4>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button className="primary" onClick={() => setView('templates')}>Neues Template erstellen</button>
                        <button className="primary" onClick={() => setView('pages')}>Neue Seite erstellen</button>
                        <button className="primary" onClick={() => setView('navigation')}>Navigation bearbeiten</button>
                        <button className="primary" onClick={() => setView('snippets')}>Snippets verwalten</button>
                    </div>
                </div>

                <div style={{ background: 'var(--bg-secondary)', padding: 30, borderRadius: 10, boxShadow: '0 2px 8px var(--shadow)', marginBottom: 20 }}>
                    <h3 style={{ marginBottom: 20, fontSize: '1.5rem' }}>Veröffentlichte Seiten</h3>
                    {pages.length > 0 ? (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {pages.map(page => (
                                <li key={page.id} style={{ padding: '15px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <strong style={{ fontSize: '1.1rem' }}>{page.title}</strong>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 5 }}>
                                            Template: {page.template || 'Standard'} • Blöcke: {(page.blocks || []).length}
                                        </div>
                                    </div>
                                    <a
                                        href={`/${page.slug}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            background: 'var(--accent-primary)',
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
                        <p style={{ color: 'var(--text-secondary)' }}>Noch keine Seiten erstellt.</p>
                    )}
                </div>


            </div>
        </div>
    );
}
