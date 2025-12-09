# TempHelix CMS - Projekt-Übersicht

## 📋 Inhaltsverzeichnis

1. [Überblick](#überblick)
2. [Technologie-Stack](#technologie-stack)
3. [Architektur](#architektur)
4. [Features](#features)
5. [Installation & Setup](#installation--setup)
6. [Bekannte Probleme](#bekannte-probleme)
7. [Roadmap](#roadmap)

---

## Überblick

**TempHelix** ist ein modernes, datenbankgestütztes Content Management System (CMS), das mit Next.js entwickelt wurde. Es ermöglicht die Verwaltung von Webseiten mit einem visuellen Block-Editor, Template-System und Multi-User-Support.

### Hauptmerkmale

- **Block-basierter Editor**: Seiten werden aus wiederverwendbaren Blöcken zusammengesetzt
- **Template-System**: Mustache-basierte Templates für flexible Gestaltung
- **Datenbank-gestützt**: PostgreSQL für persistente Datenspeicherung
- **Multi-User**: Authentifizierung mit NextAuth.js (OAuth & Credentials)
- **Versionierung**: Automatisches Revisions-System für Seiten
- **Asset-Management**: Upload und Verwaltung von Bildern und Dateien
- **Navigation-Builder**: Visueller Editor für Navigationsmenüs
- **CSS-Manager**: Direktes Bearbeiten von Stylesheets
- **Homepage-Feature**: Konfigurierbare Startseite

---

## Technologie-Stack

### Frontend
- **Framework**: Next.js 14 (Pages Router)
- **React**: 18.2.0
- **Styling**: CSS Modules, globale Styles
- **Icons**: Lucide React
- **Editor**: TipTap (Rich Text Editor)

### Backend
- **API**: Next.js API Routes
- **Datenbank**: PostgreSQL
- **ORM**: Prisma
- **Authentifizierung**: NextAuth.js
- **Template Engine**: Mustache.js

### Development
- **Testing**: Jest
- **Linting**: ESLint
- **Package Manager**: npm
- **Runtime**: Node.js 20+

---

## Architektur

### Ordnerstruktur

```
temphelix/
├── components/          # React-Komponenten
│   ├── PageEditor.js    # Haupt-Editor für Seiten
│   ├── PagesView.js     # Seitenverwaltung
│   ├── TemplatesViewModern.js
│   ├── NavigationViewModern.js
│   ├── CSSManagerViewModern.js
│   └── ...
├── pages/
│   ├── api/            # API-Endpunkte
│   │   ├── pages.js    # Seiten-CRUD
│   │   ├── templates.js
│   │   ├── snippets.js
│   │   ├── users.js
│   │   └── auth/       # NextAuth
│   ├── admin.js        # Admin-Dashboard
│   ├── login.js        # Login-Seite
│   ├── index.js        # Homepage
│   └── [...slug].js    # Catch-all Route für Seiten
├── lib/
│   ├── prisma.js       # Prisma Client
│   ├── templateEngine.js  # Mustache-Rendering
│   ├── templateParser.js
│   └── auth.js         # Auth-Utilities
├── prisma/
│   ├── schema.prisma   # Datenbankschema
│   └── migrations/     # DB-Migrationen
├── scripts/            # Utility-Scripts
├── docs/               # Dokumentation
├── data/               # Legacy JSON-Daten & Backups
├── public/             # Statische Assets
└── styles/             # Globale Styles
```

### Datenbank-Schema

**Haupttabellen:**

1. **User**
   - id, name, email, password, role (USER/ADMIN)
   - Authentifizierung und Berechtigungen

2. **Page**
   - id, slug, title, blocks (JSON), template, data (JSON)
   - status (DRAFT/PUBLISHED), publishAt, isHomepage
   - children (JSON) - Hierarchische Struktur

3. **PageRevision**
   - Versionierung von Seiten-Änderungen

4. **UserInvitation**
   - Token-basierte Benutzer-Einladungen

5. **AuditLog**
   - Protokollierung aller Änderungen

### Datenfluss

```
Browser → Next.js Page → API Route → Prisma → PostgreSQL
                ↓
         Components → State Management (React Hooks)
                ↓
         Template Engine (Mustache) → Rendered HTML
```

---

## Features

### ✅ Implementierte Features

#### Seiten-Management
- [x] CRUD-Operationen für Seiten
- [x] Block-basierter Editor
- [x] Hierarchische Seiten-Struktur (Parent-Child)
- [x] Drag & Drop Reordering
- [x] Status-Verwaltung (Draft/Published)
- [x] Scheduled Publishing
- [x] Homepage-Konfiguration (isHomepage Flag)
- [x] Revisions-System
- [x] Seiten-Vorschau

#### Template-System
- [x] Mustache-basierte Templates
- [x] Template-Editor mit Syntax-Highlighting
- [x] Snippet-System für wiederverwendbare Komponenten
- [x] Template-Felder-Parsing
- [x] Preview-Modus

#### Navigation
- [x] Visueller Navigation-Builder
- [x] HTML-basierte Navigationen
- [x] Mehrere Navigationen (main, footer, etc.)

#### CSS-Management
- [x] Direktes Bearbeiten von CSS-Dateien
- [x] Syntax-Highlighting
- [x] Live-Reload

#### User-Management
- [x] Multi-User-Support
- [x] Rollen-System (User/Admin)
- [x] OAuth (GitHub, Google)
- [x] Credentials-Login
- [x] User-Einladungen via Token
- [x] Passwort-Hashing (bcrypt)

#### Assets & Media
- [x] Datei-Upload (Bilder, Dokumente)
- [x] File-Browser
- [x] Asset-Verwaltung

#### Development
- [x] Development Mode (Auth-Bypass)
- [x] Debug-Tools
- [x] Migration-Scripts
- [x] Test-Suite (Jest)

### 🎨 UI/UX Features
- [x] Dark Mode
- [x] Responsive Design
- [x] Toast-Notifications
- [x] Confirm-Dialogs
- [x] Loading-States
- [x] Error-Handling

---

## Installation & Setup

### Voraussetzungen
- Node.js 20+
- PostgreSQL 14+
- npm oder yarn

### 1. Repository klonen
```bash
git clone https://github.com/SpiritSparkDev/temphelix.git
cd temphelix
```

### 2. Dependencies installieren
```bash
npm install
```

### 3. Environment-Variablen konfigurieren

Erstelle `.env.local`:

```bash
# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dein-secret-key

# OAuth (optional)
GITHUB_ID=your-github-client-id
GITHUB_SECRET=your-github-client-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/temphelix

# Development Mode (optional)
DEV_MODE=true
NEXT_PUBLIC_DEV_MODE=true
```

### 4. Datenbank einrichten

```bash
# Prisma Migrationen ausführen
npx prisma migrate deploy

# Prisma Client generieren
npx prisma generate
```

### 5. Initiale Daten (optional)

```bash
# Seiten aus JSON migrieren
node scripts/migrate-pages-to-db.mjs
```

### 6. Entwicklungsserver starten

```bash
npm run dev
```

Anwendung läuft auf: `http://localhost:3000`

Admin-Bereich: `http://localhost:3000/admin`

---

## Bekannte Probleme

### 🐛 Bugs

#### 1. **Prisma Windows File Lock (RESOLVED)**
- **Problem**: `EPERM` Fehler beim Regenerieren des Prisma Clients auf Windows
- **Lösung**: Node-Prozesse beenden, `.prisma` Cache löschen, neu generieren
- **Status**: ✅ Gelöst mit Workaround-Dokumentation

#### 2. **Duale Toast-Nachrichten (RESOLVED)**
- **Problem**: Error- und Success-Toast wurden gleichzeitig angezeigt
- **Lösung**: Bedingte Toast-Anzeige basierend auf API-Response
- **Status**: ✅ Gelöst

#### 3. **Seiten-Reihenfolge Reset bei F5 (RESOLVED)**
- **Problem**: Seitenreihenfolge wurde bei Page-Refresh zurückgesetzt
- **Lösung**: `orderBy` aus API entfernt, Client managed die Reihenfolge
- **Status**: ✅ Gelöst

#### 4. **Homepage nicht gefunden (RESOLVED)**
- **Problem**: "Keine Startseite" Fehler trotz isHomepage-Flag
- **Lösung**: 
  - `index.js` prüft jetzt auf `isHomepage` Flag
  - `includeDrafts=true` auf localhost
  - Seiten in Datenbank migriert und published
- **Status**: ✅ Gelöst

### ⚠️ Offene Issues

#### 1. **Module System Konflikte**
- ESM vs CommonJS Probleme in Scripts
- Workaround: `.mjs` Dateien für ESM-Scripts

#### 2. **NextAuth Session-Handling**
- Session nicht immer verfügbar im Admin-Bereich
- Development Mode als Workaround implementiert

#### 3. **Template-Preview Performance**
- Langsames Rendering bei komplexen Templates
- Optimierung benötigt

### 💡 Verbesserungsvorschläge

1. **Code-Splitting**: Lazy-Loading für Admin-Komponenten
2. **Caching**: Redis für Template- und Seiten-Caching
3. **Real-time Updates**: WebSocket für kollaboratives Editing
4. **Image Optimization**: Next.js Image-Komponente verwenden
5. **TypeScript Migration**: Schrittweise auf TypeScript umstellen

---

## Roadmap

### 📅 Version 1.1 (Q1 2025)

#### High Priority
- [ ] **Content Models**: Flexible Content-Type-Definition
- [ ] **Media Library**: Erweiterte Asset-Verwaltung mit Tags und Suche
- [ ] **SEO-Tools**: Meta-Tags, Open Graph, Sitemap-Generator
- [ ] **Performance**: Caching-Layer implementieren
- [ ] **Security**: CSRF-Protection, Rate-Limiting

#### Medium Priority
- [ ] **Multi-Language**: i18n Support
- [ ] **Workflows**: Approval-System für Veröffentlichungen
- [ ] **Analytics**: Eingebautes Analytics-Dashboard
- [ ] **Backup & Restore**: Automatische Backups
- [ ] **API Documentation**: OpenAPI/Swagger Docs

#### Low Priority
- [ ] **Plugin System**: Erweiterbare Architektur
- [ ] **Theme Marketplace**: Vorgefertigte Templates
- [ ] **Mobile App**: React Native Admin-App
- [ ] **CLI Tools**: Command-Line Interface

### 📅 Version 1.2 (Q2 2025)

#### Features
- [ ] **Headless CMS Mode**: GraphQL API
- [ ] **Webhooks**: Event-basierte Integrationen
- [ ] **Custom Fields**: Erweiterbares Feld-System
- [ ] **Form Builder**: Visueller Formular-Editor
- [ ] **Email Templates**: Newsletter-System

#### Technical Improvements
- [ ] **TypeScript**: Vollständige Migration
- [ ] **Testing**: E2E-Tests mit Playwright
- [ ] **Docker**: Container-basiertes Deployment
- [ ] **CI/CD**: GitHub Actions Pipeline
- [ ] **Documentation**: Vollständige API-Docs

### 📅 Version 2.0 (Q3 2025)

#### Major Features
- [ ] **AI Integration**: Content-Generierung mit LLMs
- [ ] **Visual Builder**: No-Code Page-Builder
- [ ] **E-Commerce**: Shop-Integration
- [ ] **Membership**: User-Bereich mit Subscriptions
- [ ] **Advanced Analytics**: Heatmaps, A/B-Testing

---

## Development Guidelines

### Code-Style

- **Komponenten**: Funktionale React-Komponenten mit Hooks
- **Naming**: camelCase für Variablen, PascalCase für Komponenten
- **Comments**: Deutsch für Kommentare, Englisch für Code
- **Files**: Klare Trennung von Logic, UI und Styles

### Git Workflow

```bash
# Feature Branch
git checkout -b feature/neue-funktion

# Commits
git commit -m "feat: Neue Funktion hinzugefügt"

# Pull Request
git push origin feature/neue-funktion
```

### Testing

```bash
# Tests ausführen
npm test

# Tests mit Coverage
npm test -- --coverage

# Spezifischer Test
npm test -- PageEditor.test.js
```

### Deployment

```bash
# Build für Production
npm run build

# Production Server starten
npm start
```

---

## Support & Kontakt

- **GitHub**: https://github.com/SpiritSparkDev/temphelix
- **Issues**: https://github.com/SpiritSparkDev/temphelix/issues
- **Dokumentation**: `/docs` Verzeichnis

---

**Letzte Aktualisierung**: 9. Dezember 2025
**Version**: 1.0.0
