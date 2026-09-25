# Navigationen in Temgine

Diese Anleitung beschreibt, wie Haupt- und Seitennavigationen im Backend
funktionieren, wie sie in Templates eingebunden werden, und — vor allem —
was die Mustache-Variablen wie `pages`, `children`, `hasChildren` etc.
bedeuten und wie man sie in echten Beispielen einsetzt.

## Zwei Typen

| Typ | Zweck | Aktivierung |
|---|---|---|
| **MAIN** (Hauptnavigation) | Eine einzige, site-weite Navigation (z. B. Header-Menü) | Genau eine kann „aktiv" sein und wird automatisch in jede Seite eingebunden |
| **PAGE** (Seitennavigation) | Kontext-Navigation innerhalb einer Seite (z. B. Anker-Menü, Breadcrumb, Sidebar-TOC) | **Keine Aktivierung nötig** — jede angelegte PAGE-Nav ist sofort nutzbar |

Der Unterschied ist bewusst: eine MAIN-Nav ist ein sitework-weiter Schalter
(„welches Menü zeigt die Seite gerade an"), eine PAGE-Nav ist ein
**Baustein** — genau wie ein Text- oder Bild-Block wird sie dort platziert,
wo sie gebraucht wird, beliebig oft, mit beliebig vielen unterschiedlichen
PAGE-Navs nebeneinander im selben Template.

## Eine PAGE-Nav in eine Seite einbinden — drei Wege

1. **Seiten-Navigationsauswahl** (Seitenbaum → Spalte „Navigation" je Seite)
   Weist einer einzelnen Seite eine Navigation als „Standard-PAGE-Nav" zu.
   Sie rendert dort, wo das Template `{{{nav:page}}}` referenziert.

2. **Navigations-Block** (Seiten-Editor → Block hinzufügen → „Nav: <Name>")
   Fügt eine bestimmte Navigation als eigenständigen Block in die Seite
   ein — unabhängig von der Seiten-Navigationsauswahl. Lässt sich beliebig
   oft mit unterschiedlichen Navigationen wiederholen.

3. **Direkt im Template-Code** — benannter Platzhalter `{{{nav:<name>}}}`
   Wird in ein Template (nicht in eine einzelne Seite) geschrieben, siehe
   nächster Abschnitt. Im Template-Editor lässt sich das im rechten
   Sidebar-Reiter **„Navigation"** auch per Klick einfügen, statt den
   Platzhalter von Hand zu tippen.

## Platzhalter-Referenz

| Platzhalter | Löst auf zu |
|---|---|
| `{{{nav:main}}}` | die aktive Hauptnavigation (wird zusätzlich automatisch am Seitenanfang eingefügt, falls nicht bereits im Template referenziert) |
| `{{{nav:page}}}` | die per Seiten-Navigationsauswahl zugewiesene PAGE-Nav (Standard-Slot) |
| `{{{nav:<name>}}}` | eine **bestimmte** PAGE-Nav, namentlich adressiert |
| `{{{nav:mobile}}}` | die aktive Mobile-Navigation |
| `{{{nav:auto}}}` | automatisch aus dem Seitenbaum generierte Navigation (kein eigenes Template nötig) |

Der Name-Platzhalter (`{{{nav:<name>}}}`) wird aus dem Navigationsnamen
abgeleitet (kleingeschrieben, Sonderzeichen/Leerzeichen → `-`). „Breadcrumb"
ergibt `{{{nav:breadcrumb}}}`. Ergeben zwei Navigationen denselben
Platzhalter, hängt die zweite automatisch `-2` an. Der eigene Platzhalter
einer Navigation wird beim Bearbeiten in der Navigationsverwaltung live
angezeigt.

---

## Variablen-Glossar: was `pages`, `children`, `hasChildren` & Co. bedeuten

Der Code einer Navigation ist ein **Mustache-Template**. `{{#pages}}…{{/pages}}`
ist kein "Aufruf einer Funktion pages", sondern eine **Schleife**: für jede
Seite in der Liste `pages` wird der Inhalt zwischen den Tags einmal
wiederholt — und **innerhalb** der Schleife zeigen `{{title}}`, `{{slug}}`
etc. automatisch auf die Felder der *aktuellen* Seite, nicht auf ein
Objekt namens `page`. Das ist der Punkt, der am häufigsten verwirrt: es
heißt `{{title}}`, nicht `{{page.title}}`.

### In `{{#pages}}…{{/pages}}` und `{{#children}}…{{/children}}` (MAIN/MOBILE)

Jedes Element ist eine Seite aus dem Seitenbaum mit folgenden Feldern:

| Feld | Bedeutung |
|---|---|
| `slug` | Pfad der Seite, z. B. `ueber-uns` oder `ueber-uns/team` bei Unterseiten (bereits inklusive Eltern-Pfad) |
| `title` | Seitentitel |
| `hasChildren` | `true`/`false` — hat diese Seite Unterseiten? Nur zum **Verzweigen** gedacht (siehe unten), kein Text |
| `children` | Array der Unterseiten — gleiche Feldstruktur, rekursiv verschachtelbar |
| `isCurrent` | `true`, wenn dies die gerade angezeigte Seite ist (Hervorhebung im Menü). **Nur verfügbar** beim Rendern einzelner Unterseiten (`pages/[...slug].js`, Live-Snapshot) — auf der Startseite selbst und im Static-Site-Export aktuell **nicht** gesetzt |
| `data` | Das freie Datenfeld der Seite (`page.data`, z. B. `navImage`). Ebenfalls nur in denselben zwei Rendering-Pfaden wie `isCurrent` verfügbar |

`pages` enthält nur veröffentlichte Seiten ohne `ignoreInNavigation`-Flag.

**Beispiel 1 — einfache Liste:**

```html
<ul>
  {{#pages}}
    <li><a href="/{{slug}}">{{title}}</a></li>
  {{/pages}}
</ul>
```

**Beispiel 2 — Untermenü nur anzeigen, wenn Unterseiten existieren:**

`{{#hasChildren}}…{{/hasChildren}}` ist hier kein Text-Platzhalter, sondern
ein **Bedingungsblock**: Mustache rendert den Inhalt nur, wenn `hasChildren`
`true` ist (leer/`false` → wird komplett übersprungen). Der Gegenpart
`{{^hasChildren}}…{{/hasChildren}}` würde nur rendern, wenn es **keine**
Unterseiten gibt.

```html
<ul class="main-nav">
  {{#pages}}
    <li class="nav-item{{#hasChildren}} has-children{{/hasChildren}}">
      <a href="/{{slug}}">{{title}}</a>

      {{#hasChildren}}
        <ul class="nav-sub">
          {{#children}}
            <li><a href="/{{slug}}">{{title}}</a></li>
          {{/children}}
        </ul>
      {{/hasChildren}}
    </li>
  {{/pages}}
</ul>
```

Wichtig: **innerhalb** von `{{#children}}…{{/children}}` zeigen `{{slug}}`
und `{{title}}` wieder auf die *Unterseite*, nicht mehr auf die Elternseite
— derselbe Mechanismus wie bei `{{#pages}}`, nur eine Ebene tiefer. `slug`
ist dabei bereits der vollständige Pfad (`eltern-slug/kind-slug`), man muss
die Pfade also **nicht** selbst zusammensetzen.

**Beispiel 3 — aktuelle Seite hervorheben (`isCurrent`):**

```html
<ul>
  {{#pages}}
    <li class="nav-item{{#isCurrent}} active{{/isCurrent}}">
      <a href="/{{slug}}"{{#isCurrent}} aria-current="page"{{/isCurrent}}>{{title}}</a>
    </li>
  {{/pages}}
</ul>
```

Da `isCurrent` — siehe Tabelle oben — nicht in jedem Rendering-Pfad gesetzt
ist, kann die Hervorhebung auf der Startseite bzw. im Static-Site-Export
fehlen. Für eine garantiert überall funktionierende Auto-Navigation mit
aktivem Zustand gibt es stattdessen `{{{nav:auto}}}` (kein eigenes
Mustache-Template nötig, wird serverseitig direkt aus dem Seitenbaum
gebaut).

**Beispiel 4 — eigenes Datenfeld einer Seite verwenden (`data`):**

Wenn eine Seite z. B. über das Feld „Nav-Bild" (`data.navImage`, im
Seiten-Editor unter „Weitere Optionen") ein Bild hinterlegt hat:

```html
{{#pages}}
  <li>
    {{#data.navImage}}<img src="{{data.navImage}}" alt="">{{/data.navImage}}
    <a href="/{{slug}}">{{title}}</a>
  </li>
{{/pages}}
```

### In `{{#anchors}}…{{/anchors}}` (nur PAGE-Navs)

| Feld | Bedeutung |
|---|---|
| `anchorId` | Ziel-Anker auf der Seite (ohne `#`) |
| `title` | Anzeigetext des Anker-Links |

```html
<nav class="page-nav anchor-sidebar">
  <ul>
    {{#anchors}}
      <li><a href="#{{anchorId}}">{{title}}</a></li>
    {{/anchors}}
  </ul>
</nav>
```

`anchorId` als Ziel funktioniert zusammen mit dem Feld **„Anchor-ID"**, das
sich an jedem Block im Seiten-Editor setzen lässt (wird zur HTML-`id` des
Blocks). Die Liste selbst — `page.data.anchors`, ein Array aus
`{ anchorId, title }` — hat aktuell **kein eigenes Formularfeld** im
Backend; sie muss über die Seiten-Daten gesetzt werden (bei Bedarf
Entwickler:in ansprechen, damit ein UI-Feld dafür ergänzt wird).

### Kurzreferenz: Bedingungen & Schleifen in Mustache

| Syntax | Bedeutung |
|---|---|
| `{{feld}}` | Wert ausgeben (HTML-escaped) |
| `{{{feld}}}` | Wert ausgeben, roh (kein Escaping — für HTML-Inhalte) |
| `{{#liste}}…{{/liste}}` | Wiederholen für jedes Element von `liste`; **oder**, wenn `liste` ein einzelner Wahrheitswert ist: nur rendern, wenn `true`/nicht-leer |
| `{{^liste}}…{{/liste}}` | Gegenteil von oben — nur rendern, wenn `liste` leer/`false`/nicht vorhanden ist |

---

## Wo Navigationen aufgelöst werden

Alle vier Rendering-Pfade lösen `{{{nav:<name>}}}` und Navigations-Blöcke
gleich auf:

- `pages/index.js` (Startseite, dynamisches Rendering — **ohne** `isCurrent`/`data` in `pages`)
- `pages/[...slug].js` (alle anderen Seiten, dynamisches Rendering)
- `lib/liveSnapshot.js` (statischer Live-Modus, siehe Einstellungen → Live-Rendering)
- `pages/api/admin/export.js` (Static-Site-Export als ZIP — **ohne** `isCurrent`/`data` in `pages`)

Jeder Pfad baut dafür `navigations.byId` — eine Map von Navigations-ID auf
`{ name, code, data }` — aus allen vorhandenen Navigationen auf; daraus
berechnet `renderPage()` sowohl die benannten Platzhalter als auch die
Auflösung von Navigations-Blöcken. Die genaue Platzhalter-Berechnung steckt
in `lib/templateEngine.js` (`navPlaceholderSlug` / `buildNavPlaceholderKeys`).

## Navigation anlegen/bearbeiten

1. Backend → **Navigation** öffnen.
2. Tab **Hauptnavigation** oder **Seitennavigation** wählen.
3. **Neu** klicken oder eine bestehende Navigation zum Bearbeiten auswählen.
4. Mustache-Template-Code schreiben (Presets als Startpunkt verfügbar).
5. Bei MAIN zusätzlich **Aktivieren**, damit sie sitework-weit verwendet
   wird (nur eine MAIN-Nav kann gleichzeitig aktiv sein). Bei PAGE entfällt
   dieser Schritt — sie ist direkt nutzbar.
6. Speichern.

Ein Klick auf **Doku** oben rechts in der Navigationsverwaltung zeigt eine
Kurzreferenz auch direkt im Backend an.

## Verwandt

- Template-Editor → rechter Sidebar-Reiter **„Referenz"**: vollständige
  Platzhalter-/Syntax-Übersicht für Templates allgemein.
- Template-Editor → rechter Sidebar-Reiter **„Navigation"**: alle
  Seitennavigationen zum Anklicken, fügt den passenden Platzhalter an der
  Cursor-Position ein.
