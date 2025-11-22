const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixAdminRole() {
  try {
    // Finde GitHub User "Andre"
    const users = await prisma.user.findMany();
    console.log('Alle Benutzer:');
    users.forEach(u => console.log(`- ${u.name} (${u.email}) - Rolle: ${u.role}`));
    
    // Setze Andre als ADMIN
    const andreUser = users.find(u => u.name === 'Andre' || u.email?.includes('github'));
    
    if (andreUser) {
      await prisma.user.update({
        where: { id: andreUser.id },
        data: { role: 'ADMIN' }
      });
      console.log(`\n✓ ${andreUser.name} ist jetzt ADMIN`);
    } else {
      console.log('\n✗ Andre nicht gefunden');
    }
  } catch (error) {
    console.error('Fehler:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAdminRole();
