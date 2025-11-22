const { execSync } = require('child_process')
// Try to load dotenv if available, otherwise try a simple .env parser fallback
try {
  require('dotenv').config()
} catch (e) {
  const fs = require('fs')
  const envPath = require('path').join(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    content.split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) {
        let val = m[2]
        // strip surrounding quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        if (process.env[m[1]] === undefined) process.env[m[1]] = val
      }
    })
  }
}
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// Models/tables expected from prisma/schema.prisma
const requiredModels = ['User', 'UserInvitation', 'Page', 'Template', 'Snippet']

async function checkTables() {
  const missing = []
  for (const name of requiredModels) {
    try {
      // Query information_schema, compare lowercased names to avoid quoting issues
      const rows = await prisma.$queryRawUnsafe(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND lower(table_name) = lower($1) LIMIT 1",
        name
      )
      if (!rows || rows.length === 0) {
        missing.push(name)
      }
    } catch (err) {
      console.error('Error checking table', name, err)
      missing.push(name)
    }
  }
  return missing
}

async function run() {
  try {
    console.log('Checking required DB tables...')
    const missingBefore = await checkTables()
    if (missingBefore.length === 0) {
      console.log('All required tables are present.')
      await prisma.$disconnect()
      return
    }

    console.log('Missing tables detected:', missingBefore.join(', '))
    console.log('Attempting to create missing tables with `npx prisma db push`...')

    // Run prisma db push to sync schema (will create missing tables)
    try {
      execSync('npx prisma db push', { stdio: 'inherit', cwd: process.cwd(), env: process.env })
    } catch (e) {
      console.error('prisma db push failed:', e.message || e)
      await prisma.$disconnect()
      process.exitCode = 2
      return
    }

    // Re-check
    const missingAfter = await checkTables()
    if (missingAfter.length === 0) {
      console.log('Schema synced — all required tables now exist.')
    } else {
      console.error('Some tables are still missing after prisma db push:', missingAfter.join(', '))
      process.exitCode = 3
    }
  } catch (err) {
    console.error('Unexpected error:', err)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

run()
