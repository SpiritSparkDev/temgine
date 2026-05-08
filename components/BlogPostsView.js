import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Search, ChevronLeft, FileText, Rss } from '../lib/muiIcons';
import BlogPostEditor from './BlogPostEditor';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';

const STATUS_LABELS = {
  DRAFT: 'Entwurf',
  REVIEW: 'Review',
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

export default function BlogPostsView({ channel, onBack, showToast: parentShowToast, templates = [] }) {
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingPost, setEditingPost] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = parentShowToast || ((msg, type) => setToast({ message: msg, type }));

  useEffect(() => { loadPosts(); }, [channel.id, statusFilter]);

  async function loadPosts() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ channelId: channel.id, limit: '100' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/blog/posts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
        setTotal(data.total || 0);
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

  const filtered = posts.filter(p =>
    !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
    <div className="blog-posts-view">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {confirmDelete && (
        <ConfirmDialog
          message={`Beitrag „${confirmDelete.title}" löschen?`}
          onConfirm={() => handleDeletePost(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Top bar */}
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

      {/* Toolbar */}
      <div className="blog-toolbar">
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
            {filtered.length} / {total} Beiträge
          </span>
        )}
      </div>

      {/* Body */}
      <div className="blog-posts-body">
        {loading ? (
          <div className="blog-posts-loading">
            <FileText size={18} style={{ opacity: 0.35 }} /> Lade Beiträge…
          </div>
        ) : filtered.length === 0 ? (
          <div className="blog-posts-empty">
            <FileText size={48} />
            <strong style={{ fontSize: 15, color: 'var(--text-primary)' }}>
              {searchQuery ? 'Keine Treffer' : 'Noch keine Beiträge'}
            </strong>
            <p>{searchQuery ? `Keine Beiträge für „${searchQuery}" gefunden.` : 'Erstelle deinen ersten Beitrag.'}</p>
            {!searchQuery && (
              <button className="btn-modern" onClick={() => setEditingPost('new')}>
                <Plus size={14} /> Ersten Beitrag erstellen
              </button>
            )}
          </div>
        ) : (
          filtered.map(post => <PostRow key={post.id} post={post} channel={channel} onOpen={() => setEditingPost(post)} onDelete={e => { e.stopPropagation(); setConfirmDelete(post); }} />)
        )}
      </div>
    </div>
  );
}

function PostRow({ post, channel, onOpen, onDelete }) {
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
