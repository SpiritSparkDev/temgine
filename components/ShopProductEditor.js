import React, { useState, useEffect } from 'react';
import { emptyForm, emptyFormat, emptyTier, emptyBundleItem, productToForm, formToPayload, TRANSLATION_FIELDS } from './shopFormUtils';

const input = { padding: '6px 8px', border: '1px solid var(--border-color)', borderRadius: 6, background: 'transparent', color: 'inherit', width: '100%', boxSizing: 'border-box' };
const field = { display: 'grid', gap: 4, marginBottom: 12 };
const sub = { border: '1px solid var(--border-color)', borderRadius: 6, padding: 10, marginBottom: 10 };

const formatBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Download-Dateien eines gespeicherten digitalen Formats: Liste, Upload (multipart), Löschen. */
function FormatFiles({ formatId, label, showToast }) {
  const [files, setFiles] = useState(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/shop/formats/${formatId}/files`;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(base);
        const d = await res.json().catch(() => ({}));
        if (live) setFiles(res.ok && Array.isArray(d.files) ? d.files : []);
      } catch (e) { if (live) setFiles([]); }
    })();
    return () => { live = false; };
  }, [base]);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(base, { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.file) throw new Error(d.error || 'Upload fehlgeschlagen');
      setFiles((l) => [...(l || []), d.file]);
    } catch (err) {
      showToast(err.message || 'Upload fehlgeschlagen', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (f) => {
    if (typeof window !== 'undefined' && window.confirm && !window.confirm(`Datei „${f.filename}“ löschen?`)) return;
    try {
      const res = await fetch(`${base}/${f.id}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Löschen fehlgeschlagen');
      setFiles((l) => l.filter((x) => x.id !== f.id));
    } catch (err) {
      showToast(err.message || 'Löschen fehlgeschlagen', 'error');
    }
  };

  return (
    <div style={sub}>
      <strong>Download-Dateien ({label || 'Format'})</strong>
      {files === null ? <p>Lade…</p> : files.length === 0 ? <p>Keine Dateien.</p> : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0' }}>
          {files.map((f) => (
            <li key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ flex: 1, wordBreak: 'break-all' }}>{f.filename} ({formatBytes(f.sizeBytes || 0)})</span>
              <button type="button" className="btn" aria-label={`Datei ${f.filename} löschen`} onClick={() => remove(f)}>Löschen</button>
            </li>
          ))}
        </ul>
      )}
      <label className="btn">{busy ? 'Lädt hoch…' : 'Datei hochladen'}
        <input type="file" aria-label={`Download-Datei hochladen (${label || 'Format'})`} onChange={upload} disabled={busy} style={{ display: 'none' }} />
      </label>
      <small style={{ display: 'block', marginTop: 4 }}>Max. 200 MB je Datei. Kunden erhalten nach der Zahlung zeitlich begrenzte Download-Links.</small>
    </div>
  );
}

/**
 * Formular für ein Shop-Produkt. product=null legt ein neues an (POST), sonst PUT.
 * Preise/MwSt werden als Euro/Prozent eingegeben und in Cent/bp gesendet (shopFormUtils).
 * catalog (optional) = Liste aller Admin-Produkte für Bündel-Auswahl und Empfehlungen; fehlt sie, wird sie geladen.
 */
export default function ShopProductEditor({ product, catalog, onSaved, onCancel, showToast }) {
  const [form, setForm] = useState(() => (product ? productToForm(product) : emptyForm()));
  const [errors, setErrors] = useState([]);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newImage, setNewImage] = useState('');
  const [others, setOthers] = useState(catalog || []);

  useEffect(() => {
    if (catalog) { setOthers(catalog); return undefined; }
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/shop/products');
        const d = await res.json().catch(() => ({}));
        if (live && res.ok && Array.isArray(d.products)) setOthers(d.products);
      } catch (e) { /* Auswahllisten bleiben leer */ }
    })();
    return () => { live = false; };
  }, [catalog]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setFormat = (key, patch) => setForm((f) => ({ ...f, formats: f.formats.map((x) => (x.key === key ? { ...x, ...patch } : x)) }));
  const setEn = (k, v) => setForm((f) => ({ ...f, en: { ...f.en, [k]: v } }));
  const updateList = (fmt, name, id, patch) => setFormat(fmt.key, { [name]: fmt[name].map((x) => (x.key === id ? { ...x, ...patch } : x)) });
  const dropFromList = (fmt, name, id) => setFormat(fmt.key, { [name]: fmt[name].filter((x) => x.key !== id) });
  const toggleRelated = (slug) => setForm((f) => ({ ...f, related: f.related.includes(slug) ? f.related.filter((x) => x !== slug) : [...f.related, slug] }));
  const isNew = form.id === undefined;

  // Bündel-Bestandteile: Nicht-Bündel-Formate anderer Produkte und die übrigen Formate dieses Produkts.
  const bundleOptions = (own) => {
    const list = [];
    others.forEach((p) => {
      if (p.id === form.id) return;
      (p.formats || []).forEach((x) => { if (!(x.bundleItems || []).length) list.push({ sku: x.sku, text: `${x.sku} – ${p.title} / ${x.label}` }); });
    });
    form.formats.forEach((x) => {
      if (x.key !== own.key && x.sku.trim() && x.bundle.length === 0) list.push({ sku: x.sku.trim(), text: `${x.sku.trim()} – ${form.title || 'dieses Produkt'} / ${x.label}` });
    });
    return list;
  };
  const relatedOptions = others.filter((p) => p.id !== form.id && p.slug !== form.slug);

  const moveImage = (i, d) => setForm((f) => {
    const images = [...f.images];
    const j = i + d;
    if (j < 0 || j >= images.length) return f;
    [images[i], images[j]] = [images[j], images[i]];
    return { ...f, images };
  });
  const removeImage = (i) => setForm((f) => ({ ...f, images: f.images.filter((_, x) => x !== i) }));
  const addImage = () => {
    const u = newImage.trim();
    if (!u) return;
    set('images', [...form.images, u]);
    setNewImage('');
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Bitte eine Bilddatei wählen', 'error'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/files?folder=shop', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      const url = data.file?.url || data.files?.[0]?.url;
      if (!res.ok || !url) throw new Error(data.error || 'Upload fehlgeschlagen');
      setForm((f) => ({ ...f, images: [...f.images, url] }));
    } catch (err) {
      showToast(err.message || 'Upload fehlgeschlagen', 'error');
    } finally {
      setUploading(false);
    }
  };

  const reload = async () => {
    const res = await fetch(`/api/shop/products/${form.id}`);
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.product) { setForm(productToForm(d.product)); setConflict(false); setErrors([]); }
    else showToast(d.error || 'Neu laden fehlgeschlagen', 'error');
  };

  const save = async (e) => {
    e.preventDefault();
    setConflict(false);
    const { payload, errors: errs } = formToPayload(form);
    setErrors(errs);
    if (errs.length) return;
    setSaving(true);
    try {
      const res = await fetch(isNew ? '/api/shop/products' : `/api/shop/products/${form.id}`, {
        method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.product) {
        showToast('Produkt gespeichert');
        setForm(productToForm(d.product));
        onSaved?.(d.product);
      } else if (res.status === 409 && d.code === 'CONFLICT') {
        setConflict(true);
      } else if (res.status === 422 && d.details?.errors?.length) {
        setErrors(d.details.errors);
      } else {
        setErrors([d.error || 'Fehler beim Speichern']);
      }
    } catch (err) {
      setErrors(['Fehler beim Speichern']);
    } finally {
      setSaving(false);
    }
  };

  const text = (label, k, extra = {}) => (
    <label style={field}>{label}
      <input style={input} value={form[k]} onChange={(e) => set(k, e.target.value)} {...extra} />
    </label>
  );

  return (
    <form onSubmit={save} noValidate style={{ maxWidth: 960 }}>
      <h3>{isNew ? 'Neues Produkt' : 'Produkt bearbeiten'}</h3>

      {conflict && (
        <div role="alert" style={{ border: '1px solid #c0392b', borderRadius: 6, padding: 10, marginBottom: 12 }}>
          Inzwischen geändert, bitte neu laden. <button type="button" className="btn" onClick={reload}>Neu laden</button>
        </div>
      )}
      {errors.length > 0 && (
        <ul role="alert" style={{ border: '1px solid #c0392b', borderRadius: 6, padding: '10px 10px 10px 28px', marginBottom: 12 }}>
          {errors.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      )}

      {text('Titel', 'title')}
      <label style={field}>Slug (leer = automatisch aus dem Titel)
        <input style={input} value={form.slug} readOnly={!isNew} onChange={(e) => set('slug', e.target.value)} />
      </label>
      {text('Kategorie', 'category')}
      {text('Untertitel', 'subtitle')}
      <label style={field}>Kurztext
        <textarea style={input} rows={2} value={form.shortText} onChange={(e) => set('shortText', e.target.value)} />
      </label>
      <label style={field}>Beschreibung (Klartext, Absätze durch Leerzeile)
        <textarea style={input} rows={8} value={form.description} onChange={(e) => set('description', e.target.value)} />
      </label>

      <fieldset style={{ marginBottom: 12 }}>
        <legend>Bilder (erstes = Titelbild)</legend>
        {form.images.length === 0 && <p>Keine Bilder</p>}
        {form.images.map((u, i) => (
          <div key={`${u}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <img src={u} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} />
            <span style={{ flex: 1, wordBreak: 'break-all' }}>{u}{i === 0 ? ' (Titelbild)' : ''}</span>
            <button type="button" className="btn" aria-label={`Bild ${i + 1} nach oben`} disabled={i === 0} onClick={() => moveImage(i, -1)}>↑</button>
            <button type="button" className="btn" aria-label={`Bild ${i + 1} nach unten`} disabled={i === form.images.length - 1} onClick={() => moveImage(i, 1)}>↓</button>
            <button type="button" className="btn" aria-label={`Bild ${i + 1} entfernen`} onClick={() => removeImage(i)}>Entfernen</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...input, flex: 1 }} aria-label="Bildpfad" placeholder="/uploads/shop/bild.jpg" value={newImage} onChange={(e) => setNewImage(e.target.value)} />
          <button type="button" className="btn" onClick={addImage}>Hinzufügen</button>
          <label className="btn">{uploading ? 'Lädt hoch…' : 'Hochladen'}
            <input type="file" accept="image/*" aria-label="Bild hochladen" onChange={upload} disabled={uploading} style={{ display: 'none' }} />
          </label>
        </div>
      </fieldset>

      <fieldset style={{ marginBottom: 12 }}>
        <legend>Formate</legend>
        <datalist id="shop-tax-options"><option value="7" /><option value="19" /></datalist>
        {form.formats.map((f, i) => {
          const isBundle = f.bundle.length > 0;
          const opts = bundleOptions(f);
          return (
            <div key={f.key} style={{ marginBottom: 14 }}>
              <div role="group" aria-label={`Format ${i + 1}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 10, alignItems: 'end' }}>
                <label>SKU<input style={input} value={f.sku} onChange={(e) => setFormat(f.key, { sku: e.target.value })} /></label>
                <label>Bezeichnung<input style={input} value={f.label} onChange={(e) => setFormat(f.key, { label: e.target.value })} /></label>
                <label>Preis (€)<input style={input} inputMode="decimal" placeholder="24,90" value={f.price} onChange={(e) => setFormat(f.key, { price: e.target.value })} /></label>
                <label>MwSt (%)<input style={input} list="shop-tax-options" inputMode="decimal" value={f.tax} onChange={(e) => setFormat(f.key, { tax: e.target.value })} /></label>
                {!f.digital && !isBundle && <label>Gewicht (g)<input style={input} inputMode="numeric" value={f.weight} onChange={(e) => setFormat(f.key, { weight: e.target.value })} /></label>}
                {!isBundle && <label>Bestand (leer = unbegrenzt)<input style={input} inputMode="numeric" value={f.stock} onChange={(e) => setFormat(f.key, { stock: e.target.value })} /></label>}
                {!isBundle && <label><input type="checkbox" checked={f.digital} onChange={(e) => setFormat(f.key, { digital: e.target.checked })} /> Digital</label>}
                <label><input type="checkbox" checked={isBundle} onChange={(e) => setFormat(f.key, e.target.checked ? { bundle: [emptyBundleItem()], digital: false } : { bundle: [] })} /> Bündel</label>
                <button type="button" className="btn" onClick={() => setForm((x) => ({ ...x, formats: x.formats.filter((y) => y.key !== f.key) }))}>Format entfernen</button>
              </div>

              <div style={sub}>
                <strong>Staffelpreise (Format {i + 1})</strong>
                {f.tiers.length === 0 && <p>Keine Staffelpreise.</p>}
                {f.tiers.map((t, j) => (
                  <div key={t.key} role="group" aria-label={`Staffel ${j + 1} von Format ${i + 1}`} style={{ display: 'flex', gap: 8, alignItems: 'end', marginBottom: 6, flexWrap: 'wrap' }}>
                    <label>Ab Menge<input style={input} inputMode="numeric" value={t.minQty} onChange={(e) => updateList(f, 'tiers', t.key, { minQty: e.target.value })} /></label>
                    <label>Preis je Stück (€)<input style={input} inputMode="decimal" placeholder="19,90" value={t.price} onChange={(e) => updateList(f, 'tiers', t.key, { price: e.target.value })} /></label>
                    <button type="button" className="btn" aria-label={`Staffel ${j + 1} von Format ${i + 1} entfernen`} onClick={() => dropFromList(f, 'tiers', t.key)}>Entfernen</button>
                  </div>
                ))}
                {f.tiers.length < 5 && <button type="button" className="btn" onClick={() => setFormat(f.key, { tiers: [...f.tiers, emptyTier()] })}>Staffel hinzufügen</button>}
              </div>

              {isBundle && (
                <div style={sub}>
                  <strong>Bündel-Inhalt (Format {i + 1})</strong>
                  {f.bundle.map((b, j) => (
                    <div key={b.key} role="group" aria-label={`Bestandteil ${j + 1} von Format ${i + 1}`} style={{ display: 'flex', gap: 8, alignItems: 'end', marginBottom: 6, flexWrap: 'wrap' }}>
                      <label style={{ flex: 1, minWidth: 200 }}>Format
                        <select style={input} value={b.sku} onChange={(e) => updateList(f, 'bundle', b.key, { sku: e.target.value })}>
                          <option value="">Bitte wählen</option>
                          {b.sku && !opts.some((o) => o.sku === b.sku) && <option value={b.sku}>{b.sku}</option>}
                          {opts.map((o) => <option key={o.sku} value={o.sku}>{o.text}</option>)}
                        </select>
                      </label>
                      <label>Menge<input style={{ ...input, width: 80 }} inputMode="numeric" value={b.qty} onChange={(e) => updateList(f, 'bundle', b.key, { qty: e.target.value })} /></label>
                      <button type="button" className="btn" aria-label={`Bestandteil ${j + 1} von Format ${i + 1} entfernen`} onClick={() => dropFromList(f, 'bundle', b.key)}>Entfernen</button>
                    </div>
                  ))}
                  {f.bundle.length < 10 && <button type="button" className="btn" onClick={() => setFormat(f.key, { bundle: [...f.bundle, emptyBundleItem()] })}>Bestandteil hinzufügen</button>}
                  <small style={{ display: 'block', marginTop: 4 }}>Bestand und Gewicht ergeben sich aus den Bestandteilen. Ohne Bestandteile ist das Format kein Bündel mehr.</small>
                </div>
              )}

              {f.digital && !isBundle && (f.id !== undefined
                ? <FormatFiles formatId={f.id} label={f.label} showToast={showToast} />
                : <p style={sub}>Download-Dateien: erst speichern, dann hochladen.</p>)}
            </div>
          );
        })}
        <button type="button" className="btn" onClick={() => setForm((x) => ({ ...x, formats: [...x.formats, emptyFormat()] }))}>Format hinzufügen</button>
      </fieldset>

      <fieldset style={{ marginBottom: 12 }}>
        <legend>Empfehlungen („Dazu passt“, höchstens 6)</legend>
        {relatedOptions.length === 0 && form.related.length === 0 && <p>Keine anderen Produkte vorhanden.</p>}
        {relatedOptions.map((p) => (
          <label key={p.slug} style={{ display: 'block' }}>
            <input type="checkbox" checked={form.related.includes(p.slug)} disabled={!form.related.includes(p.slug) && form.related.length >= 6} onChange={() => toggleRelated(p.slug)} /> {p.title}
          </label>
        ))}
        {form.related.filter((slug) => !relatedOptions.some((p) => p.slug === slug)).map((slug) => (
          <label key={slug} style={{ display: 'block' }}>
            <input type="checkbox" checked onChange={() => toggleRelated(slug)} /> {slug}
          </label>
        ))}
      </fieldset>

      <details style={{ marginBottom: 12 }}>
        <summary>Übersetzung Englisch (optional)</summary>
        <p>Leere Felder fallen auf den deutschen Text zurück.</p>
        {TRANSLATION_FIELDS.map(([k, label]) => (
          <label key={k} style={field}>{label} (EN)
            {k === 'shortText' || k === 'description'
              ? <textarea style={input} rows={k === 'description' ? 6 : 2} value={form.en[k]} onChange={(e) => setEn(k, e.target.value)} />
              : <input style={input} value={form.en[k]} onChange={(e) => setEn(k, e.target.value)} />}
          </label>
        ))}
      </details>

      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> Aktiv (im Shop sichtbar)
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Speichert…' : 'Speichern'}</button>
        <button type="button" className="btn" onClick={onCancel}>Zurück</button>
      </div>
    </form>
  );
}
