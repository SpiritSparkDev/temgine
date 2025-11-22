import { prisma } from './prisma'

export async function getContentTypes() {
  return prisma.contentType.findMany({ orderBy: { createdAt: 'desc' }, include: { fields: true } })
}

export async function getContentTypeBySlug(slug) {
  return prisma.contentType.findUnique({ where: { slug }, include: { fields: { orderBy: { sortOrder: 'asc' } } } })
}

export async function createContentType({ name, slug, description, fields = [] }) {
  const ct = await prisma.contentType.create({ data: { name, slug, description } })
  for (const f of fields) {
    await prisma.contentField.create({ data: {
      contentTypeId: ct.id,
      name: f.name,
      key: f.key,
      type: f.type,
      options: f.options || null,
      required: f.required || false,
      sortOrder: f.sortOrder || 0
    } })
  }
  return getContentTypeBySlug(slug)
}

export async function updateContentType(id, { name, description, fields }) {
  await prisma.contentType.update({ where: { id }, data: { name, description } })
  if (Array.isArray(fields)) {
    // simple approach: delete existing and recreate
    await prisma.contentField.deleteMany({ where: { contentTypeId: id } })
    for (const f of fields) {
      await prisma.contentField.create({ data: {
        contentTypeId: id,
        name: f.name,
        key: f.key,
        type: f.type,
        options: f.options || null,
        required: f.required || false,
        sortOrder: f.sortOrder || 0
      } })
    }
  }
  return prisma.contentType.findUnique({ where: { id }, include: { fields: true } })
}

export async function deleteContentType(id) {
  await prisma.contentField.deleteMany({ where: { contentTypeId: id } })
  return prisma.contentType.delete({ where: { id } })
}

export function generateDefaultEntry(contentType) {
  const entry = {}
  (contentType.fields || []).forEach(f => {
    switch ((f.type || 'text').toLowerCase()) {
      case 'number': entry[f.key] = 0; break
      case 'boolean': entry[f.key] = false; break
      case 'array': entry[f.key] = []; break
      default: entry[f.key] = ''
    }
  })
  return entry
}
