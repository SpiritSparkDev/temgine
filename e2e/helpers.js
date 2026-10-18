// Testbenutzer kommt aus der Umgebung (E2E_USER / E2E_PASSWORD) — keine Zugangsdaten im Repo.
async function login(page) {
  const user = process.env.E2E_USER;
  const password = process.env.E2E_PASSWORD;
  await page.goto('/login');
  if (!(await page.locator('#login-username').isVisible({ timeout: 5000 }).catch(() => false))) return; // DEV_MODE o. ä.
  if (!user || !password) throw new Error('E2E_USER und E2E_PASSWORD setzen (Testbenutzer)');
  await page.fill('#login-username', user);
  await page.fill('#login-password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 30_000 });
}

// Öffnet den Seiten-Editor der ersten vorhandenen Seite.
async function openPageEditor(page) {
  await page.addInitScript(() => { try { localStorage.setItem('adminView', 'pages'); } catch (e) {} });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Bearbeiten' }).first().click();
  await page.getByRole('button', { name: /Fokus|Klassisch/ }).waitFor();
}

module.exports = { login, openPageEditor };
