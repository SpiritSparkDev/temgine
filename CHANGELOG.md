# Changelog

All notable changes to **Temgine CMS** are documented in this file.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.36.0] - 2026-10-08

### Added
- **Feldtyp `:checkbox`:** `{{feld:checkbox}}` rendert im Editor eine Checkbox (Block-Felder, Wiederholungs-Unterfelder und Seiten-Datenfelder). Gespeichert wird `true` bzw. leer – passt zu `{{#if:feld}}…{{/if:feld}}`; die Annotation wird beim Rendern entfernt. Bereits gespeicherte Texte `"true"`/`"1"` erscheinen als angehakt. Dokumentiert in der Typen-Tabelle des Template-Editors.
- **Feldtyp `:select(…)` (Dropdown):** `{{ausrichtung:select(links, mitte, rechts)}}` bzw. mit Beschriftung `select(Links=left, Mitte=center)` rendert im Editor ein Dropdown (Block-Felder, Wiederholungs-Unterfelder, Seiten-Datenfelder). Ausgegeben wird der Wert; ein gespeicherter Wert außerhalb der Liste bleibt als Eintrag erhalten. Ohne Klammer-Liste verhält sich `:select` wie bisher wie `:text`.
- **Dokumentation im Editor:** Die Referenz in der rechten Sidebar des Template-Editors ist jetzt eine Kurzreferenz. Der Button „Ausführliche Doku mit Beispielen“ und die „Beispiele →“-Links öffnen ein Dokumentations-Fenster (`components/HelpDocModal.js`), das die Anleitungen aus `help/*.md` rendert und direkt zum passenden Abschnitt springt. Neu: `help/templates.md` (Variablen, Feldtypen, Checkbox, Select, Bedingungen, Wiederholungen, Ordner, Systemvariablen). Die Anleitungen liefert `GET /api/help` bzw. `GET /api/help/<name>` (nur `help/*.md`, kein freier Pfad).
- **FAQ-Akkordeon:** Startzustand pro Frage über die Checkbox „Offen" (Felder in Wiederholungsblöcken werden nur aus normalen `{{Feld}}`-Platzhaltern erkannt, nicht aus `{{#if:…}}` – deshalb steht `{{Offen:checkbox}}` in einem Kommentar im Block).

---

## [0.35.0] - 2026-10-08

### Added
- **Datei-Auswähler (Galerie):** Mehrfach kombinierbare Filter nach Dateityp, Erstellungs- und Änderungsdatum sowie Sortierung A→Z / Z→A. `GET /api/files` liefert zusätzlich `created`.
- **Datei-Auswähler Performance:** Galerie rendert 60 Dateien auf einmal (Button „Mehr laden“), Bilder laden lazy, Kacheln außerhalb des Sichtbereichs werden nicht gerendert – flüssig auch bei tausenden Dateien.

### Fixed
- **Datei-Auswähler Upload:** Im Ordner-Tab landen Uploads jetzt im geöffneten Ordner (vorher immer im Root), die Ordneransicht wird danach neu geladen, und der Erfolgs-Toast zeigt die tatsächliche Anzahl statt immer „erfolgreich“.

---

## [0.34.0] - 2026-10-08

### Added
- **Dateimanager:** Dateien, die bereits in Seiten, Templates, Snippets, Navigationen, Inhalten, Blog-Beiträgen oder Einstellungen eingebunden sind, tragen das Badge „In Verwendung“ (`pages/api/files/usage.js`).

### Changed
- **Content-Editor:** „Erweiterte Optionen“ liegt jetzt als Button „Erweitert“ in der Toolbar neben Vorschau, Split und Verlauf (statt in der Seiten-Sidebar).

### Fixed
- Der Dateiwähler für das Navigations-Bild öffnete sich hinter dem Dialog „Erweiterte Optionen“; er liegt jetzt davor.

---

## [0.33.0] - 2026-10-08

### Added
- **Add-on „Externe Quellen“:** In Einstellungen → *Externe Quellen* zuschaltbar. Verwaltet Quellen vom Typ SFTP, Nextcloud (WebDAV, App-Passwort) und S3 (AWS oder kompatibel, z. B. MinIO). Im Dateimanager importiert „Von externer Quelle“ ausgewählte Dateien und ganze Ordner in den aktuellen Upload-Ordner (kein Überschreiben, Limit 1000 Dateien / 200 MB je Datei). Zugangsdaten sind write-only und werden nie an den Browser ausgeliefert (`lib/externalSources.js`, `pages/api/external-sources.js`).

---

## [0.32.0] - 2026-10-08

### Added
- **Picgine-Galerien:** Anbindung der Foto-App Picgine. Templates binden Galerien über `{{#picgine:name}}…{{/picgine:name}}` ein (im Seiten-Editor per Auswahlfeld „Picgine-Galerie“, hierarchisch mit 🔒 für geschützte) oder fest über `{{#picgine:name=slug}}`. Kontext: `title`, `images` (mit `index`), `locked`, `lockPassword`/`lockLogin`, `loggedIn`, `cover`, `children` u. a.; ohne Galerie bleibt die Section leer (`lib/templateParser.js`, `lib/templateEngine.js`).
- Proxy-Routen `pages/api/picgine/` (Galerie-Liste nur für Admins, Galerie-Daten, Entsperren mit Rate-Limit, Logout) und Client `lib/picgine.js`; der Viewer-Token liegt 30 Tage im HttpOnly-Cookie `temgine_picgine`, der API-Schlüssel bleibt serverseitig.
- `lib/picgineRuntime.js`: Entsperr-Formulare (`data-picgine-unlock`) und Logout (`data-picgine-logout`) ohne eigenes JS; danach Neu-Rendern ohne Seiten-Reload und Event `picgine:rendered`.
- Einstellungen → **Picgine** (URL, write-only API-Schlüssel, „Verbindung testen“), Hilfe `help/picgine-galerien.md`. Der Live-Snapshot enthält öffentliche Galerien; Seiten mit gesperrter Galerie werden dynamisch gerendert.

### Security
- `GET /api/settings` (öffentlich) gibt `picgine_api_key` und `smtp_pass` nicht mehr heraus, nur noch `<key>_set`.

### Fixed
- Live-Snapshot (`/__live`) lieferte im Produktionsserver 404, weil Next nur beim Start vorhandene `public/`-Dateien ausliefert — der statische Modus funktioniert jetzt.
- Bilder einer per http angebundenen Picgine wurden von der CSP blockiert: der Picgine-Origin wird zur `img-src` hinzugefügt.

---

## [0.31.1] - 2026-10-07

### Fixed
- Docker-Build schlug mit "Module not found" in `node_modules/@codemirror/language` fehl: `npm install` ohne Lockfile lieferte (und cachte) einen unvollständigen Abhängigkeitsbaum. Das Dockerfile nutzt jetzt `package-lock.json` mit `npm ci` für reproduzierbare Installationen.

---

## [0.31.0] - 2026-10-07

### Added
- **Favicon-Upload** unter Einstellungen → Allgemein → Favicon: Eine hochgeladene Grafik wird per `sharp` automatisch quadratisch zugeschnitten und in `favicon.ico`, 16×16, 32×32 und Apple-Touch-Icon (180×180) umgewandelt (`pages/api/settings/favicon.js`, Ablage in `public/uploads/favicon/`, damit sie im Docker-Volume erhalten bleibt). `pages/_app.js` bindet die Dateien von dort ein; der Verweis auf die nicht existierende `site.webmanifest` entfällt.

---

## [0.30.0] - 2026-10-06

### Changed
- **Ruhigere Feldmasken im Seiten-Editor:** Felder ohne eigene Box (eine Rahmenebene pro Block), Labels normal geschrieben in lesbarer Systemschrift statt orangefarbener Mini-Versalien in Monospace.
- **Link-Feld:** Art-Auswahl "Interne Seite" (Dropdown mit allen Seiten und Pfad), "Externe URL" oder "Datei"; die Art wird aus dem Wert erkannt.
- **Bild-Feld:** Thumbnail mit Klick zum Auswählen, Buttons "Ändern" und "Entfernen", URL-Eingabe als Alternative.
- Begriffe: "Anchor ID" → "Sprungmarke", "Kindblöcke" → "Unterblöcke", Repeater-Buttons und -Einträge tragen den Namen des Repeaters ("Features hinzufügen", "Features 1").

### Fixed
- Feldnamen wie "Link Text"/"Link Label" wurden als URL-Feld erkannt (`guessInputType`); sie sind jetzt normale Textfelder.

---

## [0.29.2] - 2026-10-05

### Security
- `PUT /api/settings` hatte keine Anmeldeprüfung: Jeder, der die Seite erreichte, konnte Einstellungen (SEO, Wartungsseiten, Admin-Logo, Matomo, SMTP-Passwort …) ändern. Schreibzugriff ist jetzt auf eingeloggte Admins und Moderatoren beschränkt (gleiche Rollen wie Templates/CSS/JS); `GET` bleibt öffentlich, weil ausgelieferte Seiten die Einstellungen lesen.

---

## [0.29.1] - 2026-10-05

### Changed
- Content-Security-Policy: `frame-src` erlaubt zusätzlich `https://www.youtube.com` und `https://www.youtube-nocookie.com`, damit eingebettete YouTube-Videos auf ausgelieferten Seiten nicht mehr von der CSP blockiert werden. (Fehler 153 in den `srcdoc`-basierten Editor-Vorschauen ist eine YouTube-Referrer-Einschränkung und davon nicht betroffen.)

---

## [0.29.0] - 2026-10-05

### Added
- **Admin-Logo überschreibbar:** Einstellungen → Allgemein → Erscheinungsbild: Logo hochladen oder per URL/Pfad setzen (Setting `admin_logo_url`), Zurücksetzen auf das Temgine-Logo; die Admin-Navigationsleiste übernimmt Änderungen ohne Neuladen.

### Changed
- **Einstellungen neu gestaltet:** Vier Tabs (Allgemein, SEO, Statistik, Live & Wartung) statt einer langen Seite; Karten mit Titel, Beschreibung und einheitlichen Zeilen/Bedienelementen, Speichern pro Karte, gemerkter Tab, responsive. Alle bisherigen Einstellungen bleiben erhalten.

---

## [0.28.0] - 2026-10-05

### Added
- **Schneller zur Bearbeitungsstelle im Editor:** Ein Klick in der Split-Vorschau auf Text, Bild oder Link springt direkt zum passenden Feld (auch in Repeater-Einträgen und in verschachtelten Blöcken); zugeklappte Blöcke und Repeater-Einträge werden dafür aufgeklappt. Die Zuordnung steckt in `lib/previewFieldMatch.js` (mit Tests).
- Block-Header zeigen immer eine Inhaltszeile (erster gefüllter Text, erstes Bild); Toolbar-Button "Übersicht" klappt alle Blöcke zu einer Liste zusammen bzw. wieder auf.

### Fixed
- Klick in der Split- bzw. Strukturvorschau scrollte den Editor nicht zur Stelle (zu knappes "nearest"-Scrollen, Ziel unter der Sticky-Toolbar, kein Neu-Auslösen bei gleichem Block). Der Editor scrollt jetzt zum Blockanfang bzw. Feld, auch bei erneutem Klick.

---

## [0.27.0] - 2026-10-05

### Added
- **Template-Auswahl als Popup** (`TemplatePickerModal`): Statt des Dropdowns im Block-Header öffnet ein Dialog mit Suche und Farblegende. Jede Karte zeigt das Template schematisch mit farbigen Feldern je Datentyp (Text, Richtext, Bild, Link, Zahl, Datum, Farbe, Auswahl, Liste, Ordner) und Repeatern.
- **Feld-Gruppen im Template:** `{{titel:text|Inhalt}}` ordnet ein Feld einem Abschnitt im Editor zu (Parser + Render-Engine strippen die Annotation). Ohne Angabe: "Inhalt", Auswahl/Farbe/Zahl/Level/Klasse automatisch "Darstellung".
- **"Kein Template" = freies HTML-Feld:** Blöcke ohne Template haben ein HTML-Feld (`props.html`), das unverändert ausgegeben wird. Rohes HTML bleibt nur bei Admin/Moderator erhalten, bei Editoren bleibt bereits gespeichertes HTML unverändert, neues wird bereinigt.
- **Repeater:** "Eintrag hinzufügen" vor jedem Eintrag (fügt an dieser Position ein) und am Ende; Einträge einzeln zuklappbar mit Zusammenfassungszeile.
- `docker-compose.dev.yml` (App + Postgres für die lokale Entwicklung, Port 3020), `DEVELOPMENT.md` und `scripts/seed-example-pages.js` (Beispiel-Seiten).

### Changed
- Block-Felder erscheinen in Template-Reihenfolge (keine Sonderbehandlung für Textareas mehr, keine aus dem HTML abgeleiteten Gruppen); zugeklappte Blöcke zeigen eine Zusammenfassung.
## [0.26.0] - 2026-10-03

### Added
- Footer und Navigation sind jetzt zu "globalen Seitenkomponenten" vereinheitlicht (`lib/globalPageStore.js`, `components/GlobalPagesView.js`): statt zweier getrennter, aber strukturell fast identischer Stores gibt es jetzt einen gemeinsamen Store mit Rollen (`FOOTER`, `MAIN`, `PAGE`, `MOBILE`). `lib/navigationStore.js` und `lib/footerStore.js` bleiben als dünne Kompatibilitäts-Shims bestehen, bestehende Daten werden beim Lesen automatisch mit eingemischt und wandern beim nächsten Speichern an den neuen Ort (`npm run migrate-footer-navigation-to-global` für eine einmalige, vollständige Migration).
- Rich-Text-Felder (Seiten-Blöcke, Blogbeiträge, Content-Einträge) können jetzt wahlweise mit einem WYSIWYG-Editor (TipTap) statt dem bisherigen Markdown-Editor bearbeitet werden. Die Umschaltung erfolgt global unter Einstellungen → "Rich-Text-Editor"; das Speicherformat bleibt in beiden Fällen Markdown, sodass zwischen den beiden Editoren jederzeit verlustfrei gewechselt werden kann.
- Seitenübersicht: Die Tabellenansicht ist jetzt die Standardansicht für neue Browser-Sitzungen (vorher Kartenansicht). Eine bereits gewählte Ansicht bleibt wie bisher pro Sitzung gespeichert.

### Changed
- Durchgängige Übersetzung verbliebener englischer UI-Begriffe ins Deutsche (Buttons, Tooltips, Platzhaltertexte, Fehlermeldungen in Toasts), u. a. in `ElementPropertyEditor.js`, `DOMCanvas.js`, `SeoPanel.js`, `PagesView.js`, `BackupView.js`, `ContentModelsView.js` und mehreren API-Fehlermeldungen (`pages/api/**`). Fachspezifische Begriffe (SEO-Jargon wie Meta Title/OG Title/Canonical URL, etablierte technische Bezeichnungen, Produkt- und Markennamen) bleiben bewusst unübersetzt.
- Der Status "Review" (Blogbeiträge) heißt jetzt einheitlich "In Prüfung", passend zur bereits an anderer Stelle (`lib/workflow.js`) verwendeten Bezeichnung.

### Fixed
- `ContentEntryEditor.js` enthielt nach der eigentlichen Komponente mehrere hundert Zeilen toten, nicht mehr erreichbaren Codes aus einem älteren Entwurf (ungültige Referenzen auf nicht existierende Variablen). Das verhinderte zuverlässiges Kompilieren der Datei; der tote Code wurde entfernt.

---

## [0.25.2] - 2026-10-02

### Fixed
- Der Zielauswahl-Dialog beim Sammel-Verschieben/-Kopieren mehrerer Seiten (`PageTargetPickerModal`) wurde per `createPortal` direkt in `document.body` gerendert, also außerhalb des `.admin-scope`-Wrappers, der sämtliche Theme-Variablen (`--bg-secondary`, `--text-primary`, `--border-color`, `--accent-primary` usw.) definiert. Dadurch blieben Dialogbox, Hintergrundüberlagerung, Rahmen und Textfarbe unstyled/unsichtbar — sichtbar waren nur noch der native Scrollbar der Zielliste und der mit festen Hex-Farben gestylte "Kopieren/Verschieben"-Button. Der Dialog bekommt jetzt denselben `admin-scope`(+`dark-mode`)-Wrapper wie die übrigen Portal-Dialoge in `PageEditor.js`, wodurch die Theme-Variablen wieder greifen.

---

## [0.25.1] - 2026-10-01

### Fixed
- `scripts/import-init.js` flachte beim Seiten-Import den kompletten Seitenbaum ab und legte dabei für JEDEN Knoten — auch verschachtelte Unterseiten — eine eigene Top-Level-`Page`-Zeile an, obwohl Unterseiten laut Datenmodell nur als eingebettetes JSON im `children`-Feld ihrer nächsten Top-Level-Seite existieren sollen. Dadurch tauchte z. B. der Beispiel-Blogpost (`id: "blog-post-1"`) sowohl verschachtelt unter "Startseite → Blog" als auch nochmal unter einer eigenen Top-Level-Seite "Blog" auf — eine doppelte id im selben Baum, die beim nächsten Speichern mit "Seite(n) kommen mehrfach im Baum vor" abgelehnt wurde. Der Import legt jetzt nur noch für die echten Top-Level-Wurzeln aus `init/pages.json` eine Zeile an; verschachtelte Kinder werden wie vorgesehen als Teil von deren `children`-Feld mitgespeichert.

---

## [0.25.0] - 2026-10-01

### Added
- Seitenübersicht: Mehrere Seiten gleichzeitig verschieben oder kopieren. Über die Mehrfachauswahl (Checkboxen) lassen sich beliebig viele Seiten per Sammelaktionsleiste auf einmal an eine neue Stelle im Seitenbaum verschieben oder dorthin kopieren — inklusive aller Unterseiten. Ein Dialog zur Zielauswahl verhindert dabei ungültige Ziele (eine Seite kann nicht in sich selbst oder eine eigene Unterseite verschoben werden) und bricht bei Slug-Konflikten am Zielort kontrolliert ab, statt die Seiten zu verlieren. Kopien erhalten automatisch eindeutige Slugs (`-kopie`, bei Bedarf durchnummeriert), den Titelzusatz „(Kopie)" und den Status „Entwurf".

---

## [0.24.1] - 2026-10-01

### Fixed
- Weiterleitungs-Target "Neuer Tab" (`_blank`) öffnete das Ziel automatisch per `window.open` und zeigte dabei eine "Weiterleitung geöffnet..."-Zwischenseite — das ließ sich nicht abstellen und wirkte wie eine fehlgeschlagene Weiterleitung. Zeigt jetzt stattdessen einen normalen, klickbaren Link (`<a href>`) zur Ziel-URL; es wird nichts mehr automatisch geöffnet. Target "Gleicher Tab" (`_self`) bleibt unverändert eine echte automatische HTTP-Weiterleitung (301/302).
- Die Schnellerstellung für Weiterleitungs-Seiten ("Permanente"/"Temporäre Weiterleitung") gab es bisher nur im Haupt-"Seite hinzufügen"-Button der Seitenübersicht (nur Top-Level-Seiten). Verschachtelte Weiterleitungen (über "Unterseite hinzufügen"/"Geschwisterseite hinzufügen" an einer bestehenden Seite) mussten danach manuell in der Sidebar auf Weiterleitung umgestellt werden. Beide Optionen stehen jetzt auch im Hinzufügen-Menü jeder einzelnen Seite zur Verfügung.

---

## [0.24.0] - 2026-10-01

### Added
- Echte Seiten-Weiterleitungen: Der Weiterleitungstyp einer Seite (`data.redirect`, vorher nie persistierte Top-Level-Felder) löst beim Besuch jetzt tatsächlich eine Weiterleitung aus. Bei Target "Gleicher Tab" (`_self`, Standard) ist das eine echte HTTP-Weiterleitung (301 permanent / 302 temporär) über `getServerSideProps`, bevor überhaupt Blöcke gerendert werden — funktioniert auch für Crawler/curl ohne JavaScript. Target "Neuer Tab" (`_blank`) kann das nicht als echte HTTP-Weiterleitung umsetzen (Status bleibt 200) und öffnet das Ziel stattdessen clientseitig per `window.open`.
- Seiten-Editor: Umstellen einer Seite auf "Permanente"/"Temporäre Weiterleitung" sperrt automatisch das Anlegen von Blöcken und zeigt stattdessen ein eigenes Feld für Ziel-URL und Target.
- Seitenübersicht: "Seite hinzufügen" ist jetzt ein Dropdown — neben der normalen (weiterhin als Default per Klick erreichbaren) Seite lassen sich direkt "Permanente Weiterleitung" und "Temporäre Weiterleitung" als vorkonfigurierte neue Seiten anlegen.

### Changed
- Die Weiterleitungstypen "404" und "503" wurden entfernt — dafür gibt es bereits dedizierte Maintenance-Seiten (Einstellungen), eine weitere Weiterleitung darauf war redundant. Übrig bleiben: Keine / Permanent / Temporär.

### Fixed
- `sanitizeRecursive` (läuft über `page.data` beim Speichern) escaped `&` in jedem String zu `&amp;` — für Rich-Text richtig, hätte bei einer Weiterleitungs-URL mit Query-String (`?a=1&b=2`) die URL aber stillschweigend korrumpiert. `data.redirect` wird jetzt vor dieser Sanitisierung herausgehalten und separat validiert (`lib/pageRedirect.js`).

---

## [0.23.0] - 2026-10-01

### Fixed
- Gefundene Ursache für wiederkehrende „Slug(s) mehrfach vergeben"-Fehler trotz sauberer Datenbank: Verschachtelte Seiten ohne eigene `id` (ältere/importierte Datenbestände) wurden beim Speichern in `updatePageInTree` (`components/PagesView.js`) per `n.id === updatedPage.id` gematcht — bei mehreren Geschwister-Seiten mit `id === undefined` traf das ALLE gleichzeitig und überschrieb sie beim Speichern einer einzelnen von ihnen mit deren Inhalt, wodurch frische Slug-Duplikate entstanden, obwohl der Baum direkt davor unauffällig war. Das Speichern verweigert sich jetzt mit einer klaren Fehlermeldung, wenn die zu speichernde Seite keine eigene id hat, statt Geschwister-Seiten stillschweigend zu überschreiben.

### Added
- `/repair`-Werkzeug erkennt jetzt zusätzlich verschachtelte Seiten ohne eigene id (neuer Abschnitt „Seiten ohne eigene ID") und kann ihnen gezielt eine neue id vergeben — das war zuvor eine Lücke, da der Scan nur auf *doppelte* ids prüfte, Knoten mit *fehlender* id aber überging.

---

## [0.22.2] - 2026-10-01

### Fixed
- `/repair`-Werkzeug: Die Liste der Slug-Kollisionen rendert pro Gruppe mit `key={group.slug}` — existieren zwei getrennte Kollisionsgruppen mit demselben Slug-Text unter unterschiedlichen Elternseiten gleichzeitig, führte der doppelte React-Key dazu, dass eine der beiden Gruppen im UI nicht zuverlässig angezeigt/aktualisiert wurde. Key basiert jetzt auf den vollständigen Fundstellen der Gruppe statt nur dem Slug-Text.

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
