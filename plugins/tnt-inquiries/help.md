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

## Hinweise für Template-Autoren

Das Formular braucht das für Menschen unsichtbare Feld `hp_website` (Honeypot). Wird es ausgefüllt, verwirft Temgine die Absendung still, und es wird nichts weitergeleitet.

## Plugin ausschalten

Solange das Plugin aus ist, wird nichts weitergeleitet, und alte Einträge in der Warteschlange werden nicht abgearbeitet oder aufgeräumt. Beim erneuten Einschalten geht es weiter.
