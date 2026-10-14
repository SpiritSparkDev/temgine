const { test, expect } = require('@playwright/test');
const { login, openPageEditor } = require('./helpers');

test('Datei-Auswähler öffnet, filtert, wechselt Tabs und schließt', async ({ page }) => {
  await login(page);
  await openPageEditor(page);

  // Erstes Bildfeld des Editors öffnet den Auswähler (falls die Seite ein Bildfeld hat).
  const imageField = page.getByRole('button', { name: /Bild für .* auswählen|Bild wählen/ }).first();
  test.skip(!(await imageField.isVisible().catch(() => false)), 'Erste Seite hat kein Bildfeld');
  await imageField.click();

  const dialog = page.getByRole('dialog', { name: 'Datei auswählen' });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('Nach Dateiname suchen').fill('zzz-gibt-es-nicht');
  await dialog.getByLabel('Nach Dateiname suchen').fill('');

  await dialog.getByRole('tab', { name: 'Ordner' }).click();
  await expect(dialog.getByRole('button', { name: 'Neuen Ordner anlegen' })).toBeVisible();
  await dialog.getByRole('tab', { name: 'Galerie' }).click();

  await dialog.getByRole('button', { name: 'Dateiauswahl abbrechen' }).click();
  await expect(dialog).toBeHidden();
});
