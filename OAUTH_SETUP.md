# OAuth Setup Anleitung

## 1. GitHub OAuth App erstellen

1. Gehen Sie zu: https://github.com/settings/developers
2. Klicken Sie auf "New OAuth App"
3. Füllen Sie das Formular aus:
   - **Application name**: TempHelix Admin
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
4. Klicken Sie auf "Register application"
5. Kopieren Sie die **Client ID**
6. Klicken Sie auf "Generate a new client secret"
7. Kopieren Sie das **Client Secret** (nur einmal sichtbar!)

## 2. .env.local Datei erstellen

1. Kopieren Sie `.env.local.example` zu `.env.local`:
   ```powershell
   Copy-Item .env.local.example .env.local
   ```

2. Öffnen Sie `.env.local` und tragen Sie Ihre Werte ein:
   ```
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=<generieren Sie einen Secret>
   GITHUB_ID=<Ihre GitHub Client ID>
   GITHUB_SECRET=<Ihr GitHub Client Secret>
   ```

3. Generieren Sie ein NEXTAUTH_SECRET:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

## 3. Server neu starten

```powershell
npm run dev
```

## 4. Testen

1. Öffnen Sie http://localhost:3000/admin
2. Sie werden zu /login umgeleitet
3. Klicken Sie auf "Mit GitHub anmelden"
4. Nach erfolgreicher Anmeldung werden Sie zu /admin weitergeleitet

## Nur bestimmte Benutzer zulassen (Optional)

Um nur bestimmte GitHub-Benutzer zuzulassen, bearbeiten Sie `/pages/api/auth/[...nextauth].js`:

```javascript
async signIn({ user, account, profile }) {
  const allowedUsers = ['ihr-github-username'];
  return allowedUsers.includes(profile.login);
},
```

## Produktionsumgebung

Für die Produktion:
1. Erstellen Sie eine neue GitHub OAuth App mit Ihrer Produktions-URL
2. Setzen Sie die Umgebungsvariablen in Ihrer Hosting-Plattform
3. Ändern Sie `NEXTAUTH_URL` zu Ihrer Produktions-Domain
