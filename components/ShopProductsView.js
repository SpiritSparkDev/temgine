import React, { useState, useEffect, useCallback } from 'react';
import ShopProductEditor from './ShopProductEditor';
import { centsToEuro } from './shopFormUtils';

const stockText = (f) => (f.digital ? 'digital' : f.stock == null ? '∞' : String(f.stock));

/** Produktliste des Shop-Add-ons mit Aktiv-Schalter; Klick auf Titel öffnet den Editor. */
export default function ShopProductsView({ showToast }) {
  const [products, setProducts] = useState(null);
  const [editing, setEditing] = useState(undefined); // undefined = Liste, null = neu, Objekt = bearbeiten

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/shop/products');
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Produkte konnten nicht geladen werden');
      setProducts(d.products || []);
    } catch (e) {
      setProducts([]);
      showToast(e.message, 'error');
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (p) => {
    const body = { ...p, active: !p.active };
    const res = await fetch(`/api/shop/products/${p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.product) setProducts((list) => list.map((x) => (x.id === p.id ? d.product : x)));
    else if (res.status === 409) { showToast('Inzwischen geändert, bitte neu laden', 'error'); load(); }
    else showToast(d.error || 'Fehler beim Speichern', 'error');
  };

  if (editing !== undefined) {
    return (
      <ShopProductEditor
        product={editing}
        showToast={showToast}
        onSaved={() => load()}
        onCancel={() => { setEditing(undefined); load(); }}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3>Produkte</h3>
        <button className="btn btn-primary" onClick={() => setEditing(null)}>Neues Produkt</button>
      </div>
      {products === null ? <p>Lade…</p> : products.length === 0 ? <p>Noch keine Produkte.</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr><th align="left">Titel</th><th align="left">Kategorie</th><th align="left">Formate / Preise</th><th align="left">Bestand</th><th align="left">Aktiv</th></tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td><button className="btn" onClick={() => setEditing(p)}>{p.title}</button></td>
                <td>{p.category}</td>
                <td>{p.formats.map((f) => `${f.label}: ${f.priceCents == null ? '–' : `${centsToEuro(f.priceCents)} €`}`).join(', ')}</td>
                <td>{p.formats.map((f) => `${f.label}: ${stockText(f)}`).join(', ')}</td>
                <td><input type="checkbox" aria-label={`${p.title} aktiv`} checked={!!p.active} onChange={() => toggleActive(p)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
