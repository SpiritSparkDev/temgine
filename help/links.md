# Links richtig setzen

Diese Anleitung ist für alle, die Texte im Seiten-Editor oder in Beiträgen
pflegen. Sie zeigt, wie Links in Textfeldern aussehen müssen, damit sie auf
der Website funktionieren.

## Die Grundform

In Textfeldern (Werkzeugleiste mit **B**, *I*, Link …) wird ein Link so
geschrieben:

```
[Text, der angeklickt wird](Adresse)
```

- In **eckigen Klammern** steht der sichtbare Text.
- Direkt danach, **ohne Leerzeichen**, steht in **runden Klammern** die Adresse.

Am einfachsten: Text markieren, auf **Link** klicken, Adresse eingeben — die
Klammern werden automatisch gesetzt.

| So geht es | So geht es nicht |
|---|---|
| `[Satzung](/mitgliederbereich/satzung)` | `[Satzung] (/mitgliederbereich/satzung)` – Leerzeichen dazwischen |
| `[BDH Bundesverband](https://www.b-d-h.de)` | `[BDH Bundesverband](www.b-d-h.de)` – `https://` fehlt |
| `[Kontakt](/kontakt)` | `(Kontakt)[/kontakt]` – Klammern vertauscht |

## Welche Adresse für welches Ziel?

### Eigene Seite der Website

Nur den Pfad angeben, **ohne** Domain, beginnend mit `/`:

```
[Vorstand](/bdh/vorstand-lv-mitteldeutschland)
[Termine](/events)
```

Den Pfad findet ihr in der Seitenübersicht (Spalte **Pfad**) oder in der
Adresszeile des Browsers, wenn die Seite geöffnet ist. Ohne Domain bleiben die
Links auch gültig, wenn die Website umzieht.

### Fremde Website

Immer die vollständige Adresse inklusive `https://`:

```
[SignDict](https://signdict.org)
```

Am sichersten: Adresse im Browser aus der Adresszeile kopieren und einfügen.

### Datei (PDF, Word, Bild)

1. Datei unter **Dateien** hochladen (oder eine vorhandene suchen).
2. Beim Eintrag auf **URL kopieren** klicken — die Adresse beginnt mit `/uploads/…`.
3. Als Link einfügen:

```
[Satzung BDH 2025 (PDF)](/uploads/downloads/2025/05/Satzung-BDH.pdf)
```

Tipp: „(PDF)“ im Linktext hilft Besucher*innen, bevor sie klicken.

### E-Mail-Adresse

`mailto:` vor die Adresse schreiben:

```
[vorsitzender@bdh-mitteldeutschland.de](mailto:vorsitzender@bdh-mitteldeutschland.de)
```

### Telefonnummer

`tel:` und die Nummer ohne Leerzeichen, mit Ländervorwahl:

```
[0341 123456](tel:+49341123456)
```

### Bestimmte Stelle auf einer Seite (Sprungmarke)

Blöcke können im Editor eine **Sprungmarke** bekommen (Feld neben der
Blocknummer, z. B. `anmeldung`; nur Kleinbuchstaben, Ziffern und `-`). Darauf
verlinkt man mit `#`:

```
[Zur Anmeldung](#anmeldung)                 ← auf derselben Seite
[Zur Anmeldung](/veranstaltungen#anmeldung) ← auf einer anderen Seite
```

Springt der Link nicht an die Stelle, unterstützt das Template dieses Blocks
keine Sprungmarken — dann bitte bei der Website-Betreuung melden.

## Fett, kursiv und Links kombinieren

Die Formatierung gehört **in** die eckigen Klammern:

```
[**Newsletter**](/mitgliederbereich/newsletter)
```

## Guter Linktext

- Beschreibt das Ziel: `[Satzung als PDF](…)` statt `[hier](…)` oder `[Link](…)`.
- Nicht die nackte Adresse als Text, wenn es einen sprechenden Namen gibt.
- Screenreader lesen Links oft als Liste vor — „hier, hier, Link“ hilft niemandem.

## Link-Felder bei Buttons

Buttons und Kacheln haben eigene Link-Felder mit einer Auswahl:

| Auswahl | Wofür | Eingabe |
|---|---|---|
| **Interne Seite** | Seite dieser Website | Seite aus der Liste wählen – nichts tippen |
| **Externe URL** | Fremde Website | vollständige Adresse mit `https://` |
| **Datei** | PDF, Dokument | **📁 Datei wählen** klicken |

Hier werden **keine** Klammern geschrieben — nur die Adresse.

## Häufige Fehler

- **Link führt ins Leere:** Seite umbenannt oder verschoben? Pfad in der
  Seitenübersicht prüfen und im Link anpassen.
- **Link wird als Text angezeigt:** Leerzeichen zwischen `]` und `(`, oder eine
  Klammer fehlt.
- **Adresse mit runden Klammern** (z. B. Wikipedia): Die Adresse in spitze
  Klammern setzen: `[Gebärdensprache](<https://de.wikipedia.org/wiki/Gebärdensprache_(DGS)>)`.
- **Alte Adressen der früheren Website** (`…/wp-content/uploads/…`) funktionieren
  nicht mehr. Datei neu unter **Dateien** hochladen und den Link ersetzen.
