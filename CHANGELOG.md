# Changelog

All notable changes to **Temgine CMS** are documented in this file.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.14.2] - 2026-09-25

### Fixed
- `DELETE /api/users/invitations` (Einladung löschen/widerrufen) lieferte immer HTTP 500: der Handler las den Request-Body ein zweites Mal manuell als Stream, obwohl Next.js ihn für diese Route bereits automatisch geparst hatte (kein `bodyParser: false` gesetzt) — der Stream war zu dem Zeitpunkt schon leer, `JSON.parse('')` warf einen Fehler. Nutzt jetzt wie der `POST`-Handler direkt `req.body`.

---

## [0.14.1] - 2026-09-25

### Fixed
- Absturz im Admin-Bereich „Benutzer → Einladungen": `CheckCircle`-Icon wurde verwendet, aber nicht importiert (`ReferenceError`), sobald mindestens eine Einladung als „Verwendet" markiert war
- Absturz im Blog-Kanal-Editor bei Speicherfehlern (z. B. ungültige Eingaben): `AlertCircle`-Icon wurde verwendet, aber nicht importiert — überdeckte die eigentliche Fehlermeldung mit einem Absturz
- Admin-Bereich „Cookies" (Tabs „Erkannte Dienste"/„Banner") verwendete nirgends definierte CSS-Klassen und wirkte dadurch ungestylt; jetzt an die bestehenden Editor-Muster (Tabellen, Tabs, Modal) angeglichen

---

## [0.14.0] - 2026-09-24

> **⚠️ Wichtiger Hinweis beim Update:** Nach diesem Update werden bestehende externe JS-Dateien (unter „JS" im Admin-Bereich, inkl. hochgeladener `.js`-Dateien) **nicht mehr automatisch geladen**, bis ihnen dort eine Cookie-Kategorie zugewiesen wird (z. B. „Notwendig", falls sie kein Tracking durchführen). Das ist beabsichtigt (sicherer Default).

### Added
- Eingebautes Cookie-Consent-System: automatische Erkennung bekannter Dienste (Google Analytics, GTM, Meta Pixel, YouTube/Vimeo-Embeds, Google Maps, Matomo, Hotjar, LinkedIn Insight) per Katalog-Scan gegen externe JS-Dateien und Seiten-/Blog-Inhalte, manuelle Cookie-Einträge, frei per HTML/CSS/JS gestaltbares Banner (neuer Admin-Bereich „Cookies")
- Technisches Blocking: externe JS-Dateien werden erst nach Zustimmung zur zugeordneten Kategorie geladen, bekannte iframe-Embeds (YouTube, Google Maps, …) werden bis zur Zustimmung durch einen Platzhalter ersetzt

### Changed
- JS-Manager (`/api/js`) unterstützt jetzt eine Cookie-Kategorie pro Datei

---

## [0.13.0] - 2026-09-24

### Added
- Navigationen, Footer und Maintenance-Seiten (404/503/keine Startseite/Ladebildschirm) liegen jetzt als Dateien vor (`public/assets/template/navigation|footer|maintenance/...`), analog zu den bereits datei-basierten Block-/Site-Templates
- Automatischer Export-Schritt beim Server-Start (`scripts/auto-export-legacy-db-content.js`): rettet Navigation-/Footer-/Template-/Maintenance-Daten aus der DB in Dateien, bevor die Migration die zugehörigen Tabellen entfernt — nötig für bestehende ältere Instanzen beim Update
- Backup/Export- und Import-Tool berücksichtigen Navigationen, Footer und Maintenance-Seiten jetzt korrekt (vorher fehlte Maintenance komplett im Export)

### Changed
- `Template`/`TemplateRevision`-Tabellen entfernt (waren bereits seit der Block-Template-Dateiumstellung ungenutzt)

### Fixed
- Navigations-Fallback ohne seitenspezifische Navigation lieferte dem PAGE-Typ-Template keine Seitenliste (`pages`), nur `anchors` — betraf u. a. "Weitere Künstler"-Übersichten

---

## [0.12.0] - 2026-09-23

### Added
- Alternative Tabellenansicht für die Seitenübersicht im Admin-Bereich: kompakte, eingerückte Baumdarstellung als Umschalt-Option neben der Kartenansicht

---

## [0.11.0] - 2026-09-23

### Added
- Seitennavigationen (Navigation vom Typ PAGE) sind jetzt direkt im Block-Template-Dropdown des Content-Editors auswählbar und lassen sich als eigener Block an beliebiger Stelle in den Seiteninhalt einfügen
- Neues Feld "Navigations-Bild" in den Seiteneinstellungen, das pro Seite ein Bild speichert und in Seitennavigationen als `{{data.navImage}}` verfügbar macht

---

## [0.10.0] - 2026-09-23

### Added
- Kontaktformular-Templates: eigener Admin-Bereich mit Presets und kategorisiertem Datei-Store
- Spam-Schutz (Altcha) für Kontaktformulare
- Docker: db-init-Service und sicheres Passwort-Handling im Setup

### Changed
- Verbessertes Verhalten beim Deployment auf bestehende Docker-Stacks

### Fixed
- Templates werden jetzt korrekt in Backups einbezogen

---

## [0.9.0] - 2026-05-09

### Added
- Option to hide individual pages from navigation via page metadata
- Loading of active external CSS files for maintenance and error pages (404/503)
- Robust page preview URL resolution for nested page trees
- Icon picker modal in the template editor for quick Font Awesome insertion
- Extended file handling utilities (name normalization, unique name generation, metadata repair helpers)

### Changed
- Icon system migrated to MUI-based wrapper API for unified icon usage across admin views
- Build and runtime compatibility improved for modern Turbopack workflows

### Fixed
- Fixed nested page preview links opening invalid frontend paths
- Fixed missing style injection on maintenance-related pages
- Fixed icon import/build issues in production after icon migration

---

## [0.8.0] – 2026-04-07

### Added
- Alpha tab functionality for Content Models and Importer views
- New template editor with improved UI and visual structure
- Anchor ID input field per block in PageEditor
- Block template selection dropdown directly in block header

### Changed
- Block title row layout refactored to flexbox for consistency
- Block movement controls (Up/Down/Indent/Outdent) improved
- Template engine cleaned up: removed unused template code references

### Fixed
- Build error: missing `@babel/runtime` dependency added explicitly (`next-auth` peer dep)

---

## [0.7.0] – Project Rename & UI Overhaul

### Changed
- **Project renamed from TempHelix to Temgine CMS** – updated all configs, README, and branding
- Admin navbar updated with new logo image link
- Favicon and site logo metadata added
- Global UI styles revised for improved consistency and accessibility
- Page block list layout improved with flexbox

### Added
- Live preview panel in PageEditor (rendered HTML preview, unsaved state)
- Toggle published/draft status for page tree nodes
- Fallback logic: fetch homepage with drafts if published version not found

---

## [0.6.0] – Deployment, Setup & Auth

### Added
- Setup page with initial admin creation endpoint (`/setup`, `/api/setup/create-admin`)
- Auto database migration on server startup for Plesk deployments
- Diagnostic script for checking environment variables (`scripts/check-env.js`)
- Migration helper scripts for Plesk (`scripts/migrate.js`)
- Improved error handling in setup process and database interactions
- `server.js` for custom startup with auto-migration support

### Changed
- Authentication logic refactored and login instructions updated
- Prisma 5.x compatibility: dependencies updated (`360cd83`)

---

## [0.5.0] – Import, Backup & Snippet System

### Added
- **Backup feature**: full page and data backup/restore via BackupView
- HTML Importer: import external HTML into page blocks (`lib/htmlImporter.js`)
- Template Matcher: match imported HTML blocks to existing templates (`lib/templateMatcher.js`)
- Database export and import functionality with toast notifications
- Snippet label system: dynamic field labels editable per template variable

### Changed
- Snippet handling overhauled: type metadata, handler support, unescaped HTML output
- Template parsing refactored: improved variable extraction and snippet binding

---

## [0.4.0] – Template Engine & PageEditor

### Added
- Structure preview component (`TemplateStructurePreview`) for page block hierarchy
- Block slots: dynamic slot assignment for page blocks
- Field selection in PageEditor with scroll-to-field and focus management
- `guessInputType()` for automatic field widget selection (text, textarea, URL, ...)
- Search functionality in SnippetsView and TemplatesViewModern
- CodeEditor: dark mode support and segmented template selection

### Changed
- Template engine: removed navigation placeholders, simplified rendering logic
- Block rendering enhanced to support nested children insertion
- PageEditor: field references (`fieldNodeRefs`) for targeted scrolling and focus

---

## [0.3.0] – CSS Manager, Nested Blocks & Content Models

### Added
- CSS Manager View: upload and manage external CSS files
- Content Models View (`ContentModelsView`) with state management and editing
- PageEditor: nested block support (indent/outdent, child blocks, recursive rendering)
- Anchor navigation with dynamic loading and template integration
- Dynamic heading snippets
- HTML sanitization for page and snippet content (`lib/htmlSanitize.js`)
- PageTreeEditor: improved slug generation, prevent self-reference in template buttons

### Changed
- Navigation rendering refactored in template engine (annotated hierarchical pages)
- Upsert logic in pages API limited to top-level nodes only
- Admin page converted to client-only component (prevent SSR errors)
- Error boundary added to Admin component
- Dynamic imports for all heavy Admin components (lazy loading, no SSR)

---

## [0.2.0] – Core CMS Features

### Added
- `isHomepage` field on pages; homepage rendering logic
- `PageEditor` with block-based editing, text blocks, gallery blocks
- Template variable parsing from HTML (`lib/templateParser.js`, `lib/templateFields.js`)
- Snippets: heading, custom HTML, bound snippets in templates
- Navigation system with `PageTreeEditor`
- Prisma schema: `Page`, `Template`, `Snippet`, `Navigation`, `ContentModel` models
- Database migration scripts (`scripts/migrate-json-to-db.js`, etc.)
- Audit log (`lib/audit.js`)
- User invitation system (`UserInvitationsView`, invite token flow)

### Changed
- Template engine: supports `{{VAR}}` placeholder replacement, slot-based block rendering
- Tabbed editing interface in Admin (`AdminPageClient`)

---

## [0.1.0] – Foundation

### Added
- Initial project scaffold (Next.js 14, Prisma, NextAuth)
- Base template engine (`lib/templateEngine.js`)
- JSON-based data storage as starting point (`data/pages.json`, `data/templates.json`, etc.)
- `[...slug].js` catch-all routing for page rendering
- Basic admin panel skeleton
- Init data: default pages, templates, snippets, navigations (`init/`)
