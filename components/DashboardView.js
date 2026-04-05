import React, { useState, useEffect } from 'react';
import {
    Activity,
    AlertCircle,
    ArrowRight,
    CheckCircle,
    Database,
    Download,
    FileText,
    LayoutTemplate,
    RefreshCw,
    Upload,
    XCircle,
} from 'lucide-react';

export default function DashboardView({ templateList, pages, setView, showToast }) {
    const [dbHealth, setDbHealth] = useState(null);
    const [dbLoading, setDbLoading] = useState(true);

    const blockTemplateCount = templateList.filter(template => template.type === 'BLOCK').length;
    const recentPages = pages.slice(0, 6);

    const dbStatusTone = dbLoading ? 'pending' : dbHealth?.connected ? 'success' : 'danger';
    const dbStatusLabel = dbLoading ? 'Prüfung läuft' : dbHealth?.connected ? 'Verbunden' : 'Getrennt';
    const dbStatusMeta = dbLoading
        ? 'Die Erreichbarkeit der Datenbank wird geprüft.'
        : dbHealth?.connected
            ? `${dbHealth.tables || 0} Tabellen verfügbar`
            : (dbHealth?.error || 'Keine Verbindung zur Datenbank');

    const stats = [
        {
            key: 'templates',
            title: 'Templates',
            value: templateList.length,
            meta: `${blockTemplateCount} Block-Templates`,
            icon: LayoutTemplate,
            accent: 'primary',
        },
        {
            key: 'pages',
            title: 'Seiten',
            value: pages.length,
            meta: pages.length > 0 ? `${pages.filter(page => (page.blocks || []).length > 0).length} mit Inhalt` : 'Noch keine Inhalte angelegt',
            icon: FileText,
            accent: 'secondary',
        },

        {
            key: 'database',
            title: 'Datenbank',
            value: dbStatusLabel,
            meta: dbStatusMeta,
            icon: Database,
            accent: dbStatusTone,
        },
    ];

    const quickActions = [
        {
            key: 'templates',
            title: 'Template anlegen',
            description: 'Neue Site- oder Block-Templates direkt vorbereiten.',
            icon: LayoutTemplate,
            onClick: () => setView('templates'),
        },
        {
            key: 'pages',
            title: 'Seite erstellen',
            description: 'Neue Inhalte anlegen und mit Templates verbinden.',
            icon: FileText,
            onClick: () => setView('pages'),
        },

    ];

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

    // Export DB as JSON and trigger a download
    async function exportDatabase() {
        try {
            const res = await fetch('/api/admin/export')
            if (!res.ok) throw new Error('Export fehlgeschlagen')
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `temgine-export-${new Date().toISOString()}.json`
            a.click()
            URL.revokeObjectURL(url)
            if (typeof showToast === 'function') showToast('Export erfolgreich', 'success')
        } catch (e) {
            console.error(e)
            if (typeof showToast === 'function') showToast('Export fehlgeschlagen', 'error')
        }
    }

    // Handle file selected from import input
    async function handleImportFile(e) {
        const f = e.target.files && e.target.files[0]
        if (!f) return
        try {
            const text = await f.text()
            const json = JSON.parse(text)
            const res = await fetch('/api/admin/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json) })
            if (!res.ok) throw new Error('Import fehlgeschlagen')
            if (typeof showToast === 'function') showToast('Import erfolgreich', 'success')
            // reload to reflect imported data
            setTimeout(() => window.location.reload(), 500)
        } catch (err) {
            console.error('Import error', err)
            if (typeof showToast === 'function') showToast('Import fehlgeschlagen: ' + (err.message || String(err)), 'error')
        } finally {
            // clear file input
            try { document.getElementById('db-import-input').value = '' } catch (e) {}
        }
    }

    return (
        <div className="admin-editor-area">
            <div className="dashboard-shell">
                <section className="dashboard-hero">
                    <div className="dashboard-hero-copy">
                        <span className="dashboard-eyebrow">Admin Dashboard</span>
                        <h2>Dein Content-Hub auf einen Blick</h2>
                        <p>
                            Schnellzugriff auf Templates, Seiten und Systemstatus.
                            Das Dashboard priorisiert jetzt die nächsten sinnvollen Schritte statt nur Rohzahlen.
                        </p>
                        <div className="dashboard-hero-tags">
                            <span className="dashboard-tag">{blockTemplateCount} Block-Templates</span>
                            <span className="dashboard-tag">{pages.length} Seiten gesamt</span>
                        </div>
                    </div>

                    <div className="dashboard-hero-actions">
                        <button className="dashboard-action dashboard-action-primary" onClick={() => setView('pages')}>
                            <FileText size={18} />
                            Seite erstellen
                        </button>
                        <button className="dashboard-action" onClick={() => setView('templates')}>
                            <LayoutTemplate size={18} />
                            Templates öffnen
                        </button>
                        <button className="dashboard-action" onClick={checkDatabaseHealth}>
                            <RefreshCw size={18} className={dbLoading ? 'dashboard-spin' : ''} />
                            Datenbank prüfen
                        </button>
                    </div>
                </section>

                <section className="dashboard-stats-grid">
                    {stats.map(stat => {
                        const Icon = stat.icon;
                        return (
                            <article key={stat.key} className={`dashboard-stat-card accent-${stat.accent}`}>
                                <div className="dashboard-stat-header">
                                    <span className="dashboard-stat-icon">
                                        <Icon size={20} />
                                    </span>
                                    <span className="dashboard-stat-title">{stat.title}</span>
                                </div>
                                <div className="dashboard-stat-value">{stat.value}</div>
                                <p className="dashboard-stat-meta">{stat.meta}</p>
                                {stat.key === 'database' && !dbLoading && dbHealth?.connected && (
                                    <div className="dashboard-stat-inline-status success">
                                        <CheckCircle size={16} />
                                        Letzter Check: {new Date(dbHealth.timestamp).toLocaleTimeString('de-DE')}
                                    </div>
                                )}
                                {stat.key === 'database' && !dbLoading && !dbHealth?.connected && (
                                    <div className="dashboard-stat-inline-status danger">
                                        <XCircle size={16} />
                                        Verbindung prüfen
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </section>

                <section className="dashboard-content-grid">
                    <article className="dashboard-panel dashboard-panel-wide">
                        <div className="dashboard-panel-head">
                            <div>
                                <span className="dashboard-panel-kicker">Schnellzugriff</span>
                                <h3>Häufige Aufgaben</h3>
                            </div>
                            <span className="dashboard-panel-note">Direkte Einstiege für den Redaktionsalltag</span>
                        </div>

                        <div className="dashboard-quick-grid">
                            {quickActions.map(action => {
                                const Icon = action.icon;
                                return (
                                    <button key={action.key} className="dashboard-quick-card" onClick={action.onClick}>
                                        <span className="dashboard-quick-icon">
                                            <Icon size={20} />
                                        </span>
                                        <span className="dashboard-quick-content">
                                            <strong>{action.title}</strong>
                                            <span>{action.description}</span>
                                        </span>
                                        <ArrowRight size={18} className="dashboard-quick-arrow" />
                                    </button>
                                );
                            })}
                        </div>

                        <div className="dashboard-utility-actions">
                            <button className="dashboard-action" onClick={exportDatabase} title="Exportiere Datenbank als JSON">
                                <Download size={18} />
                                Export DB
                            </button>
                            <label className="dashboard-action" htmlFor="db-import-input">
                                <Upload size={18} />
                                Import DB
                                <input id="db-import-input" type="file" accept="application/json" className="dashboard-hidden-input" onChange={(e) => handleImportFile(e)} />
                            </label>
                        </div>
                    </article>

                    <article className="dashboard-panel">
                        <div className="dashboard-panel-head">
                            <div>
                                <span className="dashboard-panel-kicker">System</span>
                                <h3>Datenbankstatus</h3>
                            </div>
                            <button className="dashboard-mini-action" onClick={checkDatabaseHealth}>
                                Neu prüfen
                            </button>
                        </div>

                        <div className={`dashboard-system-card tone-${dbStatusTone}`}>
                            <div className="dashboard-system-topline">
                                <div className="dashboard-system-icon-wrap">
                                    {dbLoading ? <Activity size={18} /> : dbHealth?.connected ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                                </div>
                                <div>
                                    <strong>{dbStatusLabel}</strong>
                                    <p>{dbStatusMeta}</p>
                                </div>
                            </div>

                            {dbHealth?.connected && !dbLoading && (
                                <dl className="dashboard-system-facts">
                                    <div>
                                        <dt>Verbindungszeit</dt>
                                        <dd>{dbHealth.connectionTime || 'n/a'}</dd>
                                    </div>
                                    <div>
                                        <dt>Tabellen</dt>
                                        <dd>{dbHealth.tables ?? 'n/a'}</dd>
                                    </div>
                                    <div>
                                        <dt>Letzter Check</dt>
                                        <dd>{new Date(dbHealth.timestamp).toLocaleTimeString('de-DE')}</dd>
                                    </div>
                                </dl>
                            )}
                        </div>
                    </article>
                </section>

                <section className="dashboard-content-grid dashboard-content-grid-bottom">
                    <article className="dashboard-panel dashboard-panel-wide">
                        <div className="dashboard-panel-head">
                            <div>
                                <span className="dashboard-panel-kicker">Content</span>
                                <h3>Veröffentlichte Seiten</h3>
                            </div>
                            <button className="dashboard-mini-action" onClick={() => setView('pages')}>
                                Seiten verwalten
                            </button>
                        </div>

                        {recentPages.length > 0 ? (
                            <div className="dashboard-page-list">
                                {recentPages.map(page => (
                                    <div key={page.id} className="dashboard-page-row">
                                        <div className="dashboard-page-meta">
                                            <strong>{page.title}</strong>
                                            <span>/{page.slug || ''}</span>
                                            <p>Template: {page.template || 'Standard'} · Blöcke: {(page.blocks || []).length}</p>
                                        </div>
                                        <div className="dashboard-page-actions">
                                            <button className="dashboard-mini-action" onClick={() => setView('pages')}>
                                                Bearbeiten
                                            </button>
                                            <a href={`/${page.slug}`} target="_blank" rel="noopener noreferrer" className="dashboard-link-button">
                                                Ansehen
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="dashboard-empty-state">
                                <FileText size={20} />
                                <div>
                                    <strong>Noch keine Seiten erstellt</strong>
                                    <p>Lege zuerst eine Seite an, um Inhalte zu veröffentlichen.</p>
                                </div>
                            </div>
                        )}
                    </article>

                    <article className="dashboard-panel">
                        <div className="dashboard-panel-head">
                            <div>
                                <span className="dashboard-panel-kicker">Empfehlung</span>
                                <h3>Nächste sinnvolle Schritte</h3>
                            </div>
                        </div>

                        <div className="dashboard-checklist">
                            <div className="dashboard-checklist-item">
                                <CheckCircle size={18} />
                                <div>
                                    <strong>Template-Basis prüfen</strong>
                                    <span>{templateList.length > 0 ? 'Die Template-Struktur ist vorhanden.' : 'Lege zuerst ein erstes Template an.'}</span>
                                </div>
                            </div>
                            <div className="dashboard-checklist-item">
                                <CheckCircle size={18} />
                                <div>
                                    <strong>Seitenbestand ausbauen</strong>
                                    <span>{pages.length > 0 ? 'Vorhandene Seiten können jetzt weiter verfeinert werden.' : 'Es fehlt noch mindestens eine veröffentlichbare Seite.'}</span>
                                </div>
                            </div>

                        </div>
                    </article>
                </section>
            </div>
        </div>
    );
}
