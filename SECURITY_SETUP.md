# Sicherheits- und Datenbank-Setup

## Übersicht

Dieses System nutzt jetzt:
- **NextAuth.js** für OAuth-Authentifizierung (GitHub)
- **Prisma ORM** für Datenbankzugriff
- **PostgreSQL** als Datenbank (optional - JSON funktioniert weiterhin)

## 1. GitHub OAuth einrichten

### GitHub OAuth App erstellen

1. Gehen Sie zu: https://github.com/settings/developers
2. Klicken Sie auf **"New OAuth App"**
3. Füllen Sie das Formular aus:
   - **Application name**: `Temgine CMS Admin` (oder Ihr Projektname)
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
4. Klicken Sie auf **"Register application"**
5. Kopieren Sie die **Client ID**
6. Klicken Sie auf **"Generate a new client secret"**
7. Kopieren Sie das **Client Secret** (⚠️ nur einmal sichtbar!)

### Umgebungsvariablen konfigurieren

1. Erstellen Sie die Datei `.env.local`:
   ```powershell
   Copy-Item .env.local.example .env.local
   ```

2. Öffnen Sie `.env.local` und tragen Sie Ihre Werte ein:
   ```env
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=<generieren Sie einen Secret>
   GITHUB_ID=<Ihre GitHub Client ID>
   GITHUB_SECRET=<Ihr GitHub Client Secret>
   DATABASE_URL="postgresql://user:password@localhost:5432/database"
   ```

3. Generieren Sie ein `NEXTAUTH_SECRET`:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

## 2. PostgreSQL-Datenbank einrichten (Optional)

### Option A: Lokale PostgreSQL Installation

1. PostgreSQL herunterladen: https://www.postgresql.org/download/
2. Installieren und starten
3. Datenbank erstellen:
   ```sql
   CREATE DATABASE web_template_site;
   ```
4. Connection String in `.env.local` aktualisieren:
   ```env
   DATABASE_URL="postgresql://postgres:IhrPasswort@localhost:5432/web_template_site"
   ```

### Option B: Cloud-Datenbank (Supabase, Railway, etc.)

1. Kostenlosen PostgreSQL-Service wählen (z.B. Supabase, Railway, Neon)
2. Datenbank erstellen
3. Connection String kopieren
4. In `.env.local` einfügen

### Prisma Schema migrieren

```powershell
npx prisma migrate dev --name init
```

Dies erstellt die Tabellen in Ihrer Datenbank.

## 3. System starten

```powershell
npm run dev
```

## 4. Erste Anmeldung

1. Öffnen Sie http://localhost:3000/admin
2. Sie werden zu `/login` umgeleitet
3. Klicken Sie auf **"Mit GitHub anmelden"**
4. Autorisieren Sie die App
5. Nach erfolgreicher Anmeldung landen Sie im Admin-Bereich

## 5. Daten zu PostgreSQL migrieren (Optional)

Wenn Sie bereits JSON-Daten haben und zu PostgreSQL wechseln möchten:

1. Gehen Sie im Admin zu **Settings**
2. Geben Sie Ihren PostgreSQL Connection String ein
3. Klicken Sie auf **"Verbindung testen"**
4. Wenn erfolgreich, klicken Sie auf **"Migration starten"**
5. Ihre Daten werden von JSON nach PostgreSQL kopiert
6. Ein Backup wird in `data/backups/` erstellt

## 6. Nur bestimmte Benutzer zulassen (Empfohlen!)

Standardmäßig kann sich jeder GitHub-Benutzer anmelden. Beschränken Sie den Zugriff:

Bearbeiten Sie `pages/api/auth/[...nextauth].js`:

```javascript
async signIn({ user, account, profile }) {
  const allowedUsers = ['ihr-github-username', 'weiterer-username'];
  
  if (!allowedUsers.includes(profile.login)) {
    return false; // Zugriff verweigern
  }
  
  return true;
}
```

## 7. API-Routen anpassen (bei PostgreSQL-Nutzung)

Die aktuellen API-Routen (`/api/pages`, `/api/templates`, `/api/snippets`) nutzen noch JSON-Dateien. Wenn Sie PostgreSQL nutzen möchten, müssen Sie diese anpassen:

### Beispiel: `/api/templates.js` mit Prisma

```javascript
import { prisma } from '../../lib/prisma';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const templates = await prisma.template.findMany();
    const templateObj = {};
    templates.forEach(t => {
      templateObj[t.name] = t.code;
    });
    res.json({ templates: templateObj });
  }
  
  if (req.method === 'POST') {
    const { name, code } = req.body;
    await prisma.template.upsert({
      where: { name },
      update: { code },
      create: { name, code },
    });
    res.json({ success: true });
  }
  
  if (req.method === 'DELETE') {
    const { name } = req.body;
    await prisma.template.delete({
      where: { name },
    });
    res.json({ success: true });
  }
}
```

## Produktionsumgebung

### GitHub OAuth für Produktion

1. Erstellen Sie eine **neue** GitHub OAuth App für Ihre Produktions-Domain
2. **Homepage URL**: `https://ihre-domain.com`
3. **Callback URL**: `https://ihre-domain.com/api/auth/callback/github`
4. Setzen Sie die Umgebungsvariablen in Ihrem Hosting-Service (Vercel, Railway, etc.)
5. Ändern Sie `NEXTAUTH_URL` zu Ihrer Produktions-Domain

### Umgebungsvariablen in Vercel/Railway/etc.

Fügen Sie diese Variablen in Ihrem Hosting-Dashboard hinzu:
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `GITHUB_ID`
- `GITHUB_SECRET`
- `DATABASE_URL`

## Fehlerbehebung

### "Missing NEXTAUTH_SECRET"
Stellen Sie sicher, dass `.env.local` existiert und `NEXTAUTH_SECRET` gesetzt ist.

### "Failed to connect to database"
Prüfen Sie Ihren `DATABASE_URL` Connection String.

### "Unauthorized" beim Admin-Zugriff
Stellen Sie sicher, dass Sie angemeldet sind. Löschen Sie Cookies und versuchen Sie erneut.

### Prisma Client fehlt
Führen Sie aus: `npx prisma generate`

## Weitere Ressourcen

- NextAuth.js Docs: https://next-auth.js.org/
- Prisma Docs: https://www.prisma.io/docs
- GitHub OAuth Apps: https://docs.github.com/en/developers/apps/oauth-apps
