# AI Context & Focus Guide

> 🤖 Dieser Leitfaden hilft KI-Assistenten, den Kontext und die aktuellen Prioritäten des TempHelix-Projekts zu verstehen.

---

## 🎯 Aktueller Projektfokus

**Stand**: 9. Dezember 2025  
**Version**: 1.0.0  
**Phase**: Stabilisierung & Bug-Fixing

### Primäre Ziele
1. ✅ Alle kritischen Bugs beheben
2. 🔄 Code aufräumen und dokumentieren
3. 📝 Vollständige Dokumentation erstellen
4. 🧪 Test-Coverage erhöhen
5. 🚀 Vorbereitung für v1.1

---

## 📚 Projekt-Kontext

### Was ist TempHelix?
Ein **datenbankgestütztes CMS** mit Next.js, das einen **Block-basierten Editor**, **Mustache-Templates** und **Multi-User-Support** bietet.

### Technologie-Stack
- **Frontend**: Next.js 14 (Pages Router), React 18
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL
- **Auth**: NextAuth.js

### Kern-Architektur
```
Browser → React Components → API Routes → Prisma → PostgreSQL
                ↓
         Template Engine (Mustache) → Rendered Pages
```

---

## 🗂️ Wichtige Dateien & Locations

### Hauptkomponenten
- `pages/admin.js` - Admin-Dashboard (Haupt-UI)
- `components/PageEditor.js` - Seiten-Editor
- `components/PagesView.js` - Seitenverwaltung
- `lib/templateEngine.js` - Mustache-Rendering

### API-Endpunkte
- `pages/api/pages.js` - Seiten CRUD
- `pages/api/templates.js` - Template-Verwaltung
- `pages/api/users.js` - User-Management

### Datenbank
- `prisma/schema.prisma` - DB-Schema
- `lib/prisma.js` - Prisma Client

### Konfiguration
- `.env.local` - Environment Variables
- `middleware.js` - Auth & Routing
- `next.config.js` - Next.js Config

---

## ✅ Bereits Implementiert

### Kern-Features (Vollständig)
- [x] Block-basierter Page-Editor
- [x] Template-System mit Mustache
- [x] Hierarchische Seiten-Struktur
- [x] User-Management & Authentifizierung
- [x] File-Upload & Media-Management
- [x] CSS-Editor
- [x] Navigation-Builder
- [x] Revisions-System
- [x] Homepage-Configuration (isHomepage)
- [x] Development Mode (Auth-Bypass)

### Gelöste Bugs
- [x] Prisma Windows File Lock
- [x] Duale Toast-Nachrichten
- [x] Seiten-Reihenfolge Reset
- [x] Homepage nicht gefunden

---

## 🐛 Bekannte Issues

### Kritisch (zu beheben)
Aktuell **keine kritischen Bugs** offen.

### Medium Priority
1. **Module System Konflikte** - ESM vs CommonJS
2. **NextAuth Session-Handling** - Race Conditions
3. **Template-Preview Performance** - Langsam bei großen Templates

### Low Priority
4. **File-Upload Progress** - Keine Progress-Anzeige
5. **Dark Mode Persistence** - Inkonsistent

**Details**: Siehe `docs/BUGS.md`

---

## 🎯 Nächste Schritte (Priorisiert)

### Sofort (Diese Woche)
1. ✅ Dokumentation erstellen (aktuell in Arbeit)
2. 🔄 Code-Cleanup abschließen
3. 🧪 Tests schreiben für kritische Komponenten

### Kurzfristig (Diese Monat)
1. Module-System vereinheitlichen (ESM)
2. Session-Handling verbessern
3. Performance-Optimierung (Template-Caching)

### Mittelfristig (Q1 2025)
1. Content Models implementieren
2. Media Library Rewrite
3. SEO Tools
4. Security Hardening

**Details**: Siehe `docs/ROADMAP.md`

---

## 🤖 Anweisungen für KI-Assistenten

### Wenn der User fragt...

#### "Fix a bug"
1. Prüfe `docs/BUGS.md` für bekannte Issues
2. Identifiziere betroffene Dateien
3. Erstelle Tests vor dem Fix (wenn möglich)
4. Implementiere Fix
5. Update `docs/BUGS.md`

#### "Add a feature"
1. Prüfe `docs/ROADMAP.md` ob Feature geplant ist
2. Diskutiere Implementierung mit User
3. Beachte bestehende Architektur-Patterns
4. Dokumentiere neue Features
5. Update Roadmap

#### "Improve code"
1. Fokus auf die im Projekt verwendeten Patterns
2. Beachte Naming Conventions (siehe `docs/DEVELOPMENT.md`)
3. Keine Breaking Changes ohne Absprache
4. Tests hinzufügen/aktualisieren

### Code-Style Guidelines

```javascript
// ✅ Funktionale Komponenten
export default function MyComponent() {
  const [state, setState] = useState(null);
  return <div>...</div>;
}

// ✅ API-Routes Pattern
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') { ... }
    if (req.method === 'POST') { ... }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: 'Server Error' });
  }
}

// ✅ Prisma-Queries
const pages = await prisma.page.findMany({
  where: { status: 'PUBLISHED' }
});
```

### File-Naming Conventions
- Komponenten: `PascalCase.js`
- Utilities: `camelCase.js`
- Pages: `kebab-case.js` oder `[...slug].js`
- Styles: `kebab-case.css`

### Dokumentation aktualisieren
Bei jeder Änderung relevante Docs updaten:
- `docs/README.md` - Projekt-Übersicht
- `docs/BUGS.md` - Bug-Status
- `docs/ROADMAP.md` - Feature-Status
- `docs/API.md` - API-Änderungen

---

## 🔍 Häufige Aufgaben

### "Seite wird nicht angezeigt"
**Check:**
1. Seite in DB vorhanden? (`npx prisma studio`)
2. Status = PUBLISHED?
3. Slug korrekt?
4. isHomepage gesetzt? (für Root /)

### "Template rendert nicht"
**Check:**
1. Template in DB? (`/api/templates?name=...`)
2. Mustache-Syntax korrekt?
3. Template-Fields verfügbar?
4. Console-Errors im Browser?

### "API gibt 500 zurück"
**Check:**
1. Server-Logs anschauen
2. Prisma-Query korrekt?
3. Request-Body validieren
4. DB-Connection OK?

### "Migration fehlgeschlagen"
**Check:**
1. PostgreSQL läuft?
2. DATABASE_URL korrekt?
3. Prisma Client generiert? (`npx prisma generate`)
4. Windows File Lock? (Node-Prozesse beenden)

---

## 📖 Quick Reference

### Datenbank-Schema (Wichtigste Models)

```prisma
model User {
  id       String @id @default(uuid())
  email    String @unique
  password String
  role     Role   @default(USER)
}

model Page {
  id          String   @id @default(uuid())
  slug        String   @unique
  title       String
  blocks      Json     // Block-Struktur
  template    String?
  data        Json     // Template-Daten
  children    Json     // Hierarchie
  status      PageStatus @default(DRAFT)
  isHomepage  Boolean  @default(false)
  publishAt   DateTime?
  revisions   PageRevision[]
}

model PageRevision {
  id        String   @id @default(uuid())
  pageId    String
  page      Page     @relation(fields: [pageId], references: [id])
  data      Json
  createdAt DateTime @default(now())
}
```

### Environment Variables

```bash
# Must-Have
DATABASE_URL=postgresql://...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...

# Development
DEV_MODE=true
NEXT_PUBLIC_DEV_MODE=true

# Optional (OAuth)
GITHUB_ID=...
GITHUB_SECRET=...
```

### Wichtige Scripts

```bash
# Development
npm run dev          # Dev-Server starten

# Database
npx prisma studio    # DB GUI
npx prisma generate  # Client generieren
npx prisma migrate dev  # Neue Migration

# Testing
npm test            # Tests ausführen

# Build
npm run build       # Production-Build
npm start           # Production-Server
```

---

## 🎨 Design-Prinzipien

### UI/UX
- **Konsistenz**: Einheitliche Buttons, Inputs, Spacing
- **Feedback**: Toast-Nachrichten für alle Aktionen
- **Performance**: Loading-States, keine Freezes
- **Accessibility**: Semantic HTML, Keyboard-Navigation

### Code-Qualität
- **DRY**: Don't Repeat Yourself
- **KISS**: Keep It Simple
- **SOLID**: Single Responsibility Principle
- **Tests**: Kritische Pfade testen

### Security
- **Input-Sanitization**: Immer validieren
- **Auth-Checks**: In allen API-Routes
- **XSS-Prevention**: Kein unescaped HTML
- **SQL-Injection**: Prisma verwendet Prepared Statements

---

## 🚨 Wichtige Warnungen

### ⚠️ NIEMALS
- `DEV_MODE=true` in Production
- Passwords in Klartext speichern
- User-Input direkt in DB ohne Validation
- Breaking Changes ohne Migration

### ⚠️ VORSICHT
- Windows File-Locks bei Prisma (Node-Prozesse beenden)
- Template-Syntax (Mustache!) nicht mit JSX verwechseln
- `children` ist JSON-Field, nicht DB-Relation
- Session kann null sein (immer prüfen)

---

## 📞 Eskalation

### Wenn du nicht weiterkommst:
1. Prüfe relevante Dokumentation
2. Schaue in ähnlichen Dateien nach Patterns
3. Suche in Git-History nach ähnlichen Changes
4. Frage User um Kontext/Präferenzen
5. Schlage mehrere Lösungen vor

### Dokumentation-Priority:
1. `docs/README.md` - Übersicht
2. `docs/BUGS.md` - Bekannte Probleme
3. `docs/DEVELOPMENT.md` - Dev-Setup
4. `docs/API.md` - API-Details
5. `docs/ROADMAP.md` - Zukünftige Features

---

## ✨ Best Practices

### Vor jeder Änderung:
- [ ] Relevante Dokumentation gelesen
- [ ] Bestehende Patterns identifiziert
- [ ] Tests vorhanden/geplant
- [ ] Breaking Changes vermieden

### Nach jeder Änderung:
- [ ] Tests laufen (`npm test`)
- [ ] Code funktioniert lokal (`npm run dev`)
- [ ] Dokumentation aktualisiert
- [ ] Commit mit klarer Message

---

**Für Fragen zur Dokumentation**: Siehe `docs/` Verzeichnis  
**Für technische Details**: Siehe `docs/DEVELOPMENT.md`  
**Für Bug-Reports**: Siehe `docs/BUGS.md`  
**Für Feature-Requests**: Siehe `docs/ROADMAP.md`
