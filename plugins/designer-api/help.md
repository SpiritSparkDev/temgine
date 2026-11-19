# Temgine Designer API

Dieses Plugin ist die Gegenstelle des **Temgine Designers**, einer eigenständigen App zum grafischen Bauen von Templates.

## Einrichten

1. Plugin unter Einstellungen → Plugins aktivieren.
2. Im Designer „Mit Temgine verbinden“ wählen, die Adresse dieser Instanz und Benutzername/Passwort eintragen.

Der Designer meldet sich mit einem normalen Temgine-Benutzer an. Erlaubt sind Rollen, die Templates und CSS bearbeiten dürfen (Administrator, Moderator). Das Passwort wird nur geprüft und nirgends gespeichert. Der Designer bekommt ein Token mit 8 Stunden Laufzeit.

## Was der Designer darf

- Templates lesen, anlegen, ändern und löschen (wie im Template-Manager; Löschen nur mit der Berechtigung dafür und nur, wenn das Template nicht verwendet wird).
- CSS-Dateien **nur mit dem Namensanfang `designer-`** schreiben (Ordner `public/extern_css/`). Andere CSS-Dateien fasst er nicht an.
- Dateien der Medienverwaltung auflisten.
- Templates mit Beispieldaten rendern (ohne etwas zu speichern).

## Sicherheit

- Alle Schreibzugriffe landen im Audit-Log (`designer.*`).
- Alle Tokens ungültig machen: `NEXTAUTH_SECRET` ändern oder das Plugin deaktivieren.
- Die Anmeldung ist rate-limitiert.
