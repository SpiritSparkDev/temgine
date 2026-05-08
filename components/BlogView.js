import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Rss, FileText, ChevronRight, CheckCircle2, Circle, Layout } from '../lib/muiIcons';
import BlogPostsView from './BlogPostsView';
import BlogChannelEditor from './BlogChannelEditor';
import BlogTemplateEditor from './BlogTemplateEditor';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';

const SLOT_LABELS = {
  templateDetailPreview: 'Detail-Vorschau',
  templateSimplePreview: 'Einfache Vorschau',
  templateArchiveEntry: 'Archiv-Eintrag',
  templateReading: 'Leseseite',
};

export default function BlogView({ showToast: parentShowToast }) {
  const [activeTab, setActiveTab] = useState('channels');
  const [channels, setChannels] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [editingChannel, setEditingChannel] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = parentShowToast || ((msg, type) => setToast({ message: msg, type }));

  useEffect(() => { loadChannels(); loadTemplates(); }, []);

  async function loadTemplates() {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : []);
      }
    } catch {}
  }

  async function loadChannels() {
    setLoading(true);
    try {
      const res = await fetch('/api/blog/channels');
      if (res.ok) setChannels(await res.json());
      else showToast('Fehler beim Laden der Kanäle', 'error');
    } catch {
      showToast('Netzwerkfehler', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveChannel(data) {
    const isNew = !data.id;
    const res = await fetch(
      isNew ? '/api/blog/channels' : `/api/blog/channels/${data.id}`,
      { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
    );
    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Fehler beim Speichern', 'error');
      return false;
    }
    showToast(isNew ? 'Kanal erstellt' : 'Kanal gespeichert', 'success');
    setEditingChannel(null);
    await loadChannels();
    return true;
  }

  async function handleDeleteChannel(channel) {
    const res = await fetch(`/api/blog/channels/${channel.id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Kanal gelöscht', 'success');
      if (selectedChannel?.id === channel.id) setSelectedChannel(null);
      await loadChannels();
    } else {
      showToast('Fehler beim Löschen', 'error');
    }
    setConfirmDelete(null);
  }

  if (selectedChannel) {
    return (
      <BlogPostsView
        channel={selectedChannel}
        templates={templates}
        onBack={() => setSelectedChannel(null)}
        showToast={showToast}
      />
    );
  }

  if (activeTab === 'templates') {
    return (
      <BlogTemplateEditor
        templates={templates}
        showToast={showToast}
        onTabChange={setActiveTab}
      />
    );
  }

  return (
    <div className="blog-view">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {confirmDelete && (
        <ConfirmDialog
          message={`Kanal „${confirmDelete.name}" und alle ${confirmDelete._count?.posts ?? 0} Beiträge unwiderruflich löschen?`}
          onConfirm={() => handleDeleteChannel(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {editingChannel !== null && (
        <BlogChannelEditor
          channel={editingChannel === 'new' ? null : editingChannel}
          templates={templates}
          onSave={handleSaveChannel}
          onClose={() => setEditingChannel(null)}
        />
      )}

      {/* Header */}
      <div className="blog-view__header">
        <h2 className="blog-view__title">
          <Rss size={20} />
          Blog / News
        </h2>
        <div className="blog-view__tabs">
          <button
            className={`blog-view__tab${activeTab === 'channels' ? ' blog-view__tab--active' : ''}`}
            onClick={() => setActiveTab('channels')}
          >
            <Rss size={13} /> Kanäle
          </button>
          <button
            className={`blog-view__tab${activeTab === 'templates' ? ' blog-view__tab--active' : ''}`}
            onClick={() => setActiveTab('templates')}
          >
            <Layout size={13} /> Templates
          </button>
        </div>
        <button className="btn-modern" onClick={() => setEditingChannel('new')}>
          <Plus size={15} /> Neuer Kanal
        </button>
      </div>

      {/* Body */}
      <div className="blog-view__body">
        {loading ? (
          <div className="blog-loading">
            <Rss size={18} style={{ opacity: 0.4 }} />
            Lade Kanäle…
          </div>
        ) : channels.length === 0 ? (
          <div className="blog-empty">
            <Rss size={48} />
            <strong style={{ fontSize: 16, color: 'var(--text-primary)' }}>Noch keine Kanäle</strong>
            <p>Erstelle deinen ersten Blog- oder News-Kanal.</p>
            <button className="btn-modern" onClick={() => setEditingChannel('new')}>
              <Plus size={15} /> Ersten Kanal erstellen
            </button>
          </div>
        ) : (
          <div className="channel-grid">
            {channels.map(ch => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                onOpen={() => setSelectedChannel(ch)}
                onEdit={(e) => { e.stopPropagation(); setEditingChannel(ch); }}
                onDelete={(e) => { e.stopPropagation(); setConfirmDelete(ch); }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelCard({ channel: ch, onOpen, onEdit, onDelete }) {
  const postCount = ch._count?.posts ?? 0;

  return (
    <div className="channel-card" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="channel-card__accent" />
      <div className="channel-card__body">
        {/* Name + post count */}
        <div className="channel-card__name-row">
          <span className="channel-card__name">
            <Rss size={14} />
            {ch.name}
          </span>
          <span className="channel-card__count">
            <FileText size={11} />
            {postCount} {postCount === 1 ? 'Beitrag' : 'Beiträge'}
          </span>
        </div>

        {/* Slug */}
        <div className="channel-card__slug">/{ch.slug}</div>

        {/* Description */}
        {ch.description && (
          <div className="channel-card__description">{ch.description}</div>
        )}

        {/* Template slots */}
        <div className="channel-card__templates">
          {Object.entries(SLOT_LABELS).map(([key, label]) => {
            const isSet = !!ch[key];
            return (
              <span key={key} className={`channel-card__chip ${isSet ? 'channel-card__chip--set' : 'channel-card__chip--unset'}`}>
                {isSet ? <CheckCircle2 size={10} /> : <Circle size={10} />}
                {label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Action bar */}
      <div className="channel-card__actions" onClick={(e) => e.stopPropagation()}>
        <span className="channel-card__open-hint">
          <ChevronRight size={12} /> Beiträge anzeigen
        </span>
        <button
          className="icon-btn-small"
          title="Kanal bearbeiten"
          onClick={onEdit}
        >
          <Edit2 size={13} />
        </button>
        <button
          className="icon-btn-small"
          title="Kanal löschen"
          style={{ color: 'var(--danger-primary)' }}
          onClick={onDelete}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
