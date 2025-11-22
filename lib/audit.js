import { prisma } from './prisma'

export async function logAudit({ action, resource, resourceId = null, userId = null, details = null }) {
  try {
    await prisma.auditLog.create({ data: {
      action: String(action),
      resource: String(resource),
      resourceId: resourceId || null,
      userId: userId || null,
      details: details || null
    } })
  } catch (e) {
    console.error('Audit log failed', e)
  }
}
