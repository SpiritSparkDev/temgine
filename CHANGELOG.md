# Changelog

All notable changes to **Temgine CMS** are documented in this file.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.22.1] - 2026-10-01

### Fixed
- `POST /api/pages` (Array-Save) lehnte Slug-Duplikate bisher global über den GESAMTEN Seitenbaum ab, nicht nur zwischen echten Geschwister-Seiten. Da `findPageByPath` (`pages/[...slug].js`) beim Auflösen einer URL pro Segment aber immer nur innerhalb der Kinder des zuvor gefundenen Knotens sucht, sind zwei gleich benannte Seiten unter unterschiedlichen Elternseiten (z. B. `/team-a/lydia` und `/team-b/lydia`) gar keine echte URL-Kollision — die alte Prüfung blockierte solche (unbedenklichen) Fälle dennoch dauerhaft, inklusive aller bereits vor Einführung der Prüfung in 0.18.2 bestehenden Datenbestände. Die Prüfung nutzt jetzt dieselbe Geschwister-genaue Erkennung wie das in 0.22.0 eingeführte `/repair`-Werkzeug (`lib/pageTreeRepair.js`); echte Kollisionen (gleicher Slug unter derselben Elternseite) werden weiterhin abgelehnt.

---

## [0.22.0] - 2026-10-01

### Added
- Neues Reparatur-Werkzeug unter `/repair` (ADMIN-only, zusätzlich über Einstellungen → „Wartung & Reparatur" verlinkt): scannt den Seitenbaum gezielt auf echte Slug-Kollisionen zwischen Geschwister-Seiten und auf doppelte Seiten-ids und behebt sie einzeln direkt in der Datenbank, ohne dass dafür — anders als beim normalen Speichern über den Editor — der komplette Seitenbaum fehlerfrei sein muss. Hintergrund: Die in 0.18.2/0.18.3 eingeführte Speicher-Validierung prüft Slugs global über den gesamten Baum, blockiert dadurch aber auch bereits länger bestehende Datenbestände, bei denen keine Migration lief. Das neue Werkzeug unterscheidet außerdem zwischen echten Kollisionen (gleicher Slug unter derselben übergeordneten Seite — eine der Seiten ist dadurch unerreichbar) und harmlosen Namensgleichheiten unter unterschiedlichen Elternseiten, die keine echte URL-Kollision darstellen und nicht gemeldet werden. Alle Reparaturen werden im Audit-Log protokolliert (`REPAIR_FIX_SLUG`/`REPAIR_FIX_ID`).

---

## [0.21.0] - 2026-10-01

### Added
- Backup-Bereich: Projekttransfer-Export lässt sich jetzt im Umfang einschränken — „Vollständig" (wie bisher), „Datenbank + Templates" (zusätzlich Navigationen, Footer, Maintenance-Seiten, CSS, aber ohne Uploads) oder „Nur Datenbank" (nur Seiten, Snippets, Globale Variablen). Der Import-Dialog zeigt den Umfang eines geladenen Backups an und weist bei der „Ersetzen"-Strategie explizit darauf hin, dass nur die im Backup enthaltenen Kategorien gelöscht/ersetzt werden.

### Fixed
- `POST /api/admin/import?strategy=replace` löschte beim Wiederherstellen bisher *alle* bestehenden Templates/Navigationen/Footer/CSS/Uploads, unabhängig davon, ob das importierte Backup diese Kategorien überhaupt enthielt — ein unvollständiges Backup (z. B. nur Datenbank) hätte mit „Ersetzen" sämtliche Templates und Uploads gelöscht, obwohl das Backup sie nie beinhaltete. Der Import prüft jetzt anhand der Export-Metadaten (`filesIncluded`), welche Kategorien tatsächlich im Backup enthalten sind, und wendet „Ersetzen" nur auf diese an — fehlende Kategorien bleiben unangetastet. Alte Backups ohne diese Metadaten verhalten sich unverändert wie bisher.

---

## [0.20.0] - 2026-10-01

### Added
- Seiten-Editor: neuer "Zurück"-Button links in der Sticky-Toolbar, der direkt (ohne Speichern) zur Seitenübersicht zurückspringt — bei ungespeicherten Änderungen weiterhin mit Bestätigungsdialog. Nutzt die bisher ungenutzte `handleCancelClick`/`onCancel`-Funktion, die zuvor an keiner Stelle der Oberfläche verdrahtet war.

---

## [0.19.0] - 2026-09-30

### Added
- Projekttransfer-Erstellung (Export) und Import/Restore im Backup-Bereich zeigen jetzt ein Popup mit Fortschrittsbalken statt nur eines Spinners im Button. Beim Erstellen wird der tatsächliche Download-Fortschritt anhand der `Content-Length` angezeigt, beim Einspielen der Upload-Fortschritt des Requests, gefolgt von einem unbestimmten "Wird verarbeitet…"-Zustand während der Server die Daten schreibt. Bei Erfolg schließt sich das Popup automatisch, bei einem Fehler bleibt es mit Fehlermeldung offen und muss manuell geschlossen werden.

---

## [0.18.3] - 2026-09-30

### Added
- `POST /api/pages` (Array-Save) lehnt jetzt auch Bäume ab, in denen dieselbe Seiten-`id` mehrfach vorkommt (z. B. eine Seite gleichzeitig an ihrem alten und neuen Platz nach einem Verschieben/Verschachteln) — zusätzlich zur bereits in 0.18.2 eingeführten Slug-Eindeutigkeitsprüfung. Der Seitenbaum-Editor prüft das serverseitige Ergebnis eines Drag&Drop-Verschiebens (`handleDropOnNode`) jetzt ebenfalls lokal ab und bricht mit einer Fehlermeldung ab, statt einen fehlerhaft verdoppelten Baum zu speichern.

---

## [0.18.2] - 2026-09-30

### Fixed
- Verschachtelte Seiten (im `children`-JSON ihrer Top-Level-Elternseite gespeichert) konnten über das Slug-Feld im Seiten-Editor auf einen bereits vergebenen Slug umbenannt werden, ohne dass Client oder Server das prüften — anders als Top-Level-Seiten, deren Slug per DB-Constraint eindeutig sein muss. Da `findPageByPath` (`pages/[...slug].js`) beim Auflösen einer URL Segment für Segment immer das erste passende Kind nimmt, wurde der Inhalt der zweiten (und jeder weiteren) Seite mit demselben Slug dauerhaft unerreichbar, obwohl er in der Datenbank erhalten blieb — sichtbar u. a. als scheinbar doppelte Einträge in der Seiten-Liste und als "Seite nicht gefunden" beim direkten Aufruf der verdeckten URL. `POST /api/pages` lehnt Array-Saves mit doppeltem Slug (auch verschachtelt) jetzt mit 400 ab, bevor irgendetwas geschrieben wird; der Seiten-Editor meldet einen Konflikt schon vor dem Speichern.

---

## [0.18.1] - 2026-09-30

### Fixed
- Der in 0.18.0 eingeführte Postgres-Reconcile-Mechanismus wurde als per Bind-Mount eingebundene Datei (`docker/postgres-entrypoint.sh`) ausgeliefert. Fehlt diese Datei auf dem Host beim Container-Start (z. B. bei Portainer-Stacks ohne vollständiges Git-Checkout), legt Docker dort kommentarlos ein leeres Verzeichnis an statt zu mounten — der Container scheiterte dann mit `Is a directory` und blieb dauerhaft `unhealthy`. Das Skript läuft jetzt inline als `command:` in `docker-compose.yml`, ganz ohne zusätzliche Datei, damit es unabhängig davon funktioniert, wie das jeweilige Deploy-Tool den Stack bereitstellt.

### Added
- Docker: `postgres`-Service gleicht Rollen-Passwort und Datenbank bei jedem Container-Start automatisch gegen die aktuellen `DATABASE_*`-Werte ab (`docker/postgres-entrypoint.sh`), statt nur beim allerersten Init des Volumes. Verhindert stille Auth-Fehler ("password authentication failed") bzw. fehlende Datenbanken nach Deploy-Tool-Wechseln oder geänderten Zugangsdaten, ohne dass Daten im Volume angefasst werden.

### Fixed
- Mehrere API-Routen (`/api/pages`, `/api/users`, `/api/files`) prüften Authentifizierung/Rollen nicht, obwohl `lib/auth.js` die passenden Berechtigungen dafür bereits definiert (`PAGES_EDIT`/`PAGES_DELETE`, `USERS_VIEW`/`USERS_EDIT`, `FILES_UPLOAD`/`FILES_DELETE`). Schreibende Endpunkte (Seiten anlegen/löschen, Nutzer auflisten/löschen, Dateien hoch-/herunterladen/löschen, Ordner rekursiv löschen) waren dadurch unauthentifiziert erreichbar; lesende bzw. von der öffentlichen Website genutzte Endpunkte (`GET /api/pages`, `GET /api/files`) bleiben bewusst offen.
- `/api/database/migrate` und `/api/database/test-connection` entfernt: nahmen unauthentifiziert eine beliebige `connectionString` aus dem Request-Body entgegen und verbanden sich damit (SSRF-Risiko), `migrate` löschte zudem Daten und referenzierte ein `Template`-Modell, das im aktuellen Prisma-Schema nicht mehr existiert. Beide Endpunkte waren im Code nirgends mehr referenziert.

---

## [0.17.1] - 2026-09-30

### Fixed
- Docker: Healthcheck des `postgres`-Service prüfte `pg_isready -U ${DATABASE_USER}` ohne `-d`, wodurch `pg_isready` den Benutzernamen als Datenbanknamen annahm. Existierte keine gleichnamige Datenbank, spammte der Check im 2-Sekunden-Takt `FATAL: database "..." does not exist` ins Postgres-Log (reines Log-Rauschen, der Server selbst lief sauber). Healthcheck prüft jetzt explizit gegen `-d postgres`, das immer existiert.

---

## [0.17.0] - 2026-09-30

### Added
- Seitenbaum (PageTreeEditor): Seiten lassen sich jetzt per Drag & Drop umsortieren (davor/danach einordnen oder als Unterseite ablegen). Ein neues "Hinzufügen"-Menü an jeder Seite bündelt Unterseite/Geschwisterseite/Duplizieren an einer Stelle.

### Changed
- Docker: Compose-Service von `app` auf `temgine` umbenannt.

---

## [0.16.1] - 2026-09-30

### Fixed
- Projekttransfer-Export (ZIP) brach bei großen Uploads-Ordnern (mehrere GB) ab: alle Upload-Dateien und -Fonts wurden komplett Base64-kodiert in den Arbeitsspeicher geladen und das ZIP erst als ein einziger Buffer erzeugt, bevor überhaupt Daten an den Browser gingen — das sprengte je nach Datenmenge den Node-Heap oder die V8-String-Längengrenze. Uploads/Fonts werden jetzt per Stream direkt von der Platte ins ZIP geschrieben und das ZIP wird wie der statische Website-Export gestreamt statt komplett gepuffert.

---

## [0.16.0] - 2026-09-30

### Added
- Neuer Platzhaltertyp `{{#folder}}…{{/folder}}` (und benannt: `{{#folder:name}}…{{/folder:name}}`) für Block-Vorlagen: erzeugt im Seiten-Editor ein Ordner-Auswahlfeld (Upload-Ordner) und iteriert beim Rendern automatisch über alle Dateien darin — inklusive aller Unterordner (rekursiv), ohne manuelles Anlegen einzelner Einträge. Pro Datei stehen `name`, `slug`, `url`, `path`, `ext`, `size`, `modified` und `isImage` zur Verfügung, z. B. für Bild-/Dokumentgalerien.

---

## [0.15.2] - 2026-09-30

### Fixed
- Mehrere Editoren im Adminbereich schlossen sich nach dem Speichern selbstständig statt geöffnet zu bleiben: CSS-Manager, JS-Manager, Navigations-Template-Editor, Footer-Editor, Globale Variablen, Content-Modelle und Content-Einträge im Kontaktformular-Template-Editor. Speichern lädt jetzt nur noch die Liste neu und aktualisiert den Editor-Inhalt mit dem gespeicherten Datensatz, schließt das Panel aber nicht mehr.

---

## [0.15.1] - 2026-09-29

### Fixed
- Template Manager → Seiten-Datenfelder: eine neu gespeicherte oder gelöschte Vorlage tauchte im Seiten-Editor-Dropdown erst nach vollem Reload auf — der Tab rief `onSaved()` nicht auf, sodass die App-weite Templateliste veraltet blieb (beim manuellen Testen von 0.15.0 aufgefallen).

---

## [0.15.0] - 2026-09-29

### Added
- Neuer Vorlagentyp „Seiten-Datenfelder" im Template Manager (eigener Tab): eine Vorlage deklariert per `{{feldname:typ}}`-Platzhaltern (gleiche Syntax/Typen wie Block-Vorlagen), welche freien Datenfelder eine Seite anbieten soll — inkl. Live-Vorschau der erkannten Felder beim Bearbeiten.
- Seiten-Editor (Einstellungen): Neue Auswahl „Seiten-Datenfelder" — eine Seite wählt eine dieser Vorlagen, die deklarierten Felder erscheinen automatisch als passende Eingabefelder (Text, Textarea, Zahl, URL, Bild, Datum, Farbe, Liste), geschrieben nach `page.data`.
- `{{data.X}}` als kürzerer Alias für `{{page.data.X}}` in Block-Templates — einheitlich mit der Schreibweise, die Navigations-Templates für Seiten-Datenfelder schon nutzen.

### Fixed
- `isCurrent`/`data` je Seite in `{{#pages}}` fehlten bisher auf der Startseite (`pages/index.js`) und im Static-Site-Export (`pages/api/admin/export.js`) — beide Renderpfade lieferten dort nur `pages/[...slug].js` und den Live-Snapshot vollständig. Alle vier Renderpfade liefern jetzt gleichermaßen `isCurrent`/`data`.
- Referenz-Tab im Template Manager: `{{#customAnchors}}` fehlte in der Liste der Navigations-Variablen (0.14.7 nachgereicht).

---

## [0.14.8] - 2026-09-29

### Changed
- Navigationsverwaltung: Doku-Sidebar rechts komplett überarbeitet — jetzt vollständige Platzhalter-Referenz (`{{{nav:...}}}` sowie `pages`/`children`/`childPages`/`anchors`/`customAnchors`), eine Mustache-Kurzreferenz, eine Best-Practices-Liste und zwei vollständige Beispiel-Snippets, statt bisher nur der Grundlagen (zwei Typen, drei Einbindungswege, kurze Platzhalter-Tabelle).

---

## [0.14.7] - 2026-09-28

### Added
- Seiten-Editor (Einstellungen): Neuer Bereich „Freie Sprungmarken" (`page.data.customAnchors`) neben der Anker-Navigation — für Ziel-IDs, die nicht über das Anchor-ID-Feld eines Blocks kommen, sondern z. B. aus einem eigenen Template-Feld gerendert werden. Freie Texteingabe statt Dropdown-Auswahl, verfügbar in PAGE-Navigationen als `{{#customAnchors}}`.
- Navigationsverwaltung: Neues Preset „Anchor Sidebar (freie Ziel-IDs)" für `{{#customAnchors}}`, als Pendant zum bestehenden „Anchor Sidebar"-Preset.

### Fixed
- Anker-Navigation (`{{#anchors}}`, 0.14.6): Das Dropdown zur Auswahl der Ziel-ID zeigte ausschließlich Blöcke mit gesetztem Anchor-ID-Feld — Seiten, deren Ziel-IDs aus eigenen Template-Feldern kommen, konnten so keine passenden Einträge anlegen und die Anker-Liste blieb in Prod trotz Update leer. `anchors` bleibt bewusst auf das Anchor-ID-Feld beschränkt (keine Tippfehler möglich); der neue `customAnchors`-Bereich deckt den freien Fall ab.

---

## [0.14.6] - 2026-09-28

### Added
- Seiten-Editor: Block per Dialog in eine andere Seite kopieren oder verschieben (neue Buttons je Block).
- Seiten-Editor (Einstellungen): Editor für die Anker-Navigation (`page.data.anchors`) — Blöcke mit gesetzter Anchor-ID lassen sich per Dropdown auswählen, mit eigenem Anzeigetext versehen, sortieren und entfernen. Damit funktioniert `{{#anchors}}` in PAGE-Navigationen jetzt tatsächlich; bisher gab es dafür kein Formularfeld (siehe `help/navigationen.md`) und die Liste blieb immer leer.

### Fixed
- Block in andere Seite verschieben: Ziel-Update und Entfernen aus der Quellseite liefen als zwei getrennte Speichervorgänge, die sich überholen konnten — der zweite überschrieb dabei den gerade hinzugefügten Block auf der Zielseite mit einem veralteten Snapshot. Beide Änderungen laufen jetzt in einem atomaren Speichervorgang.

---

## [0.14.5] - 2026-09-25

### Fixed
- Docker-Deployment: `app`-Bind-Mounts (`/app/data`, `/app/public`) zeigten auf `/srv/docker/<Projekt>/...` — auf Docker Desktop für Windows (WSL2-Backend) ein Pfad *innerhalb* der VM, ohne Windows-Explorer-Zugriff. Persistenz über Container-Neustarts funktionierte, war aber vom Host aus unsichtbar. Auf relative Pfade (`./data`, `./public`) umgestellt, die direkt im Checkout landen — echte bilaterale Bind-Mounts, jetzt auch unter Windows sichtbar/bearbeitbar.
- Beim Umzug aufgefallen: `data/navigations/`, `data/fonts-config.json` und `data/.templates-order.json` fehlten im laufenden Container (unvollständiges Datenverzeichnis, vermutlich aus einem früheren Volume-Reset) — aus dem lokalen Checkout wiederhergestellt.

### Changed
- `data/pages.json`, `templates.json`, `snippets.json` sowie alte `data/backups/*.json` aus dem Repo entfernt — Altlasten aus der Zeit vor der Postgres-Migration (`scripts/migrate-json-to-db.js`), zur Laufzeit nicht mehr gelesen.
- `public/favicon/` aus dem Repo entfernt, um mit dem aktuellen (favicon-losen) Container-Stand übereinzustimmen.
- `.dockerignore`: `public/` und `data/` ausgeschlossen (werden zur Laufzeit ohnehin per Bind-Mount überschrieben, mussten nicht mehr ins Image kopiert werden).

---

## [0.14.4] - 2026-09-24

### Changed
- Textarea-Felder im Rich-Text-Editor (Markdown-Modus, z. B. beim Bearbeiten von Seitentexten): Feld ist jetzt immer volle Breite (`.field-item-textarea` spannte bisher nur eine von drei Grid-Spalten) und wächst automatisch mit dem Inhalt bis max. 50 Zeilen, statt fest 4 Zeilen mit manuellem Resize-Griff.

---

## [0.14.3] - 2026-09-25

### Fixed
- Drei weitere Fälle desselben Icon-Import-Musters (Icon im JSX verwendet, aber nicht importiert bzw. nie in `lib/muiIcons.js` vorhanden) — gefunden von einem SSH-Agenten auf einer Prod-Instanz, hier gegen den Code verifiziert und behoben:
  - `pages/invite/[token].js`: `AlertCircle` (ungültiges/abgelaufenes Einladungstoken) und `CheckCircle` (erfolgreicher Account-Abschluss) fehlten — Absturz beim Aufruf eines ungültigen Einladungslinks bzw. direkt nach erfolgreichem Onboarding
  - `components/MemberGroupsAdminView.js`: `<Pencil>` wurde verwendet, existiert aber gar nicht in `lib/muiIcons.js` — Absturz der Mitgliedergruppen-Liste, sobald eine Gruppe existiert; auf das bereits importierte `Edit2` umgestellt
  - `components/MembersAdminView.js`: `<UserCheck>` existierte ebenfalls nicht — Absturz der Mitgliederliste bei gesperrten Mitgliedern; `lib/muiIcons.js` um einen `HowToReg`/`UserCheck`-Eintrag ergänzt
- Ganzes Projekt (`components/`, `pages/`) auf weitere Fälle dieses Musters durchsucht — keine weiteren gefunden

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
