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
| `children` | Unterordner: `slug`, `title`, `imageCount`, `locked`, `cover` |

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
- Änderungen in Picgine lösen keinen neuen Snapshot aus — nach Änderungen an öffentlichen
  Galerien den Snapshot manuell neu bauen.
