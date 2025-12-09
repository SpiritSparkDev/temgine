# TempHelix

**TempHelix** ist ein modernes Template-basiertes CMS (Content Management System) gebaut mit Next.js, React und Prisma.

## Features

✨ **Template Engine** - Mustache-basierte Templates für flexible Layouts  
🎨 **Block-System** - Drag & Drop Blöcke für Seiteninhalte  
🌙 **Dark Mode** - Vollständige Dark Mode Unterstützung im Admin-Bereich  
📄 **Seiten-Management** - Hierarchische Seitenstruktur mit Editor  
🎭 **CSS-Manager** - Externe CSS-Dateien verwalten und sortieren  
🔐 **OAuth Authentifizierung** - GitHub OAuth über NextAuth.js  
💾 **Dual Storage** - JSON-Dateien oder PostgreSQL Datenbank  
👥 **Benutzerverwaltung** - User-Accounts und Rechteverwaltung (WIP)

## Schnellstart

### Voraussetzungen

- Node.js 18+
- npm oder yarn
- PostgreSQL (optional, JSON-Fallback verfügbar)

### Installation

```bash
# Abhängigkeiten installieren
npm install

# Umgebungsvariablen einrichten
cp .env.local.example .env.local
# Bearbeiten Sie .env.local mit Ihren Werten

# Datenbank einrichten (optional)
npx prisma migrate dev
npx prisma generate

# Development-Server starten
npm run dev
```

Öffnen Sie [http://localhost:3000](http://localhost:3000) im Browser.

## Struktur

```
temphelix/
├── components/      # React-Komponenten
├── lib/            # Template-Engine und Utils
├── pages/          # Next.js Pages und API Routes
│   ├── api/        # Backend API Endpoints
│   └── admin.js    # Admin-Dashboard
├── prisma/         # Prisma Schema
├── public/         # Statische Assets
├── styles/         # CSS-Dateien
└── data/           # JSON-Datenspeicher (Fallback)
```

## Admin-Zugang

Nach dem ersten Start:

1. Navigieren Sie zu `/admin`
2. Melden Sie sich mit GitHub OAuth an
3. Der erste Benutzer wird automatisch als Admin registriert

Siehe [OAUTH_SETUP.md](./OAUTH_SETUP.md) für Details zur OAuth-Konfiguration.

## Dokumentation

- [OAuth Setup](./OAUTH_SETUP.md) - GitHub OAuth einrichten
- [Security Setup](./SECURITY_SETUP.md) - Vollständige Sicherheits- und DB-Konfiguration

## Entwicklung

```bash
# Development-Server
npm run dev

# Tests ausführen
npm test

# Production Build
npm run build
npm start
```

## Deployment (Plesk)

1. **Code pullen**: `git pull origin main`
2. **Abhängigkeiten**: `npm install`
3. **Templates in DB synchronisieren**: `node scripts/deploy-templates.js`
4. **Build**: `npm run build`
5. **App neu starten**:
	- Plesk Node/Passenger: im Plesk UI auf „Restart Node App“
	- pm2: `pm2 restart temphelix`
6. **Health-Check**: `/api/database/health` aufrufen; kurz `/admin` öffnen und Labels im Block-Editor prüfen.

### Plesk Node-App Einstellungen
- **Node.js-Version**: 20.x LTS (empfohlen; 22.x kann funktionieren, aber 20 ist stabil mit Next.js)
- **Package Manager**: npm
- **Anwendungsmodus**: production
- **Anwendungsstamm**: `/httpdocs` (Pfad zum Projektroot)
- **Dokumentenstamm**: `/httpdocs` (oder Unterordner, falls gewünscht)
- **Anwendungsstartdatei**: `server.js` (liegt im Projektroot und startet `next start`)
- **Start-Befehl**: nicht nötig, Plesk ruft `node server.js` auf. Falls Plesk ein Feld „Script parameters“ hat, leer lassen.
- **Benutzerdefinierte ENV Variablen**: setze alle aus `.env`/`.env.local` (z.B. `DATABASE_URL`, `NEXTAUTH_SECRET`, `GITHUB_ID`, `GITHUB_SECRET`, `DEV_MODE=false`).

### Build/Run in Plesk UI
1. „Install NPM Packages“ klicken (entspricht `npm install`).
2. „Run Script“ -> `npm run build` ausführen.
3. „Restart Node App“ klicken (lädt `server.js`).
4. Prüfen: `/api/database/health`, danach `/admin` öffnen und Label-Anzeige testen.

## Technologie-Stack

- **Framework**: Next.js 13
- **UI**: React 18
- **Styling**: CSS Variables mit Dark Mode
- **Auth**: NextAuth.js
- **Database**: Prisma ORM (PostgreSQL)
- **Template Engine**: Mustache.js
- **Code Editor**: Monaco Editor
- **Icons**: Lucide React

## Lizenz

Proprietär

## Support

Bei Fragen oder Problemen erstellen Sie bitte ein Issue im Repository.
