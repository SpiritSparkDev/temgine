import { getContentTypes, getContentTypeBySlug, createContentType, updateContentType, deleteContentType } from '../../lib/contentModel'

const VALID_FIELD_TYPES = new Set([
  'text',
  'textarea',
  'richtext',
  'number',
  'boolean',
  'date',
  'image',
  'url',
  'select',
  'radio',
  'array'
])

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code }
  if (details) response.details = details
  return [status, response]
}

function normalizeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/-+/g, '-')
}

function validatePayload(body, { requireSlug = true } = {}) {
  const name = String(body?.name || '').trim()
  const slug = normalizeSlug(body?.slug)
  const fields = Array.isArray(body?.fields) ? body.fields : []

  if (!name) return { ok: false, message: 'name erforderlich', details: { missing: ['name'] } }
  if (requireSlug && !slug) return { ok: false, message: 'slug erforderlich', details: { missing: ['slug'] } }

  const normalizedFields = []
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i] || {}
    const fieldName = String(f.name || '').trim()
    const fieldKey = normalizeSlug(f.key || fieldName)
    const fieldType = String(f.type || 'text').toLowerCase().trim()

    if (!fieldName) {
      return { ok: false, message: `Feld ${i + 1}: name erforderlich`, details: { fieldIndex: i, missing: ['name'] } }
    }
    if (!fieldKey) {
      return { ok: false, message: `Feld ${i + 1}: key erforderlich`, details: { fieldIndex: i, missing: ['key'] } }
    }
    if (!VALID_FIELD_TYPES.has(fieldType)) {
      return {
        ok: false,
        message: `Feld ${i + 1}: ungueltiger type`,
        details: { fieldIndex: i, invalid: ['type'], value: fieldType, valid: Array.from(VALID_FIELD_TYPES) }
      }
    }

    normalizedFields.push({
      name: fieldName,
      key: fieldKey,
      type: fieldType,
      required: Boolean(f.required),
      options: Array.isArray(f.options) ? f.options : null,
      sortOrder: Number.isInteger(f.sortOrder) ? f.sortOrder : i,
    })
  }

  const keySet = new Set()
  for (const f of normalizedFields) {
    if (keySet.has(f.key)) {
      return { ok: false, message: `Doppelter field key: ${f.key}`, details: { duplicate: ['key'], value: f.key } }
    }
    keySet.add(f.key)
  }

  return {
    ok: true,
    data: {
      id: body?.id ? String(body.id) : undefined,
      name,
      slug,
      description: body?.description || null,
      fields: normalizedFields,
    }
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { slug } = req.query || {}
      if (slug) {
        const ct = await getContentTypeBySlug(String(slug))
        if (!ct) {
          const [status, resp] = errorResponse(404, 'ContentType nicht gefunden', 'CONTENT_TYPE_NOT_FOUND')
          return res.status(status).json(resp)
        }
        return res.status(200).json(ct)
      }
      const list = await getContentTypes()
      return res.status(200).json(list)
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const validated = validatePayload(body, { requireSlug: true })
      if (!validated.ok) {
        const [status, resp] = errorResponse(400, validated.message, 'VALIDATION_ERROR', validated.details)
        return res.status(status).json(resp)
      }

      const payload = validated.data
      const ct = payload.id
        ? await updateContentType(payload.id, payload)
        : await createContentType(payload)
      return res.status(200).json(ct)
    }

    if (req.method === 'PUT') {
      const body = req.body || {}
      if (!body.id) {
        const [status, resp] = errorResponse(400, 'id erforderlich', 'VALIDATION_ERROR', { missing: ['id'] })
        return res.status(status).json(resp)
      }

      const validated = validatePayload(body, { requireSlug: false })
      if (!validated.ok) {
        const [status, resp] = errorResponse(400, validated.message, 'VALIDATION_ERROR', validated.details)
        return res.status(status).json(resp)
      }

      const ct = await updateContentType(String(body.id), validated.data)
      return res.status(200).json(ct)
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {}
      if (!id) {
        const [status, resp] = errorResponse(400, 'id erforderlich', 'VALIDATION_ERROR', { missing: ['id'] })
        return res.status(status).json(resp)
      }
      await deleteContentType(id)
      return res.status(200).json({ ok: true })
    }

    const [status, resp] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED')
    return res.status(status).json(resp)
  } catch (e) {
    console.error('[/api/content-types Error]', e.message, e.stack)
    const [status, resp] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', { message: process.env.NODE_ENV === 'production' ? undefined : e.message })
    return res.status(status).json(resp)
  }
}
