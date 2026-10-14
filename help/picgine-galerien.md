# Picgine-Galerien in Temgine

Picgine ist die Foto-App für Galerien. Temgine bindet ihre Galerien in Templates ein:
Picgine liefert nur Daten und Bild-URLs, die Darstellung bestimmt das Template.

## Einrichtung

Einstellungen → **Picgine**:

- **Picgine-URL**, z. B. `https://pics.example.com`
- **API-Schlüssel**: der Client-Schlüssel aus Picgine (Admin → Clients). Er wird nur
  gespeichert und nie wieder angezeigt („gesetzt“).
- **Verbindung testen** ruft die Galerie-Liste von Picgine ab.

## Platzhalter-Syntax

```mustache
{{#picgine:galerie}}
  … Inhalt mit Zugriff auf die Galerie …
{{/picgine:galerie}}
```

- `galerie` ist ein Block-Feld. Im Seiten-Editor erscheint dafür ein Auswahlfeld
  „Picgine-Galerie“ (Unterordner eingerückt, 🔒 = geschützt). Gespeichert wird der Slug.
- **Feste Galerie** ohne Auswahl im Editor: `{{#picgine:galerie=hochzeit-mueller}}`.
  Geschlossen wird immer mit `{{/picgine:galerie}}` (`{{/picgine:galerie=hochzeit-mueller}}`
  ist ebenfalls erlaubt).
- **Mehrere Galerien** in einem Block über verschiedene Feldnamen, z. B.
  `{{#picgine:links}}` und `{{#picgine:rechts}}`.
- **Keine Galerie gewählt** (oder Picgine nicht erreichbar): die Section rendert nichts.

## Variablen innerhalb der Section

| Variable | Bedeutung |
|---|---|
| `slug`, `title`, `description` | Galerie-Daten |
| `imageCount` | Anzahl der Bilder |
| `locked` | `true`: gesperrt, `images` ist leer |
| `lockPassword` / `lockLogin` | Sperre per Galerie-Passwort bzw. per Viewer-Login (E-Mail + Passwort) |
| `loggedIn` | Viewer ist angemeldet, z. B. für einen Logout-Button |
| `cover` | Titelbild (Felder wie bei einem Bild), leer wenn gesperrt |
| `images` | Bilder: `id`, `title`, `alt`, `caption`, `copyright`, `width`, `height`, `takenAt`, `thumb`, `square`, `medium`, `large`, `original`, `srcset`, `index` (1, 2, 3 …) |
| `images[].download` | URL des Original-Downloads, leer wenn Downloads nicht freigeschaltet |
| `children` | Unterordner: `slug`, `title`, `imageCount`, `locked`, `cover`, `url` (Link auf dieselbe Seite mit `?picgine=<slug>`) |
| `allowDownload` | Downloads für diesen Ordner freigeschaltet |
| `zip` | URL des ZIP-Downloads aller Originale, leer wenn gesperrt oder nicht freigeschaltet |
| `parentSlug` | Slug des Elternordners |
| `parentUrl` | Link eine Ebene höher, leer an der im Block gewählten Galerie |
| `breadcrumb` | Pfad von der gewählten Galerie bis zum Elternordner: `slug`, `title`, `url` |

Alle Werte werden HTML-escaped ausgegeben.

## Entsperren und Abmelden

Ohne eigenes JavaScript:

- `<form data-picgine-unlock="{{slug}}">` mit den Feldern `password` (und `email` bei
  `lockLogin`) entsperrt die Galerie. Fehlermeldungen erscheinen im Element mit
  `data-picgine-error` innerhalb des Formulars.
- Ein Element mit `data-picgine-logout` meldet den Viewer ab.

Danach rendert die Seite die Galerien neu (ohne Neuladen) und feuert das Event
`picgine:rendered` auf `document` — dort z. B. eine Lightbox neu initialisieren:

```js
document.addEventListener('picgine:rendered', () => initLightbox());
```

Die Freigabe merkt sich Temgine 30 Tage im HttpOnly-Cookie `temgine_picgine`.

## Downloads

Ist in Picgine am Ordner „Downloads erlauben“ aktiv, liefern `zip` und `images[].download`
Links (bei geschützten Ordnern signiert, max. 1 Stunde gültig):

```html
{{#zip}}<a href="{{zip}}" download>Alle Bilder als ZIP</a>{{/zip}}
{{#images}}
  {{#download}}<a href="{{download}}" download>Original</a>{{/download}}
{{/images}}
```

## Unterordner-Navigation

Links auf Unterordner bleiben auf derselben Temgine-Seite: `?picgine=<slug>` ersetzt in
jeder Picgine-Section, deren gewählte Galerie den Unterordner enthält, die Anzeige durch
den Unterordner. Andere Sections bleiben unverändert; Ordner außerhalb der gewählten
Galerie werden ignoriert. Navigation ist nur innerhalb der im Block gewählten Galerie
möglich — `breadcrumb` und `parentUrl` reichen nicht darüber hinaus.

```html
{{#picgine:galerie}}
  <nav class="gallery-breadcrumb">
    {{#breadcrumb}}<a href="{{url}}">{{title}}</a> / {{/breadcrumb}}<span>{{title}}</span>
  </nav>
  {{#parentUrl}}<a href="{{parentUrl}}">← Zurück</a>{{/parentUrl}}

  <ul class="gallery-folders">
    {{#children}}
      <li><a href="{{url}}">{{#cover}}<img src="{{thumb}}" alt="">{{/cover}} {{title}} ({{imageCount}})</a></li>
    {{/children}}
  </ul>
{{/picgine:galerie}}
```

Seiten mit `?picgine=` werden immer dynamisch gerendert (nicht aus dem Live-Snapshot).

## Passwort vergessen (Viewer-Login)

```html
<form data-picgine-reset>
  <input name="email" type="email" placeholder="E-Mail" required>
  <button type="submit">Passwort zurücksetzen</button>
  <p data-picgine-message></p>
  <p data-picgine-error></p>
</form>
```

Das Formular sendet an `/api/picgine/reset-request`. Danach erscheint in
`data-picgine-message` immer der neutrale Hinweis „Falls ein Konto existiert, wurde eine
E-Mail verschickt.“ Picgine verschickt den Reset-Link selbst (SMTP in Picgine einrichten).

## Beispiel-Template „Galerie Raster“

```html
<section class="gallery">
{{#picgine:galerie}}
  <h2>{{title}}</h2>

  {{#locked}}
    <form class="gallery-lock" data-picgine-unlock="{{slug}}">
      {{#lockLogin}}<input name="email" type="email" placeholder="E-Mail" required>{{/lockLogin}}
      <input name="password" type="password" placeholder="Passwort" required>
      <button type="submit">Galerie öffnen</button>
      <p class="gallery-lock__error" data-picgine-error></p>
    </form>
  {{/locked}}

  {{^locked}}
    <div class="gallery-grid">
      {{#images}}
        <a href="{{large}}" data-index="{{index}}">
          <img src="{{thumb}}" srcset="{{srcset}}" sizes="(min-width: 800px) 25vw, 50vw"
               width="{{width}}" height="{{height}}" alt="{{alt}}" loading="lazy">
        </a>
      {{/images}}
    </div>
    {{#loggedIn}}<button data-picgine-logout>Abmelden</button>{{/loggedIn}}
  {{/locked}}
{{/picgine:galerie}}
</section>
```

Lightbox, Masonry usw. kommen wie bei jedem Block aus dem CSS-/JS-Manager.

Das Template liegt als Starter-Block **Galerie Raster** (`public/assets/template/block/Galerie-Raster.html`) bereit; `.gallery-grid` & Co. werden im CSS-Manager gestaltet.

## Live-Snapshot

- Der statische Snapshot enthält öffentliche Galerien fertig gerendert, geschützte als gesperrt.
- Seiten, deren Snapshot ein Entsperr-Formular (`data-picgine-unlock`) enthält, rendert
  Temgine dynamisch, damit die Freigabe des Besuchers greift.
- Änderungen in Picgine lösen einen neuen Snapshot aus, wenn der Webhook eingerichtet ist
  (siehe unten). Ohne Webhook den Snapshot nach Änderungen manuell neu bauen.

## Webhook (automatischer Snapshot-Neubau)

1. In Temgine unter Einstellungen → **Picgine** steht die Webhook-URL, z. B.
   `https://www.example.com/api/picgine/webhook`.
2. In Picgine beim Client (derselbe, dessen API-Schlüssel Temgine nutzt) diese URL als
   **Webhook-URL** eintragen.
3. Picgine sendet nach Änderungen (gebündelt) eine signierte Benachrichtigung. Temgine
   prüft die Signatur mit dem gespeicherten API-Schlüssel und baut den Live-Snapshot neu,
   sofern der statische Modus aktiv ist. Mehrere Meldungen kurz hintereinander lösen nur
   einen Neubau aus.

Wird der API-Schlüssel in Picgine neu erzeugt, muss er auch in Temgine aktualisiert werden,
sonst lehnt Temgine den Webhook ab (401).
