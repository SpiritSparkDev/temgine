#!/usr/bin/env node
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function publishScheduled() {
  try {
    const now = new Date()
    const pages = await prisma.page.findMany({
      where: {
        status: 'SCHEDULED',
        publishAt: { lte: now }
      }
    })

    if (!pages || pages.length === 0) {
      console.log('No scheduled pages to publish')
      return
    }

    for (const p of pages) {
      const updated = await prisma.page.update({
        where: { id: p.id },
        data: { status: 'PUBLISHED', updatedAt: new Date() }
      })

      // create revision record
      try {
        await prisma.pageRevision.create({ data: {
          pageId: updated.id,
          data: {
            title: updated.title,
            slug: updated.slug,
            blocks: updated.blocks,
            children: updated.children,
            status: updated.status,
            publishAt: updated.publishAt
          }
        } })
      } catch (e) { console.error('Failed to create revision', e) }

      // create audit log
      try {
        await prisma.auditLog.create({ data: {
          action: 'publish_scheduled',
          resource: 'page',
          resourceId: updated.id,
          details: { title: updated.title, slug: updated.slug }
        } })
      } catch (e) { console.error('Failed to write audit log', e) }

      console.log('Published page:', updated.slug)
    }
  } catch (e) {
    console.error('Error publishing scheduled pages', e)
  } finally {
    await prisma.$disconnect()
  }
}

publishScheduled()
