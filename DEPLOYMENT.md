# Temgine CMS Plesk Deployment Guide

## Overview
Temgine CMS ist eine Next.js CMS-Anwendung, die auf einem Plesk-Server (mit Phusion Passenger) deployt wird.

## Recent Fix: Client-Only Admin Page (2024)

Die `/admin` Seite wurde refaktoriert, um vollständig client-seitig zu rendern (CSR statt SSR). Das behebt Fehler bei komplexen Admin-Komponenten.

**Änderungen:**
- `pages/admin.js` → minimales Wrapper-Skript (17 Zeilen)
- `components/AdminPageClient.js` → neue vollständige Client-Komponente (405 Zeilen)

## Build & Deploy

### 1. Lokales Bauen (Windows)

```powershell
# In der Temgine CMS-Root-Directory
npm run build
```

Ergebnis:
- `.next/` Ordner wird generiert (optimierte Next.js Artefakte)
- Alle Pages + APIs werden kompiliert
- Static HTML wird für SSG Pages generiert

### 2. Auf Plesk deployen

**Option A: Via FTP/SFTP Upload (Empfohlen für Plesk)**

1. SSH / SFTP Zugriff zum Server
2. `cd ~/httpdocs` (Plesk Root)
3. Alte `.next` Ordner löschen (optional): `rm -rf .next`
4. Neue Dateien hochladen:
   ```bash
   # Vom lokalen PC
   scp -r .next user@reverent-grothendieck.212-227-188-40.plesk.page:~/httpdocs/
   scp -r pages user@reverent-grothendieck.212-227-188-40.plesk.page:~/httpdocs/
   scp -r components user@reverent-grothendieck.212-227-188-40.plesk.page:~/httpdocs/
   scp -r lib user@reverent-grothendieck.212-227-188-40.plesk.page:~/httpdocs/
   scp -r public user@reverent-grothendieck.212-227-188-40.plesk.page:~/httpdocs/
   scp -r prisma user@reverent-grothendieck.212-227-188-40.plesk.page:~/httpdocs/
   scp package.json user@reverent-grothendieck.212-227-188-40.plesk.page:~/httpdocs/
   scp package-lock.json user@reverent-grothendieck.212-227-188-40.plesk.page:~/httpdocs/
   scp next.config.js user@reverent-grothendieck.212-227-188-40.plesk.page:~/httpdocs/
   scp server.js user@reverent-grothendieck.212-227-188-40.plesk.page:~/httpdocs/
   scp middleware.js user@reverent-grothendieck.212-227-188-40.plesk.page:~/httpdocs/
   ```

5. SSH zum Server:
   ```bash
   ssh user@reverent-grothendieck.212-227-188-40.plesk.page
   cd ~/httpdocs
   npm install  # Falls node_modules nicht hochgeladen
   exit
   ```

**Option B: Via Plesk UI (Datei Manager)**
- Plesk → File Manager → httpdocs
- Manuell `.next` Ordner und Dateien ersetzen
- ⚠️ Langsam für viele Dateien, aber ohne SSH möglich

### 3. Plesk Node App Neustarten

**Via Plesk UI:**
1. Plesk Dashboard öffnen
2. Subscriptions → Ihr Subscription
3. Node.js → Node.js Application Manager
4. Finde die App "Node Server (custom server)"
5. Klick auf "Restart" oder "Stop" → "Start"

**Via SSH:**
```bash
ssh user@reverent-grothendieck.212-227-188-40.plesk.page
cd ~/httpdocs
touch restart.txt  # Passenger watching this file for restarts
# oder:
killall node  # Kill Node process (Passenger starts it again)
```

### 4. Prüfe ob Server läuft

```bash
# Vom lokalen PC
curl -s https://reverent-grothendieck.212-227-188-40.plesk.page/admin | grep -o "Loading\|Internal Server\|<html"
```

Erwartet: Zeigt "Loading" oder HTML (nicht "Internal Server Error")

## .env Datei

Die `.env` Datei **muss** lokal auf dem Server existieren (Plesk-UI Env-Vars werden nicht zuverlässig an Custom Server übergeben).

**Location:** `~/httpdocs/.env`
**Permissions:** `chmod 600 .env` (nur Owner lesbar)

**Inhalt:**
```env
DATABASE_URL=postgresql://pf_admin:PASSWORD@localhost:5432/pf_database?schema=public
NEXTAUTH_URL=https://reverent-grothendieck.212-227-188-40.plesk.page
NEXTAUTH_SECRET=<256-Zeichen-zufällig>
GITHUB_ID=<GitHub-OAuth-App-ID>
GITHUB_SECRET=<GitHub-OAuth-App-Secret>
DEV_MODE=false
NEXT_PUBLIC_DEV_MODE=false
```

**Wichtig:** PASSWORD mit Sonderzeichen **URL-encoded** (z.B. `@` → `%40`, `#` → `%23`)

## Troubleshooting

### Fehler: "Internal Server Error" auf /admin

1. ✅ Neue AdminPageClient-Komponente ist hochgeladen
2. ✅ Passenger ist neugestartet
3. ✅ `npm run build` wurde lokal ausgeführt
4. Prüfe: `.next/server/pages/admin.js` existiert auf dem Server

### Fehler: "Web application could not be started"

**Ursachen & Lösungen:**
- **Node-Version inkompatibel:** Plesk muss Node 18+ haben
- **Fehlende Dependencies:** `npm install` auf dem Server ausführen
- **Database Fehler:** `DATABASE_URL` in `.env` prüfen (Passwort encoding!)
- **Passenger-Logs:** SSH → `tail -f /var/log/syslog | grep Passenger`

### 500-Fehler beim Datenbankzugriff

```bash
# SSH zum Server
cd ~/httpdocs
npx prisma db push  # Syncs schema to DB
# oder
npm run migrate  # Wenn migrate script in package.json
```

## Deployment Checklist

- [ ] `npm run build` lokal erfolgreich
- [ ] `.next` Ordner auf Server hochgeladen
- [ ] `.env` Datei auf Server mit korrekten Credentials
- [ ] Node App in Plesk restartet
- [ ] `/admin` Seite lädt ohne 500-Fehler
- [ ] `/login` → GitHub OAuth funktioniert
- [ ] APIs (`/api/templates`, `/api/snippets`) antworten
- [ ] Database Migrations aktuell: `prisma migrate status`

## Performance Tipps

1. **Static Export (Optional):** Für reine Content-Sites kann man SSG nutzen:
   ```bash
   # In next.config.js
   const nextConfig = {
     output: 'export',  # Statisches HTML statt Server-Rendering
   };
   ```

2. **Cache Headers:** In `server.js`:
   ```javascript
   // For static assets
   res.setHeader('Cache-Control', 'public, max-age=31536000');
   ```

3. **Database Connection Pool:** In `lib/prisma.js`:
   ```javascript
   new PrismaClient({
     datasources: {
       db: {
         url: process.env.DATABASE_URL + '?pool_size=5&max_overflow=10',
       }
     }
   });
   ```

## Roll-Back Plan

Falls Deploy nicht funktioniert:

1. SSH zum Server
2. `cd ~/httpdocs && git log --oneline | head -5`  (Falls Git repo)
3. `git revert HEAD` oder alte `.next` Ordner wiederherstellen
4. Plesk App neustarten

---

**Support:** Siehe `SECURITY_SETUP.md` und `README.md` für weitere Infos.
