# Bekannte Bugs & Issues

## 🐛 Aktuelle Bugs

### ❌ Offene Issues

#### 1. Module System Konflikte
**Priorität**: Medium  
**Status**: Offen  
**Beschreibung**: ESM vs CommonJS Konflikte in Scripts  

**Problem:**
- Manche Scripts verwenden `import`, andere `require()`
- Prisma-Client kann nicht in allen Kontexten geladen werden
- Node.js Scripts scheitern mit "Cannot use import statement outside a module"

**Workaround:**
- `.mjs` Dateien für ESM-Scripts verwenden
- Dynamic imports `await import()` in regulären Scripts

**Dateien betroffen:**
- `scripts/*.js` (Mixed Module-System)
- `lib/prisma.js` (ESM Export)

**TODO:**
- [ ] Alle Scripts auf einheitliches Module-System migrieren
- [ ] `package.json` mit `"type": "module"` oder konsequent CommonJS

---

#### 2. NextAuth Session-Handling
**Priorität**: Medium  
**Status**: Workaround implementiert  
**Beschreibung**: Session nicht immer verfügbar im Admin  

**Problem:**
- Nach Login wird manchmal keine Session geladen
- Refresh erforderlich um Session zu erhalten
- Race-Condition bei Session-Initialisierung

**Workaround:**
- Development Mode implementiert (`DEV_MODE=true`)
- Middleware überspringt Auth-Check im Dev-Modus

**Dateien betroffen:**
- `pages/admin.js`
- `middleware.js`
- `pages/api/auth/[...nextauth].js`

**TODO:**
- [ ] Session-Provider korrekt konfigurieren
- [ ] useSession Hook richtig implementieren
- [ ] Fallback-Mechanismus verbessern

---

#### 3. Template-Preview Performance
**Priorität**: Low  
**Status**: Offen  
**Beschreibung**: Langsames Rendering bei komplexen Templates  

**Problem:**
- Große Templates (>100 Zeilen) rendern langsam
- Re-Rendering bei jedem Tastendruck
- Browser kann kurzzeitig einfrieren

**Workaround:**
- Debouncing für Preview-Updates

**Dateien betroffen:**
- `components/TemplatesViewModern.js`
- `lib/templateEngine.js`

**TODO:**
- [ ] Debounce/Throttle für Preview implementieren
- [ ] Web Worker für Template-Rendering
- [ ] Caching-Mechanismus

---

#### 4. File-Upload Progress
**Priorität**: Low  
**Status**: Offen  
**Beschreibung**: Keine Progress-Anzeige bei großen Datei-Uploads  

**Problem:**
- Bei großen Bildern/Videos keine Feedback
- Benutzer weiß nicht ob Upload läuft

**Dateien betroffen:**
- `components/FileManagerView.js`
- `pages/api/files.js`

**TODO:**
- [ ] Progress-Bar implementieren
- [ ] Chunk-Upload für große Dateien

---

#### 5. Dark Mode Persistence
**Priorität**: Low  
**Status**: Offen  
**Beschreibung**: Dark Mode Einstellung geht bei Reload verloren (manchmal)  

**Problem:**
- LocalStorage wird nicht konsistent gelesen
- Flash of unstyled content beim Laden

**Dateien betroffen:**
- `pages/admin.js`
- `styles/admin.css`

**TODO:**
- [ ] Server-Side Dark Mode Detection
- [ ] Cookie-basierte Persistierung

---

### ✅ Gelöste Issues

#### 1. Prisma Windows File Lock ✓
**Status**: ✅ Gelöst  
**Lösung**: Node-Prozesse beenden, Cache löschen  

**Ursprüngliches Problem:**
- `EPERM` Fehler beim `npx prisma generate` auf Windows
- `query_engine-windows.dll.node` von Node-Prozess gesperrt

**Lösung:**
```powershell
Get-Process node | Stop-Process -Force
Remove-Item node_modules\.prisma -Recurse -Force
npx prisma generate
```

**Dokumentiert in**: `PRISMA_CHECK_RESULT.md`

---

#### 2. Duale Toast-Nachrichten ✓
**Status**: ✅ Gelöst  
**Lösung**: Bedingte Success-Toast-Anzeige  

**Ursprüngliches Problem:**
- Bei Speichern wurden Error UND Success Toast gleichzeitig angezeigt
- API gab Fehler zurück, aber Frontend zeigte trotzdem Erfolg

**Lösung:**
```javascript
const saved = await handleUpdatePages(updated);
if (!saved) return; // Error bereits angezeigt
showToast('Erfolgreich gespeichert!', 'success');
```

**Dateien geändert:**
- `components/PagesView.js`

---

#### 3. Seiten-Reihenfolge Reset ✓
**Status**: ✅ Gelöst  
**Lösung**: `orderBy` aus API entfernt  

**Ursprüngliches Problem:**
- Nach F5 wurde Seitenreihenfolge zurückgesetzt
- API sortierte immer nach `createdAt`

**Lösung:**
- API gibt Seiten unsortiert zurück
- Client managed Reihenfolge via `children` Array

**Dateien geändert:**
- `pages/api/pages.js` (orderBy entfernt)

---

#### 4. Homepage nicht gefunden ✓
**Status**: ✅ Gelöst  
**Lösung**: Multiple Fixes  

**Ursprüngliches Problem:**
- "Keine Startseite gefunden" trotz `isHomepage: true`
- Datenbank war leer (Pages nur in JSON)
- Pages hatten Status DRAFT

**Lösung:**
1. Seiten in DB migriert (`scripts/migrate-pages-to-db.mjs`)
2. Pages als PUBLISHED gesetzt
3. `index.js` prüft auf `isHomepage` Flag
4. `includeDrafts=true` auf localhost

**Dateien geändert:**
- `pages/index.js`
- `prisma/schema.prisma` (isHomepage Field)
- `pages/api/pages.js` (Homepage-Logik)
- `components/PageEditor.js` (Homepage Checkbox)

---

## ⚠️ Warnungen & Hinweise

### 1. Prisma 7 Deprecation Warning
**Typ**: Warnung  
**Kritikalität**: Low  

```
The datasource property `url` is no longer supported in schema files.
```

**Hinweis**: Betrifft nur Prisma 7+. Aktuell verwenden wir Prisma 5/6.

**TODO**: Bei Update auf Prisma 7 Konfiguration anpassen

---

### 2. Development Mode Sicherheit
**Typ**: Sicherheitshinweis  
**Kritikalität**: High  

```
⚠️ DEV_MODE=true deaktiviert Authentifizierung!
```

**WICHTIG**: 
- Niemals in Production verwenden
- Vor Deployment `DEV_MODE=false` setzen

**Dokumentiert in**: `DEV_MODE.md`

---

### 3. OAuth Credentials
**Typ**: Konfiguration  
**Kritikalität**: Medium  

OAuth-Credentials in `.env.local` sind Development-Credentials.

**TODO**: 
- Production OAuth Apps erstellen
- Redirect-URLs konfigurieren
- Secrets sicher speichern (nicht in Git!)

---

## 🔍 Reproduzierbare Test-Cases

### Test 1: Homepage Load
```bash
1. Seite als Homepage markieren (isHomepage Checkbox)
2. Seite speichern
3. Zu localhost:3000/ navigieren
4. Erwartung: Homepage wird geladen
```

### Test 2: Page Reorder
```bash
1. Admin -> Seiten öffnen
2. Seiten per Drag & Drop sortieren
3. Speichern
4. F5 drücken
5. Erwartung: Reihenfolge bleibt erhalten
```

### Test 3: Template Preview
```bash
1. Admin -> Templates öffnen
2. Template bearbeiten
3. Code ändern
4. Preview beobachten
5. Erwartung: Preview updated in <1s
```

---

## 📊 Bug-Tracking

### Priority Levels
- **High**: Blockiert Hauptfunktionalität
- **Medium**: Beeinträchtigt Benutzererfahrung
- **Low**: Kosmetisch oder selten auftretend

### Status Labels
- **Offen**: Nicht behoben
- **In Progress**: Wird bearbeitet
- **Workaround**: Temporäre Lösung vorhanden
- **Gelöst**: Fix implementiert
- **Won't Fix**: Wird nicht behoben

---

## 🛠️ Debug-Tools

### Entwickler-Tools aktivieren

```javascript
// In browser console
localStorage.setItem('debug', 'true')
```

### Prisma Studio
```bash
npx prisma studio
```

### Database Logs
```javascript
// In lib/prisma.js
new PrismaClient({
  log: ['query', 'info', 'warn', 'error']
})
```

---

**Letzte Aktualisierung**: 9. Dezember 2025
**Review Interval**: Wöchentlich
