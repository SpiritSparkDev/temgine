# Development Guide

## 🚀 Setup für Entwickler

### Voraussetzungen

- **Node.js**: Version 20+ (LTS empfohlen)
- **PostgreSQL**: Version 14+ 
- **Git**: Für Versionskontrolle
- **Code Editor**: VS Code (empfohlen mit Extensions)

### Empfohlene VS Code Extensions

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "prisma.prisma",
    "bradlc.vscode-tailwindcss",
    "formulahendry.auto-rename-tag",
    "christian-kohler.npm-intellisense",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

---

## 📁 Projekt-Setup

### 1. Repository klonen

```bash
git clone https://github.com/SpiritSparkDev/temphelix.git
cd temphelix
```

### 2. Dependencies installieren

```bash
npm install
```

### 3. PostgreSQL Database erstellen

```sql
CREATE DATABASE temphelix;
CREATE USER temphelix_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE temphelix TO temphelix_user;
```

### 4. Environment Variables

Erstelle `.env.local`:

```bash
# Database
DATABASE_URL=postgresql://temphelix_user:your_password@localhost:5432/temphelix

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# OAuth (optional für lokale Entwicklung)
GITHUB_ID=your_github_id
GITHUB_SECRET=your_github_secret
GOOGLE_CLIENT_ID=your_google_id
GOOGLE_CLIENT_SECRET=your_google_secret

# Development Mode
DEV_MODE=true
NEXT_PUBLIC_DEV_MODE=true
```

### 5. Datenbank initialisieren

```bash
# Migrationen ausführen
npx prisma migrate deploy

# Prisma Client generieren
npx prisma generate

# Optional: Seed-Daten laden
node scripts/migrate-pages-to-db.mjs
```

### 6. Dev-Server starten

```bash
npm run dev
```

Anwendung läuft auf: http://localhost:3000

---

## 🏗️ Projekt-Architektur

### Komponenten-Hierarchie

```
App (_app.js)
├── Admin (admin.js)
│   ├── DashboardView
│   ├── PagesView
│   │   └── PageEditor
│   │       ├── BlockEditor
│   │       └── PageTreeEditor
│   ├── TemplatesViewModern
│   ├── NavigationViewModern
│   ├── CSSManagerViewModern
│   ├── FileManagerView
│   └── UsersViewModern
└── Frontend ([...slug].js)
    └── Dynamic Page Rendering
```

### Datenfluss

```
User Input
    ↓
React Component (State)
    ↓
Event Handler
    ↓
API Call (fetch)
    ↓
Next.js API Route
    ↓
Prisma Client
    ↓
PostgreSQL Database
    ↓
Response Chain zurück
    ↓
UI Update (setState)
```

---

## 📝 Code-Style & Conventions

### Naming Conventions

```javascript
// Komponenten: PascalCase
function PageEditor() {}

// Variablen & Funktionen: camelCase
const userName = 'Max';
function getUserData() {}

// Konstanten: UPPER_SNAKE_CASE
const API_BASE_URL = '/api';

// CSS-Klassen: kebab-case
<div className="admin-navbar" />

// Dateien: kebab-case.js oder PascalCase.js für Komponenten
page-editor.js
PageEditor.js
```

### React Best Practices

```javascript
// ✅ Funktionale Komponenten mit Hooks
export default function MyComponent() {
  const [state, setState] = useState(null);
  
  useEffect(() => {
    // Side effects hier
  }, []);
  
  return <div>...</div>;
}

// ❌ Class Components vermeiden
class MyComponent extends React.Component { ... }
```

### State Management

```javascript
// ✅ useState für lokalen State
const [pages, setPages] = useState([]);

// ✅ useCallback für Event-Handler
const handleSave = useCallback(() => {
  // Logic hier
}, [dependencies]);

// ✅ useMemo für teure Berechnungen
const sortedPages = useMemo(() => {
  return pages.sort(...);
}, [pages]);
```

### API-Routen Pattern

```javascript
// pages/api/resource.js
export default async function handler(req, res) {
  try {
    // Authentifizierung prüfen
    const session = await getSession({ req });
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Methoden-Routing
    if (req.method === 'GET') {
      // GET-Logik
      return res.status(200).json(data);
    }
    
    if (req.method === 'POST') {
      // POST-Logik
      return res.status(200).json(result);
    }
    
    // Nicht unterstützte Methode
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server Error' });
  }
}
```

---

## 🧪 Testing

### Unit Tests schreiben

```javascript
// __tests__/myComponent.test.js
import { render, screen } from '@testing-library/react';
import MyComponent from '../components/MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
  
  it('handles click events', () => {
    const handleClick = jest.fn();
    render(<MyComponent onClick={handleClick} />);
    
    const button = screen.getByRole('button');
    button.click();
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### Tests ausführen

```bash
# Alle Tests
npm test

# Einzelner Test
npm test -- PageEditor.test.js

# Mit Coverage
npm test -- --coverage

# Watch Mode
npm test -- --watch
```

---

## 🗄️ Datenbank-Entwicklung

### Prisma Workflow

#### 1. Schema ändern

```prisma
// prisma/schema.prisma
model Page {
  id          String   @id @default(uuid())
  slug        String   @unique
  title       String
  newField    String?  // Neues Feld hinzufügen
  // ...
}
```

#### 2. Migration erstellen

```bash
npx prisma migrate dev --name add_new_field
```

#### 3. Prisma Client aktualisieren

```bash
npx prisma generate
```

#### 4. Migration in Production

```bash
npx prisma migrate deploy
```

### Prisma Studio

Visueller Datenbank-Browser:

```bash
npx prisma studio
```

Öffnet: http://localhost:5555

### Manuelle Queries

```javascript
// In Scripts oder API-Routes
import { prisma } from './lib/prisma';

// Select
const pages = await prisma.page.findMany({
  where: { status: 'PUBLISHED' },
  orderBy: { createdAt: 'desc' }
});

// Insert
const newPage = await prisma.page.create({
  data: {
    slug: 'new-page',
    title: 'Neue Seite',
    blocks: [],
    children: [],
    status: 'DRAFT'
  }
});

// Update
await prisma.page.update({
  where: { id: pageId },
  data: { title: 'Updated Title' }
});

// Delete
await prisma.page.delete({
  where: { slug: 'old-page' }
});
```

---

## 🐛 Debugging

### Browser DevTools

```javascript
// Breakpoints setzen
debugger;

// Console Logging
console.log('Debug:', variable);
console.table(arrayData);
console.dir(objectData);

// Performance Timing
console.time('operation');
// ... code ...
console.timeEnd('operation');
```

### React DevTools

Chrome Extension installieren: React Developer Tools

### Server-Side Debugging

```bash
# Node Inspector
node --inspect-brk node_modules/.bin/next dev

# VS Code Debug Configuration
{
  "type": "node",
  "request": "launch",
  "name": "Next.js: debug server-side",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "dev"],
  "port": 9229
}
```

### API-Debugging

```javascript
// In API-Route
console.log('Request:', {
  method: req.method,
  body: req.body,
  query: req.query,
  headers: req.headers
});
```

---

## 📦 Build & Deployment

### Production Build

```bash
# Build erstellen
npm run build

# Production-Server starten
npm start
```

### Environment-spezifische Configs

```javascript
// next.config.js
module.exports = {
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  // Production-only settings
  ...(process.env.NODE_ENV === 'production' && {
    compress: true,
    poweredByHeader: false,
  })
};
```

### Deployment Checklist

- [ ] `DEV_MODE=false` in Production `.env`
- [ ] Datenbank-Backups erstellen
- [ ] Migrationen auf Production ausführen
- [ ] Environment Variables setzen
- [ ] `npm run build` testen
- [ ] HTTPS konfigurieren
- [ ] NEXTAUTH_URL auf Production-Domain setzen
- [ ] OAuth Redirect-URLs aktualisieren

---

## 🔐 Sicherheit

### Best Practices

```javascript
// ✅ Input Sanitization
import { sanitizeRecursive } from '../lib/htmlSanitize';
const clean = sanitizeRecursive(userInput);

// ✅ SQL Injection Prevention (Prisma macht das automatisch)
await prisma.page.findUnique({
  where: { slug: userInput } // Safe mit Prisma
});

// ✅ XSS Prevention
<div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />

// ❌ Niemals:
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

### Authentication Guards

```javascript
// In API-Route
import { getSession } from 'next-auth/react';

export default async function handler(req, res) {
  const session = await getSession({ req });
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (session.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Autorisierter Code
}
```

---

## 🎨 Styling

### CSS-Architektur

```
styles/
├── global.css          # Globale Styles & CSS-Variablen
├── admin.css           # Admin-Layout
├── admin-components.css # Admin-Komponenten
├── buttons.css         # Button-Styles
├── editor-common.css   # Editor-Styles
├── file-manager.css
├── page-tree.css
├── snippets.css
├── templates.css
├── toolbar.css
└── users.css
```

### CSS-Variablen verwenden

```css
:root {
  --accent-primary: #667eea;
  --accent-secondary: #764ba2;
  --text-primary: #333;
  --bg-primary: #f5f5f5;
}

.my-component {
  color: var(--text-primary);
  background: var(--bg-primary);
}
```

### Dark Mode

```css
[data-theme="dark"] {
  --text-primary: #e0e0e0;
  --bg-primary: #1a1a1a;
}
```

---

## 📚 Hilfreiche Ressourcen

### Dokumentation

- [Next.js Docs](https://nextjs.org/docs)
- [React Docs](https://react.dev/)
- [Prisma Docs](https://www.prisma.io/docs)
- [NextAuth.js Docs](https://next-auth.js.org/)
- [Mustache Docs](https://mustache.github.io/)

### Tools

- [Prisma Studio](https://www.prisma.io/studio) - DB GUI
- [Postman](https://www.postman.com/) - API-Testing
- [React DevTools](https://react.dev/learn/react-developer-tools)

---

## 🤝 Contribution Guidelines

### Pull Request Process

1. Fork das Repository
2. Erstelle Feature-Branch: `git checkout -b feature/neue-funktion`
3. Committe Änderungen: `git commit -m "feat: Neue Funktion"`
4. Pushe Branch: `git push origin feature/neue-funktion`
5. Erstelle Pull Request

### Commit-Konventionen

```
feat: Neue Funktion hinzugefügt
fix: Bug behoben
docs: Dokumentation aktualisiert
style: Code-Formatierung
refactor: Code-Umstrukturierung
test: Tests hinzugefügt
chore: Build/Config-Änderungen
```

---

**Letzte Aktualisierung**: 9. Dezember 2025
