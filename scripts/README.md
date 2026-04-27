# Scripts Dokumentation

## Datenbank & Migration

### `migrate-pages-to-db.mjs`
Migriert Seiten aus der lokalen `data/pages.json` Datei in die Datenbank.
Verwendet werden sollte, wenn Seiten aus einer JSON-Datei importiert werden müssen.
```bash
node scripts/migrate-pages-to-db.mjs
```

### `migrate-json-to-db.js`
Allgemeines Migrations-Script für JSON-Daten zur Datenbank.

### `ensure_db_schema.js`
Stellt sicher, dass das Datenbankschema korrekt ist.

### `check-db.js`
Überprüft die Datenbankverbindung und den Status.

## User Management

### `delete-admin.js`
Löscht einen Admin-Benutzer aus der Datenbank.

### `fix-admin-role.js`
Korrigiert die Rollen von Admin-Benutzern.

### `debug-invitations.js`
Debug-Tool für Benutzer-Einladungen.

## Content

### `count-pages.js`
Zählt die Anzahl der Seiten in der Datenbank.

### `count-snippets.js`
Zählt die Anzahl der Snippets.

### `migrate-snippets-to-json.js`
Migriert Snippets zur JSON-Datei.

### `publish-scheduled.js`
Veröffentlicht Seiten, die für einen bestimmten Zeitpunkt geplant sind.

### `migrate-models.js`
Migriert bestehende Seiten in `ContentEntry`-Datensätze auf Basis einer JSON-Mapping-Datei.
Standard ist Dry-Run; echte Änderungen werden nur mit `--write` ausgeführt.
```bash
node scripts/migrate-models.js --config init/content-entry-migration.example.json
node scripts/migrate-models.js --config init/content-entry-migration.example.json --write
```

### `rollback-model-migration.js`
Stellt Änderungen einer zuvor ausgeführten Model-Migration anhand der Backup-Datei wieder her.
```bash
node scripts/rollback-model-migration.js --backup data/backups/content-model-migration-2026-04-24T16-30-00-000Z.json
```

## Hinweise

- Alle `.mjs` Scripts verwenden ES-Module-Syntax
- Scripts sollten aus dem Hauptverzeichnis ausgeführt werden
- Backup-Dateien befinden sich in `data/backups/`
- Beispiel-Mappings für B-03 liegen in `init/content-entry-migration.example.json`
