// Schema der Section-Provider für GET /capabilities (WP-B6): Präfix, Anzeigename, Parameter, Kontextfelder.
// Quelle je Provider, in dieser Reihenfolge:
//   1. `schema` am Provider-Objekt, das ein Plugin in seinem client.js-Hook liefert (sections.<prefix>.schema), ohne Kernänderung;
//   2. die Standard-Schemas unten (Kern-Provider `folder`, Plugin `picgine`), solange der Provider kein eigenes liefert;
//   3. leerer Kontext (der Provider bleibt nutzbar, der Designer kennt dann keine Felder).
// Form: { label?, args?, list?, context: [{ name, type, example?, children? }] }
// `list: true` = toContext liefert eine Liste (die Section läuft je Eintrag, z. B. folder); sonst ein Objekt (z. B. picgine).
// Keine Temgine-Importe (testbar).

export const TYPES = ['text', 'number', 'boolean', 'url', 'image', 'date', 'array', 'object'];
const MAX_FIELDS = 64;
const MAX_DEPTH = 3;
const NAME_RE = /^[A-Za-z_][\w.-]{0,63}$/;

export const DEFAULT_SCHEMAS = {
  folder: {
    label: 'Ordner', args: 'name', list: true,
    context: [
      { name: 'name', type: 'text', example: 'bild-01.jpg' },
      { name: 'slug', type: 'text', example: 'bild-01' },
      { name: 'url', type: 'url', example: '/uploads/galerie/bild-01.jpg' },
      { name: 'path', type: 'text', example: 'galerie/bild-01.jpg' },
      { name: 'ext', type: 'text', example: 'jpg' },
      { name: 'size', type: 'number', example: 184320 },
      { name: 'modified', type: 'date', example: '2026-11-01' },
      { name: 'isImage', type: 'boolean', example: true },
    ],
  },
  picgine: {
    label: 'Picgine-Galerie', args: 'name', list: false,
    context: [
      { name: 'title', type: 'text', example: 'Sommer 2026' },
      { name: 'slug', type: 'text', example: 'sommer-2026' },
      { name: 'locked', type: 'boolean', example: false },
      { name: 'lockPassword', type: 'boolean', example: false },
      { name: 'lockLogin', type: 'boolean', example: false },
      { name: 'loggedIn', type: 'boolean', example: false },
      { name: 'allowDownload', type: 'boolean', example: false },
      { name: 'cover', type: 'image', example: '/uploads/galerie/cover.jpg' },
      { name: 'parentUrl', type: 'url', example: '' },
      {
        name: 'images', type: 'array', children: [
          { name: 'thumb', type: 'image', example: '/uploads/galerie/bild-01-thumb.jpg' },
          { name: 'large', type: 'image', example: '/uploads/galerie/bild-01.jpg' },
          { name: 'srcset', type: 'text', example: '' },
          { name: 'width', type: 'number', example: 800 },
          { name: 'height', type: 'number', example: 600 },
          { name: 'alt', type: 'text', example: 'Beschreibung' },
          { name: 'index', type: 'number', example: 1 },
        ],
      },
      {
        name: 'children', type: 'array', children: [
          { name: 'title', type: 'text', example: 'Unterordner' },
          { name: 'slug', type: 'text', example: 'unterordner' },
          { name: 'url', type: 'url', example: '?picgine=unterordner' },
        ],
      },
      { name: 'breadcrumb', type: 'array', children: [{ name: 'title', type: 'text', example: 'Start' }, { name: 'url', type: 'url', example: '?' }] },
    ],
  },
};

const str = (v, max = 120) => (typeof v === 'string' ? v.slice(0, max) : undefined);

// Prüft/bereinigt eine Kontextliste eines Plugins (Plugin-Code ist nicht vertrauenswürdig für die Form der Antwort).
export function sanitizeContext(list, depth = 0) {
  if (!Array.isArray(list) || depth >= MAX_DEPTH) return [];
  const out = [];
  for (const f of list.slice(0, MAX_FIELDS)) {
    if (!f || typeof f.name !== 'string' || !NAME_RE.test(f.name)) continue;
    const type = TYPES.includes(f.type) ? f.type : 'text';
    const e = { name: f.name, type };
    if (['string', 'number', 'boolean'].includes(typeof f.example)) e.example = typeof f.example === 'string' ? f.example.slice(0, 200) : f.example;
    if (Array.isArray(f.children)) { const c = sanitizeContext(f.children, depth + 1); if (c.length) e.children = c; }
    out.push(e);
  }
  return out;
}

export function sanitizeSchema(schema) {
  if (!schema || typeof schema !== 'object') return null;
  return {
    ...(str(schema.label) ? { label: str(schema.label) } : {}),
    ...(str(schema.args, 40) ? { args: str(schema.args, 40) } : {}),
    list: schema.list === true,
    context: sanitizeContext(schema.context),
  };
}

// providers = core.sectionProviders() ({ <prefix>: { editorFieldLabel?, schema?, … } }) -> [{ prefix, label, args, list, context }]
export function describeProviders(providers) {
  return Object.entries(providers || {}).map(([prefix, p]) => {
    const own = sanitizeSchema(p?.schema);
    const std = DEFAULT_SCHEMAS[prefix];
    const s = own || (std ? sanitizeSchema(std) : null) || { list: false, context: [] };
    return {
      prefix,
      label: s.label || str(p?.editorFieldLabel) || prefix,
      args: s.args || 'name',
      list: s.list,
      context: s.context,
    };
  });
}
