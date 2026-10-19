# TNT-Anfrage-Weiterleitung

Dieses Plugin leitet Absendungen von Kontaktformularen als Anfrage an den TNT Manager weiter. Es geht um personenbezogene Daten: Die Übertragung läuft ausschließlich serverseitig und nur per HTTPS.

## Einrichten

1. **Einstellungen → Plugins → Übersicht:** „TNT-Anfrage-Weiterleitung“ einschalten. Danach erscheint der Reiter „TNT-Anfrage-Weiterleitung“.
2. **TNT-Adresse** (`https://…`) und **Zugangs-Token** eintragen. Das Token wird verschlüsselt gespeichert und nie wieder angezeigt (nur die letzten vier Zeichen).
3. Je Kontaktformular die Formularfelder den Zielfeldern zuordnen. Vorschläge sind vorbelegt, gelten aber erst nach „Speichern“.
4. **Datenschutz-Checkbox** wählen. Sie ist Pflicht: Ohne Haken wird die Absendung abgelehnt, mit einer Meldung am Feld.
5. „Verbindung testen“ prüft Adresse und Token, ohne eine Anfrage anzulegen.

Der Status „Bereit“ zeigt an, dass Adresse, Token und eine vollständige Zuordnung vorhanden sind. Solange er fehlt, wird nichts weitergeleitet und keine Pflicht erzwungen.

## Was passiert bei einer Absendung?

- Die E-Mail an dich und das Speichern laufen wie bisher.
- Die Anfrage landet zuerst in einer Warteschlange („Letzte Absendungen“) und wird sofort gesendet. Ein Ausfall von TNT bleibt für den Besucher unsichtbar.
- Bei Fehlern wird bis zu achtmal wiederholt (1 Minute bis 24 Stunden Abstand). Danach steht die Absendung auf „fehlgeschlagen“ und lässt sich mit „Erneut senden“ anstoßen.
- Bei Token- oder HTTPS-Problemen (Alarm im Reiter) werden Absendungen gehalten und nach Behebung automatisch gesendet.
- Nicht zugestellte Einträge samt Inhalt werden nach 30 Tagen gelöscht.
- Pro IP-Adresse sind 5 Absendungen pro Stunde möglich.

## Mail erst nach TNT-Antwort (optional)

Je Formular kann die Checkbox „Mail erst nach TNT-Antwort senden“ gesetzt werden. Dann geht die Anfrage zuerst an TNT und erst danach die Mail an dich. Besucher warten dafür bis zu 5 Sekunden. In der Mail-Vorlage des Formulars stehen drei Platzhalter bereit:

- `{{tnt_url}}`: Link zum Termin im Planer (nur gesetzt, wenn TNT den Termin angelegt hat). Für Textmails `{{{tnt_url}}}` verwenden, damit der Link nicht maskiert wird.
- `{{tnt_id}}`: Termin-Nr.
- `{{tnt_status}}`: `angelegt` oder `ausstehend`.

Mit `{{#tnt_url}}…{{/tnt_url}}` lässt sich ein Abschnitt nur dann anzeigen, wenn es einen Link gibt (Beispiel: `docs/mail-template-example.html` im Plugin-Repo). Ohne eigene Vorlage hängt Temgine eine Zeile „Termin im Planer: …“ an die Standardmail an.

Ist TNT nicht erreichbar oder antwortet fehlerhaft, geht die Mail trotzdem sofort raus, ohne Link und mit dem Hinweis, dass die Übertragung noch aussteht; die Weiterleitung wird später automatisch wiederholt. Der Link steht nur in der Mail an dich, nie beim Besucher.

## Hinweise für Template-Autoren

Das Formular braucht das für Menschen unsichtbare Feld `hp_website` (Honeypot). Wird es ausgefüllt, verwirft Temgine die Absendung still, und es wird nichts weitergeleitet.

## Plugin ausschalten

Solange das Plugin aus ist, wird nichts weitergeleitet, und alte Einträge in der Warteschlange werden nicht abgearbeitet oder aufgeräumt. Beim erneuten Einschalten geht es weiter.
