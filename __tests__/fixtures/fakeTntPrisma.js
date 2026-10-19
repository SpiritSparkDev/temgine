// ── In-Memory-Prisma ────────────────────────────────────────────────────────
function match(row, where = {}) {
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('lte' in cond && !(v <= cond.lte)) return false;
      if ('lt' in cond && !(v < cond.lt)) return false;
      if ('not' in cond && v === cond.not) return false;
      return true;
    }
    return v === cond;
  });
}
function makePrisma() {
  const settings = new Map();
  const rows = [];
  let n = 0;
  return {
    _rows: rows, _settings: settings,
    setting: {
      findUnique: async ({ where }) => (settings.has(where.key) ? { key: where.key, value: settings.get(where.key) } : null),
      upsert: async ({ where, create }) => { settings.set(where.key, create.value); },
      deleteMany: async ({ where }) => { settings.delete(where.key); },
    },
    inquiryOutbox: {
      create: async ({ data }) => {
        if (rows.some((r) => r.externalId === data.externalId)) throw Object.assign(new Error('dup'), { code: 'P2002' });
        const row = { id: `o${++n}`, status: 'pending', attempts: 0, lastStatusCode: null, lastError: null, createdAt: new Date(), deliveredAt: null, ...data };
        rows.push(row); return { ...row };
      },
      findMany: async ({ where, take }) => rows.filter((r) => match(r, where)).slice(0, take || 999).map((r) => ({ ...r })),
      findFirst: async ({ where }) => rows.find((r) => match(r, where)) || null,
      update: async ({ where, data }) => Object.assign(rows.find((r) => r.id === where.id), data),
      updateMany: async ({ where, data }) => { const hit = rows.filter((r) => match(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
      deleteMany: async ({ where }) => { const keep = rows.filter((r) => !match(r, where)); const c = rows.length - keep.length; rows.length = 0; rows.push(...keep); return { count: c }; },
    },
  };
}

module.exports = { makePrisma };
