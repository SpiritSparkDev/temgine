# Templates in Temgine

Ein Template ist HTML mit Platzhaltern in doppelten geschweiften Klammern
(Mustache-Syntax). Aus den Platzhaltern erzeugt der Editor automatisch die
Eingabefelder: Steht `{{titel}}` im Template, gibt es im Seiten-Editor ein Feld
„Titel“. Diese Anleitung erklärt die Platzhalter, die Feldtypen und die
Bedingungen – jeweils mit Beispiel.

## Variablen

| Schreibweise | Bedeutung |
|---|---|
| `{{titel}}` | Wert des Felds, HTML wird maskiert (sicher) |
| `{{{inhalt}}}` | Wert als rohes HTML – für Richtext-Felder (`:textarea`) |

```html
<section class="intro">
  <h2>{{titel}}</h2>
  {{{text:textarea}}}
</section>
```

Feldnamen dürfen Leerzeichen und Umlaute enthalten (`{{Button Text}}`). Im Editor
wird der Name als Beschriftung verwendet.

## Feldtypen (`:typ`)

Ohne Angabe errät Temgine den Typ aus dem Namen (`bild` → Bild, `link` → URL,
sonst Text). Mit `{{feld:typ}}` legst du ihn selbst fest. Die Typ-Angabe wird beim
Rendern entfernt, sie steht nie im fertigen HTML.

| Typ | Editor-Feld | Beispiel |
|---|---|---|
| `:text` | Einzeiliges Textfeld | `{{titel:text}}` |
| `:textarea` | Richtext-Editor | `{{{text:textarea}}}` |
| `:number` | Zahlenfeld | `{{spalten:number}}` |
| `:url` | URL + Datei-Auswahl | `{{ziel:url}}` |
| `:image` | Bild-Auswahl mit Vorschau | `{{bild:image}}` |
| `:date` | Datums-Auswahl | `{{datum:date}}` |
| `:color` | Farb-Auswahl | `{{hintergrund:color}}` |
| `:checkbox` | Checkbox (an/aus) | `{{offen:checkbox}}` |
| `:select(…)` | Dropdown mit festen Optionen | `{{ausrichtung:select(links, rechts)}}` |
| `:array` | Liste, ein Wert pro Zeile | `{{tags:array}}` |

### Gruppen: `|Gruppe`

Mit `|Name` sortierst du Felder im Editor in Abschnitte:

```html
<h2>{{titel:text|Inhalt}}</h2>
<div class="{{ausrichtung:select(links, rechts)|Darstellung}}">…</div>
```

Ohne Angabe landen Felder in „Inhalt“; Auswahl-, Farb- und Zahlenfelder
automatisch in „Darstellung“ (eingeklappt).

## Checkbox

`{{offen:checkbox}}` zeigt im Editor eine Checkbox. Angehakt wird `true`
gespeichert, nicht angehakt bleibt der Wert leer. Damit passt die Checkbox
direkt zu den Bedingungen (siehe unten):

```html
<details{{#if:offen}} open{{/if:offen}}>
  <summary>{{frage}}</summary>
  …
</details>
```

- Angehakt → `<details open>`, sonst `<details>`.
- `{{^if:offen}}…{{/if:offen}}` zeigt Inhalt nur, wenn **nicht** angehakt.

### Feld nur in einer Bedingung benutzt?

Der Editor erkennt Felder nur an normalen `{{feld}}`-Platzhaltern, **nicht** an
`{{#if:feld}}`. Kommt das Feld sonst nirgends im Template vor, trage es einmal
in einem HTML-Kommentar ein – er erscheint im fertigen HTML, ist aber unsichtbar
und ändert nichts an der Darstellung:

```html
<details{{#if:offen}} open{{/if:offen}}>
  <!-- {{offen:checkbox}} -->
  <summary>{{frage}}</summary>
</details>
```

Das funktioniert genauso innerhalb von Wiederholungen (`{{#each:…}}`): jeder
Eintrag bekommt seine eigene Checkbox. Auch bei Seiten-Datenfeldern kannst du
`:checkbox` verwenden.

> Ältere, als Text gespeicherte Werte `true` / `1` werden als angehakt angezeigt.

## Select (Dropdown)

Die Optionen stehen in Klammern, durch Komma getrennt:

```html
<div class="box {{ausrichtung:select(links, mitte, rechts)}}">…</div>
```

Im Editor erscheint ein Dropdown mit „links“, „mitte“, „rechts“; ins HTML wird
der gewählte Wert eingesetzt, z. B. `<div class="box mitte">`.

**Anzeige-Text und Wert trennen** mit `Anzeige=wert`:

```html
<div style="text-align: {{ausrichtung:select(Links=left, Mitte=center, Rechts=right)}}">…</div>
```

Das Dropdown zeigt „Links / Mitte / Rechts“, ausgegeben wird `left`, `center` oder
`right`.

Gut zu wissen:

- Solange nichts gewählt ist, bleibt das Feld leer („Bitte wählen“) – in
  Kombination mit Bedingungen nutzbar: `{{#if:ausrichtung}}…{{/if:ausrichtung}}`.
- Ein früher gespeicherter Wert, der nicht mehr in der Liste steht, bleibt als
  eigener Eintrag im Dropdown erhalten und geht nicht still verloren.
- Optionen dürfen **kein Komma** und **keine Klammern** enthalten.
- Ohne Klammer-Liste (`{{feld:select}}`) verhält sich das Feld wie ein Textfeld.
- Funktioniert in Block-Feldern, in `{{#each:…}}`-Wiederholungen und in
  Seiten-Datenfeldern.

## Bedingungen

| Schreibweise | Inhalt erscheint, wenn … |
|---|---|
| `{{#if:feld}}…{{/if:feld}}` | `feld` nicht leer ist (bzw. angehakt) |
| `{{^if:feld}}…{{/if:feld}}` | `feld` leer ist (bzw. nicht angehakt) |

```html
{{#if:untertitel}}<p class="sub">{{untertitel:text}}</p>{{/if:untertitel}}
{{^if:untertitel}}<p class="sub sub--empty">Kein Untertitel</p>{{/if:untertitel}}
```

Ein Feld in einer `{{#if:…}}`-Bedingung, das im Inneren erneut als
`{{feld}}` vorkommt (wie `untertitel` oben), wird ganz normal erkannt.

## Wiederholungen: `{{#each:name}}`

Eine Gruppe von Feldern, die der Redakteur beliebig oft hinzufügen kann (Liste
von Karten, FAQ, Team …):

```html
<ul class="team">
  {{#each:Mitglieder}}
  <li>
    <img src="{{Foto:image}}" alt="{{Name}}">
    <strong>{{Name}}</strong>
    {{#if:Rolle}}<span>{{Rolle:text}}</span>{{/if:Rolle}}
  </li>
  {{/each:Mitglieder}}
</ul>
```

Im Editor erscheint „Mitglieder“ als Liste mit Zeilen; jede Zeile hat die Felder
Foto, Name und Rolle. Alle Feldtypen (auch `:checkbox` und `:select(…)`) sind
innerhalb der Wiederholung erlaubt.

## Dateien eines Ordners: `{{#folder}}`

Läuft über alle Dateien eines im Editor gewählten Upload-Ordners (rekursiv):

```html
{{#folder:galerie}}
  {{#isImage}}<img src="{{url}}" alt="{{name}}" loading="lazy">{{/isImage}}
{{/folder:galerie}}
```

Pro Datei verfügbar: `name`, `slug`, `url`, `path`, `ext`, `size` (Bytes),
`modified`, `isImage`.

## Picgine-Galerien

`{{#picgine:galerie}}…{{/picgine:galerie}}` bindet eine Picgine-Galerie ein.
Ausführlich beschrieben in der Anleitung **Picgine-Galerien**.

## Systemvariablen (überall verfügbar)

| Variable | Inhalt |
|---|---|
| `{{page.title}}` / `{{page.slug}}` | Titel bzw. Slug der aktuellen Seite |
| `{{{inner}}}` | HTML der Kind-Blöcke (für Wrapper-Templates) |
| `{{global.key}}` | Globale Variable (Menü „Globale Variablen“) |
| `{{data.key}}` | Freies Datenfeld der aktuellen Seite (`page.data.key`) |
| `{{{nav:main}}}` | Hauptnavigation (wird zusätzlich automatisch eingefügt) |
| `{{{nav:page}}}` | Seitennavigation, Standard-Zuweisung der Seite |
| `{{{nav:name}}}` | Eine bestimmte Seitennavigation namentlich |
| `{{{nav:mobile}}}` | Mobile Navigation |
| `{{{nav:auto}}}` | Navigation automatisch aus dem Seitenbaum |

Eigene Seiten-Datenfelder (`{{data.key}}`) legst du im Tab „Seiten-Datenfelder“
an; eine dort angelegte Vorlage weist du im Seiten-Editor der Seite zu, dann
erscheinen die Felder automatisch als Eingabefelder.

## Nur in Navigations-Templates

| Variable | Bedeutung |
|---|---|
| `{{#pages}}` | gesamten Seitenbaum durchlaufen |
| `{{#children}}` | Unterseiten durchlaufen |
| `{{#hasChildren}}` | nur, wenn Unterseiten existieren |
| `{{#childPages}}` | nur die direkten Unterseiten der aktuellen Seite |
| `{{#anchors}}` / `{{#customAnchors}}` | Anker durchlaufen |

Details und Beispiele: Anleitung **Navigationen**.

## Rohe Mustache-Abschnitte (Sonderfälle)

`{{#s}}…{{/s}}` und `{{^s}}…{{/s}}` sind normale Mustache-Abschnitte (Liste
durchlaufen bzw. „wenn leer“). Sie erzeugen keine Editor-Felder; für alles
Gewöhnliche sind `{{#if:…}}` und `{{#each:…}}` die bessere Wahl.
