// Nutzerfreundliche Changelog-Einträge für das "Was ist neu"-Fenster im
// Admin-Bereich (components/ChangelogPopup.js) — bewusst in einfacher
// Sprache ohne Technik-Begriffe, getrennt von CHANGELOG.md (das ist die
// technische, an der Code-Historie orientierte Dokumentation für
// Entwickler). "version" muss zu einem Eintrag in CHANGELOG.md bzw. der
// package.json-Version passen, ab der der Eintrag gilt. Neueste zuerst.
export const USER_CHANGELOG = [
  {
    version: '0.49.0',
    title: 'Klickbare Links in der Vorschau, Vorschau springt nicht mehr nach oben, Farben korrekt geladen',
    items: [
      'Klicken Sie in der Vorschau des Seiten-Editors auf einen Link (z. B. in der Navigation), wechselt der Editor jetzt direkt zu der verlinkten Seite, statt die Vorschau zu verlassen.',
      'Die Vorschau springt beim Speichern oder Weiterschreiben nicht mehr an den Anfang zurück — Ihre Scroll-Position bleibt jetzt erhalten.',
      'Ein Fehler wurde behoben, durch den eigene Farben und andere Design-Variablen aus Ihren CSS-Dateien manchmal nicht korrekt auf der Website ankamen.',
    ],
  },
  {
    version: '0.48.0',
    title: 'Neu: Dieses „Was ist neu"-Fenster',
    items: [
      'Nach größeren Updates informiert Sie dieses Fenster ab sofort automatisch über die wichtigsten Neuerungen. Es erscheint nur einmal pro Update und lässt sich jederzeit einfach schließen.',
    ],
  },
  {
    version: '0.47.0',
    title: 'Live-Vorschau beim Bearbeiten: jetzt auch für Beiträge, Navigation und Wartungsseiten',
    items: [
      'Beim Bearbeiten eines Blog- oder News-Beitrags sehen Sie jetzt sofort, wie der fertige Beitrag aussehen wird — genau wie bisher schon beim Bearbeiten von Seiten.',
      'Auch beim Bearbeiten von Navigation, Footer und Widgets sowie der Wartungsseiten (z. B. der Seite, die bei einem Fehler angezeigt wird) sehen Sie jetzt direkt eine Vorschau.',
      'Diese Bearbeitungsbereiche nutzen jetzt den ganzen Bildschirm, und Sie können die Breite von Vorschau und Eingabefeldern per Ziehen an Ihre Vorlieben anpassen.',
      'Ein Fehler wurde behoben, durch den auf veröffentlichten Blog-Beiträgen Firmenname & Co. (globale Variablen) nicht angezeigt wurden.',
      'Beim Bearbeiten einer Seite wird in der Vorschau jetzt genau das Feld hervorgehoben, an dem Sie gerade arbeiten — nicht mehr immer der ganze Abschnitt.',
    ],
  },
];
