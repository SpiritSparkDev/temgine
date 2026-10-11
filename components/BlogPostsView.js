import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Search, ChevronLeft, FileText, Rss } from '../lib/muiIcons';
import BlogPostEditor from './BlogPostEditor';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';
import { applyPostQuery, BUILTIN_SORT_FIELDS } from '../lib/blogPostQuery';

const STATUS_LABELS = {
  DRAFT: 'Entwurf',
  REVIEW: 'In Prüfung',
  APPROVED: 'Freigegeben',
  PUBLISHED: 'Veröffentlicht',
  SCHEDULED: 'Geplant',
};

const STATUS_COLORS = {
  DRAFT:     { bg: 'rgba(100,116,139,.15)', text: '#64748b', border: 'rgba(100,116,139,.3)' },
  REVIEW:    { bg: 'rgba(245,158,11,.15)',  text: '#f59e0b', border: 'rgba(245,158,11,.3)' },
  APPROVED:  { bg: 'rgba(59,130,246,.15)',  text: '#3b82f6', border: 'rgba(59,130,246,.3)' },
  PUBLISHED: { bg: 'rgba(16,185,129,.15)',  text: '#10b981', border: 'rgba(16,185,129,.3)' },
  SCHEDULED: { bg: 'rgba(139,92,246,.15)',  text: '#8b5cf6', border: 'rgba(139,92,246,.3)' },
};

export default function BlogPostsView({ channel, onBack, showToast: parentShowToast, templates = [], embedded = false }) {
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  // '' = Standard des Kanals, sonst "<feld>:<asc|desc>" oder 'status'
  const [sortBy, setSortBy] = useState('');
  const [archiveFilter, setArchiveFilter] = useState('exclude');
  const [timeFilter, setTimeFilter] = useState('');
  const [fieldNames, setFieldNames] = useState([]);
  const [editingPost, setEditingPost] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = parentShowToast || ((msg, type) => setToast({ message: msg, type }));

  useEffect(() => { loadPosts(); }, [channel.id, statusFilter]);

  async function loadPosts() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ channelId: channel.id, limit: '5000', archive: 'include' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/blog/posts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
        setTotal(data.total || 0);
        setFieldNames(Array.isArray(data.fieldNames) ? data.fieldNames : []);
      } else {
        showToast('Fehler beim Laden der Beiträge', 'error');
      }
    } catch {
      showToast('Netzwerkfehler', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePost(data) {
    const isNew = !data.id;
    const res = await fetch(
      isNew ? '/api/blog/posts' : `/api/blog/posts/${data.id}`,
      { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, channelId: channel.id }) }
    );
    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Fehler beim Speichern', 'error');
      return false;
    }
    showToast(isNew ? 'Beitrag erstellt' : 'Beitrag gespeichert', 'success');
    setEditingPost(null);
    await loadPosts();
    return true;
  }

  async function handleToggleArchive(post) {
    const res = await fetch(`/api/blog/posts/${post.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !post.archived }),
    });
    if (res.ok) {
      showToast(post.archived ? 'Beitrag aus dem Archiv geholt' : 'Beitrag archiviert', 'success');
      setPosts(prev => prev.map(p => (p.id === post.id ? { ...p, archived: !post.archived } : p)));
    } else {
      showToast('Fehler beim Archivieren', 'error');
    }
  }

  async function handleDeletePost(post) {
    const res = await fetch(`/api/blog/posts/${post.id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Beitrag gelöscht', 'success');
      await loadPosts();
    } else {
      showToast('Fehler beim Löschen', 'error');
    }
    setConfirmDelete(null);
  }

  // Datumsfeld für „kommende/vergangene“: das gewählte Sortierfeld, sonst
  // das des Kanals, sonst das Veröffentlichungsdatum.
  const [sortFieldSel, sortDirSel] = sortBy && sortBy !== 'status' ? sortBy.split(':') : [];
  const timeField = sortFieldSel || channel.sortField || 'publishedAt';

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const searched = posts.filter(p => !q || String(p.title || '').toLowerCase().includes(q));
    const query = {
      sort: sortFieldSel || channel.sortField || 'createdAt',
      dir: sortDirSel || (sortFieldSel ? 'desc' : (channel.sortField ? (channel.sortDir || 'desc') : 'desc')),
      archive: archiveFilter,
      ...(timeFilter === 'upcoming' ? { upcoming: timeField } : {}),
      ...(timeFilter === 'past' ? { past: timeField } : {}),
    };
    const list = applyPostQuery(searched, query);
    if (sortBy === 'status') {
      const statusRank = { DRAFT: 0, REVIEW: 1, APPROVED: 2, SCHEDULED: 3, PUBLISHED: 4 };
      list.sort((a, b) => (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99));
    }
    return list;
  }, [posts, searchQuery, sortBy, sortFieldSel, sortDirSel, archiveFilter, timeFilter, timeField, channel.sortField, channel.sortDir]);

  const archivedCount = posts.filter(p => p.archived).length;

  if (editingPost !== null) {
    const readingTpl = templates.find(t => t.name === channel.templateReading);
    return (
      <BlogPostEditor
        post={editingPost === 'new' ? null : editingPost}
        channelSlug={channel.slug}
        channelName={channel.name}
        readingTemplateCode={readingTpl?.code}
        onSave={handleSavePost}
        onBack={() => setEditingPost(null)}
        showToast={showToast}
      />
    );
  }

  return (
    <div className={`blog-posts-view${embedded ? ' blog-posts-view--embedded' : ''}`}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {confirmDelete && (
        <ConfirmDialog
          message={`Beitrag „${confirmDelete.title}" löschen?`}
          onConfirm={() => handleDeletePost(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Top bar */}
      {!embedded && (
        <div className="blog-topbar">
          <button className="blog-topbar__back" onClick={onBack} title="Zurück zur Kanalübersicht">
            <ChevronLeft size={16} />
          </button>
          <div className="blog-topbar__breadcrumb">
            <Rss size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            <span className="blog-topbar__channel">{channel.name}</span>
            <span className="blog-topbar__sep">/</span>
            <span className="blog-topbar__slug">/{channel.slug}</span>
          </div>
          <div className="blog-topbar__actions">
            <button className="btn-modern" onClick={() => setEditingPost('new')}>
              <Plus size={14} /> Neuer Beitrag
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="blog-toolbar">
        {embedded && (
          <div className="blog-toolbar__count" style={{ marginRight: 8 }}>
            {channel.name} (/{channel.slug})
          </div>
        )}
        <div className="blog-search">
          <Search size={13} className="blog-search__icon" />
          <input
            className="blog-search__input"
            placeholder="Beiträge suchen…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="blog-filter-select"
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          title="Sortierung"
        >
          <option value="">{channel.sortField ? `Standard des Kanals (${channel.sortField})` : 'Neueste zuerst'}</option>
          {BUILTIN_SORT_FIELDS.map(f => (
            <React.Fragment key={f.value}>
              <option value={`${f.value}:desc`}>{f.label} ↓</option>
              <option value={`${f.value}:asc`}>{f.label} ↑</option>
            </React.Fragment>
          ))}
          {fieldNames.length > 0 && (
            <optgroup label="Template-Felder">
              {fieldNames.map(n => (
                <React.Fragment key={n}>
                  <option value={`${n}:asc`}>{n} ↑</option>
                  <option value={`${n}:desc`}>{n} ↓</option>
                </React.Fragment>
              ))}
            </optgroup>
          )}
          <option value="status">Status</option>
        </select>
        <select
          className="blog-filter-select"
          value={timeFilter}
          onChange={e => setTimeFilter(e.target.value)}
          title={`Zeitraum nach Feld „${timeField}“`}
        >
          <option value="">Alle Zeiträume</option>
          <option value="upcoming">Kommende ({timeField} ab heute)</option>
          <option value="past">Vergangene ({timeField} vor heute)</option>
        </select>
        <select
          className="blog-filter-select"
          value={archiveFilter}
          onChange={e => setArchiveFilter(e.target.value)}
          title="Archiv"
        >
          <option value="exclude">Ohne Archiv</option>
          <option value="only">Nur Archiv ({archivedCount})</option>
          <option value="include">Alle inkl. Archiv</option>
        </select>
        <select
          className="blog-filter-select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">Alle Status</option>
          {Object.entries(STATUS_LABELS).map(([val, lbl]) => (
            <option key={val} value={val}>{lbl}</option>
          ))}
        </select>
        {!loading && (
          <span className="blog-toolbar__count">
            {filteredAndSorted.length} / {total} Beiträge
          </span>
        )}
        {embedded && (
          <button className="btn-modern" onClick={() => setEditingPost('new')}>
            <Plus size={14} /> Neuer Beitrag
          </button>
        )}
      </div>

      {/* Body */}
      <div className="blog-posts-body">
        {loading ? (
          <div className="blog-posts-loading">
            <FileText size={18} style={{ opacity: 0.35 }} /> Lade Beiträge…
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="blog-posts-empty">
            <FileText size={48} />
            <strong style={{ fontSize: 15, color: 'var(--text-primary)' }}>
              {searchQuery || posts.length > 0 ? 'Keine Treffer' : 'Noch keine Beiträge'}
            </strong>
            <p>{searchQuery ? `Keine Beiträge für „${searchQuery}" gefunden.` : posts.length > 0 ? 'Kein Beitrag passt zu den gewählten Filtern.' : 'Erstelle deinen ersten Beitrag.'}</p>
            {!searchQuery && posts.length === 0 && (
              <button className="btn-modern" onClick={() => setEditingPost('new')}>
                <Plus size={14} /> Ersten Beitrag erstellen
              </button>
            )}
          </div>
        ) : (
          filteredAndSorted.map(post => <PostRow key={post.id} post={post} channel={channel} onOpen={() => setEditingPost(post)} onToggleArchive={e => { e.stopPropagation(); handleToggleArchive(post); }} onDelete={e => { e.stopPropagation(); setConfirmDelete(post); }} />)
        )}
      </div>
    </div>
  );
}

function PostRow({ post, channel, onOpen, onToggleArchive, onDelete }) {
  const sc = STATUS_COLORS[post.status] || STATUS_COLORS.DRAFT;
  const publishDate = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
    : post.publishAt
      ? `Geplant: ${new Date(post.publishAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}`
      : null;

  return (
    <div className="blog-post-row" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpen()}>

      {/* Cover thumbnail */}
      {post.coverImage ? (
        <img className="blog-post-row__cover" src={post.coverImage} alt="" />
      ) : (
        <div className="blog-post-row__cover-placeholder">
          <FileText size={18} />
        </div>
      )}

      {/* Info */}
      <div className="blog-post-row__info">
        <div className="blog-post-row__title">{post.title}</div>
        <div className="blog-post-row__meta">
          <span className="blog-post-row__slug">/{channel.slug}/{post.slug}</span>
          {post.author && (
            <>
              <span className="blog-post-row__meta-sep" />
              <span>{post.author}</span>
            </>
          )}
          {publishDate && (
            <>
              <span className="blog-post-row__meta-sep" />
              <span>{publishDate}</span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="blog-post-row__actions" onClick={e => e.stopPropagation()}>
        <span
          className="blog-status-badge"
          style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}
        >
          {STATUS_LABELS[post.status]}
        </span>
        {post.archived && (
          <span className="blog-status-badge" style={{ background: 'rgba(100,116,139,.15)', color: '#64748b', border: '1px solid rgba(100,116,139,.3)' }}>
            Archiv
          </span>
        )}
        <button
          className="icon-btn-small"
          title={post.archived ? 'Aus dem Archiv holen (wieder in Listen anzeigen)' : 'Ins Archiv legen (bleibt per Link erreichbar, erscheint nicht mehr in Listen)'}
          onClick={onToggleArchive}
          style={{ fontSize: 12, padding: '0 6px', width: 'auto' }}
        >
          {post.archived ? 'Zurückholen' : 'Archivieren'}
        </button>
        <button
          className="icon-btn-small"
          title="Löschen"
          style={{ color: 'var(--danger-primary)' }}
          onClick={onDelete}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
