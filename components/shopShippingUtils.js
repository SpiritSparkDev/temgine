// Reine Hilfen für die Versand-Konfiguration im Admin (Eingabe <-> Payload nach Vertrag).
import { parseEuroToCents, centsToEuro } from './shopFormUtils';

let seq = 0;
const nextKey = () => `s${++seq}`;

export const emptyTier = () => ({ key: nextKey(), maxG: '', price: '' });
export const emptyZone = (existingIds = []) => {
  let n = existingIds.length + 1;
  while (existingIds.includes(`zone-${n}`)) n++;
  return { key: nextKey(), id: `zone-${n}`, name: '', countries: [], tiers: [] };
};

// API-Konfiguration -> Formularzustand
export function configToForm(cfg) {
  const countries = Object.entries(cfg?.countries || {}).map(([code, name]) => ({ code, name }));
  const zones = (cfg?.zones || []).map((z) => ({
    key: nextKey(), id: z.id, name: z.name || '', countries: [...(z.countries || [])],
    tiers: (z.tiers || []).map((t) => ({ key: nextKey(), maxG: String(t.maxG), price: centsToEuro(t.priceCents) })),
  }));
  return { countries, zones };
}

// Liefert { payload, errors }. Bei errors.length > 0 wird nichts gesendet.
export function formToPayload(form) {
  const errors = [];
  const countries = {};
  form.countries.forEach((c) => {
    const code = c.code.trim().toUpperCase();
    const name = c.name.trim();
    if (!/^[A-Z]{2}$/.test(code)) errors.push(`Ländercode „${c.code}“ ungültig (zwei Buchstaben, z. B. DE).`);
    else if (code in countries) errors.push(`Land „${code}“ kommt doppelt vor.`);
    if (!name) errors.push(`Land ${code || '?'}: Name ist erforderlich.`);
    else if (name.length > 80) errors.push(`Land ${code}: Name darf höchstens 80 Zeichen lang sein.`);
    countries[code] = name;
  });

  const owner = {};
  const zones = form.zones.map((z, i) => {
    const n = `Zone ${i + 1}`;
    const name = z.name.trim();
    if (!name) errors.push(`${n}: Name ist erforderlich.`);
    z.countries.forEach((c) => {
      if (!(c in countries)) errors.push(`${n}: Land „${c}“ ist nicht in der Länderliste.`);
      if (owner[c] !== undefined && owner[c] !== i) errors.push(`Land „${c}“ ist mehreren Zonen zugeordnet.`);
      owner[c] = i;
    });
    let prev = 0;
    const tiers = z.tiers.map((t, j) => {
      const m = `${n}, Stufe ${j + 1}`;
      const s = String(t.maxG).trim();
      const maxG = /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
      if (Number.isNaN(maxG) || maxG < 1 || maxG > 1000000) errors.push(`${m}: „bis Gramm“ muss eine ganze Zahl von 1 bis 1000000 sein.`);
      else if (maxG <= prev) errors.push(`${m}: „bis Gramm“ muss größer als die vorherige Stufe sein.`);
      else prev = maxG;
      const priceCents = parseEuroToCents(t.price);
      if (priceCents == null || Number.isNaN(priceCents) || priceCents > 99999) errors.push(`${m}: Preis ungültig (z. B. 4,90; max. 999,99).`);
      return { maxG, priceCents };
    });
    return { id: z.id, name, countries: [...z.countries], tiers };
  });
  return { payload: { countries, zones }, errors: [...new Set(errors)] };
}
