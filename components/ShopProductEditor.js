import React, { useState } from 'react';
import { emptyForm, emptyFormat, productToForm, formToPayload } from './shopFormUtils';

const input = { padding: '6px 8px', border: '1px solid var(--border-color)', borderRadius: 6, background: 'transparent', color: 'inherit', width: '100%', boxSizing: 'border-box' };
const field = { display: 'grid', gap: 4, marginBottom: 12 };

/**
 * Formular für ein Shop-Produkt. product=null legt ein neues an (POST), sonst PUT.
 * Preise/MwSt werden als Euro/Prozent eingegeben und in Cent/bp gesendet (shopFormUtils).
 */
export default function ShopProductEditor({ product, onSaved, onCancel, showToast }) {
  const [form, setForm] = useState(() => (product ? productToForm(product) : emptyForm()));
  const [errors, setErrors] = useState([]);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newImage, setNewImage] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setFormat = (key, patch) => setForm((f) => ({ ...f, formats: f.formats.map((x) => (x.key === key ? { ...x, ...patch } : x)) }));
  const isNew = form.id === undefined;

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
        {form.formats.map((f, i) => (
          <div key={f.key} role="group" aria-label={`Format ${i + 1}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 10, alignItems: 'end' }}>
            <label>SKU<input style={input} value={f.sku} onChange={(e) => setFormat(f.key, { sku: e.target.value })} /></label>
            <label>Bezeichnung<input style={input} value={f.label} onChange={(e) => setFormat(f.key, { label: e.target.value })} /></label>
            <label>Preis (€)<input style={input} inputMode="decimal" placeholder="24,90" value={f.price} onChange={(e) => setFormat(f.key, { price: e.target.value })} /></label>
            <label>MwSt (%)<input style={input} list="shop-tax-options" inputMode="decimal" value={f.tax} onChange={(e) => setFormat(f.key, { tax: e.target.value })} /></label>
            {!f.digital && <label>Gewicht (g)<input style={input} inputMode="numeric" value={f.weight} onChange={(e) => setFormat(f.key, { weight: e.target.value })} /></label>}
            <label>Bestand (leer = unbegrenzt)<input style={input} inputMode="numeric" value={f.stock} onChange={(e) => setFormat(f.key, { stock: e.target.value })} /></label>
            <label><input type="checkbox" checked={f.digital} onChange={(e) => setFormat(f.key, { digital: e.target.checked })} /> Digital</label>
            <button type="button" className="btn" onClick={() => setForm((x) => ({ ...x, formats: x.formats.filter((y) => y.key !== f.key) }))}>Format entfernen</button>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setForm((x) => ({ ...x, formats: [...x.formats, emptyFormat()] }))}>Format hinzufügen</button>
      </fieldset>

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
