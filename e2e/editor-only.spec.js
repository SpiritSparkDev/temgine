const { test, expect } = require('@playwright/test');
const { login, openPageEditor } = require('./helpers');

test('Nur-Editor-Umschalter blendet Vorschau aus und wieder ein (Button und Strg+Umschalt+E)', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('pe-layout', 'klassisch'); } catch (e) {} }); // "Nur Editor" gibt es nur im klassischen Layout
  await login(page);
  await openPageEditor(page);

  const workspace = page.locator('.page-editor-workspace');
  const toggle = page.getByRole('button', { name: /Nur Editor/ });

  await expect(workspace).not.toHaveClass(/editor-only/);
  await toggle.click();
  await expect(workspace).toHaveClass(/editor-only/);
  await toggle.click();
  await expect(workspace).not.toHaveClass(/editor-only/);

  await page.keyboard.press('Control+Shift+E');
  await expect(workspace).toHaveClass(/editor-only/);
});
