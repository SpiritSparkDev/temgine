# Temgine CMS

**Temgine CMS** ist ein modernes, template-basiertes Content Management System gebaut mit Next.js 14, React 18 und Prisma ORM.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/I6Z720R1UN)

## Features

- **Template Engine** — Mustache-basierte Templates für flexible Layouts
- **Block-System** — Seiten aus konfigurierbaren Content-Blöcken zusammenstellen
- **CSS-Manager** — Externe CSS-Dateien verwalten, sortieren und aktivieren
- **Font-Manager** — Webfonts verwalten und einbinden
- **Seiten-Management** — Hierarchische Seitenstruktur mit visueller Baumansicht
- **Navigations-Editor** — Navigationen per Drag & Drop aufbauen
- **Import-Tool** — HTML-Seiten importieren und in Blöcke umwandeln
- **Benutzerverwaltung** — Rollenbasierte Zugriffsrechte (Admin / Moderator / Editor)
- **Einladungssystem** — Neue Benutzer per Token-Link einladen
- **Backup-System** — Manuelles Backup und Wiederherstellung
- **Credentials-Login** — Benutzername/Passwort, optional ergänzt durch GitHub OAuth
- **Geplante Veröffentlichung** — Seiten mit Datum/Uhrzeit vorplanen

---

## Voraussetzungen

- **Node.js** 20.x LTS
- **npm** 9+
- **PostgreSQL** 14+
- Ein Texteditor für die `.env.local`-Datei

---

## Lokale Installation

### 1. Repository klonen

```bash
git clone https://github.com/SpiritSparkDev/temgine.git
cd temgine
```

### 2. Abhängigkeiten installieren

```bash
npm install
```

### 3. Umgebungsvariablen einrichten

Kopiere die Beispieldatei und fülle sie aus:

```bash
cp .env.local.example .env.local
```

Mindestinhalt für lokale Entwicklung:

```dotenv
# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<zufälliger-langer-string>

# Datenbank
DATABASE_URL=postgresql://USER:PASS@localhost:5432/temgine_cms

# Entwicklungsmodus (deaktiviert Login lokal)
DEV_MODE=true
NEXT_PUBLIC_DEV_MODE=true
```

`SETUP_TOKEN` für `/setup` ist optional — ohne ihn generiert der Server beim
Start selbst einen und loggt einen fertigen Klick-Link in die Konsole (siehe
Schritt 5). Nur explizit setzen, wenn mehrere Server-Instanzen denselben
Token teilen müssen.

`NEXTAUTH_SECRET` kann so generiert werden:

```bash
# Linux/macOS
openssl rand -base64 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
```

### 4. Datenbank einrichten

```bash
# Schema auf die Datenbank anwenden
npx prisma migrate deploy

# Prisma Client generieren (passiert auch bei npm install via postinstall)
npx prisma generate
```

### 5. Ersten Admin-Account anlegen

Starte den Dev-Server:

```bash
npm run dev
```

Solange noch kein User existiert, gibt die Server-Konsole beim Start einen
fertigen Setup-Link aus (`[setup] http://localhost:3000/setup?token=...`).
Link öffnen, Name/E-Mail/Passwort eintragen — der Token ist schon
vorausgefüllt. Danach ist `/setup` dauerhaft gesperrt (sobald ein User existiert).

### 6. Development-Server starten

```bash
npm run dev
# → http://localhost:3000
# → Admin: http://localhost:3000/admin  (bei DEV_MODE=true ohne Login)
```

---

## Produktions-Deployment (Plesk)

### Plesk Node-App Einstellungen

| Einstellung | Wert |
|---|---|
| Node.js-Version | 20.x LTS |
| Anwendungsstartdatei | `server.js` |
| Anwendungsmodus | `production` |
| Anwendungsstamm | `/httpdocs` (Projektroot) |

### Umgebungsvariablen auf dem Server

| Variable | Produktionswert |
|---|---|
| `NEXTAUTH_URL` | `https://deine-domain.de` |
| `NEXTAUTH_SECRET` | Neu generierten Zufallswert (≥ 32 Zeichen) |
| `DATABASE_URL` | `postgresql://USER:PASS@localhost:5432/DBNAME` |
| `DEV_MODE` | `false` |
| `SETUP_TOKEN` | Optional — ohne ihn generiert der Server selbst einen und loggt den Setup-Link |

> **Wichtig:** Passwörter mit Sonderzeichen in der `DATABASE_URL` müssen URL-kodiert sein  
> (z. B. `@` → `%40`, `#` → `%23`, `!` → `%21`).

### Deploy-Ablauf

```bash
# 1. Aktuellen Code holen
git pull origin main

# 2. Abhängigkeiten installieren
npm install

# 3. Datenbank-Migrationen anwenden
npx prisma migrate deploy

# 4. Production Build erstellen
npm run build

# 5. App in Plesk neustarten
#    → Plesk UI → Node.js → "Restart Node App"
```

### Ersten Admin anlegen (Produktion)

Nach dem ersten Deploy, solange noch kein Benutzer existiert:

1. Node-App-Log in Plesk öffnen (Plesk UI → Node.js → Logs) und den beim Start
   ausgegebenen Setup-Link suchen (`[setup] https://deine-domain.de/setup?token=...`)
2. Link öffnen, Admin-Account anlegen (Token ist schon vorausgefüllt)
3. `/setup` ist danach dauerhaft gesperrt

### System-Status prüfen

Die Login-Seite (`/login`) hat einen **"System-Status prüfen"**-Button, der folgendes prüft:

- Umgebungsvariablen (`NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DATABASE_URL`)
- Datenbankverbindung
- Schema (Tabellen vorhanden, Anzahl Benutzer)

Alternativ: `/api/health` direkt aufrufen.

---

## Docker-Deployment

Alternative zu Plesk — App und PostgreSQL laufen komplett containerisiert:

```bash
npm run docker:up    # baut Image, legt .env.local an falls nötig, startet auf freiem Port
npm run docker:down  # stoppt die Container
```

Details, Umgebungsvariablen und Troubleshooting: siehe [development_docs/DOCKER.md](./development_docs/DOCKER.md).

---

## Entwicklungs-Skripte

```bash
npm run dev          # Dev-Server (inkl. Tests)
npm test             # Jest-Tests ausführen
npm run build        # Production Build
npm start            # Production-Server starten (Next.js)
npm run check-env    # Umgebungsvariablen prüfen
npm run docker:up    # Docker-Compose-Stack starten (siehe development_docs/DOCKER.md)
npm run docker:down  # Docker-Compose-Stack stoppen
```

---

## Technologie-Stack

| Bereich | Technologie |
|---|---|
| Framework | Next.js 16 |
| UI | React 18 |
| Styling | CSS Custom Properties |
| Auth | NextAuth.js 4 |
| ORM | Prisma 5 |
| Datenbank | PostgreSQL 14+ |
| Template Engine | Mustache.js |
| Code Editor | Monaco Editor |
| Icons | Lucide React |
| Tests | Jest + Testing Library |

---

## Lizenz

Proprietär — alle Rechte vorbehalten.

## Admin-Zugang

Es gibt zwei unabhängige Wege, den ersten Admin-Account anzulegen — beide sind gleichzeitig aktiv, welcher zuerst genutzt wird, gewinnt:

1. **`/setup`-Link** (siehe oben) — legt einen Credentials-Login-Account (Benutzername/Passwort) als ADMIN an. Der Endpunkt sperrt sich selbst, sobald ein User existiert.
2. **Erster GitHub-OAuth-Login** — navigieren Sie zu `/admin`, melden Sie sich mit GitHub an; der *erste* Benutzer, der sich so einloggt, wird automatisch als ADMIN registriert (nur falls `GITHUB_ID`/`GITHUB_SECRET` konfiguriert sind).

Siehe [OAUTH_SETUP.md](./OAUTH_SETUP.md) für Details zur OAuth-Konfiguration.
