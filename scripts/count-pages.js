// Count pages in DB
const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    const c = await prisma.page.count();
    console.log('Pages in DB:', c);
  } catch (e) {
    console.error('Error counting pages:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
