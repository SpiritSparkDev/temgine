import React, { useEffect, useState } from 'react';

// Galerie-Liste einmal pro Editor-Sitzung laden (GET /api/picgine/galleries → Picgine
// GET /api/v1/galleries: [{ id, slug, title, parentSlug, accessMode }]).
let galleriesPromise = null;
function loadGalleries() {
  if (!galleriesPromise) {
    galleriesPromise = fetch('/api/picgine/galleries')
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return Array.isArray(data) ? data : [];
      })
      .catch((e) => {
        galleriesPromise = null; // beim nächsten Öffnen erneut versuchen
        throw e;
      });
  }
  return galleriesPromise;
}

// Baum (über parentSlug) in Anzeige-Reihenfolge mit Tiefe abflachen.
export function flattenGalleryTree(galleries) {
  const bySlug = new Set(galleries.map((g) => g.slug));
  const childrenOf = {};
  for (const g of galleries) {
    const parent = g.parentSlug && bySlug.has(g.parentSlug) ? g.parentSlug : '';
    (childrenOf[parent] = childrenOf[parent] || []).push(g);
  }
  const out = [];
  const walk = (parent, depth) => {
    for (const g of childrenOf[parent] || []) {
      out.push({ ...g, depth });
      walk(g.slug, depth + 1);
    }
  };
  walk('', 0);
  return out;
}

export default function PicgineGallerySelect({ value, onChange, label }) {
  const [options, setOptions] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    loadGalleries()
      .then((list) => { if (active) setOptions(flattenGalleryTree(list)); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);

  const known = !value || !options || options.some((g) => g.slug === value);

  return (
    <>
      <select
        className="block-template-select"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        aria-label={label}
      >
        <option value="">{options ? '-- Galerie wählen --' : (error ? '-- Galerien nicht ladbar --' : 'Lädt…')}</option>
        {!known && <option value={value}>{value} (nicht gefunden)</option>}
        {(options || []).map((g) => (
          <option key={g.slug} value={g.slug}>
            {`${'  '.repeat(g.depth)}${g.accessMode && g.accessMode !== 'public' ? '🔒 ' : ''}${g.title || g.slug}`}
          </option>
        ))}
      </select>
      {error && <small style={{ color: '#b91c1c' }}>{error}</small>}
    </>
  );
}
