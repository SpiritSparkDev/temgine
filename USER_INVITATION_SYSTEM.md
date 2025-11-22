# Benutzereinladungssystem - Dokumentation

## Übersicht

Das TempHelix CMS verfügt jetzt über ein vollständiges Einladungssystem für neue Benutzer.

## Features

✅ **Einladungslinks erstellen** - Administratoren können neue Benutzer per Link einladen
✅ **Token-basierte Sicherheit** - Einmalige, ablaufende Tokens (7 Tage Gültigkeit)
✅ **Flexible Authentifizierung** - Neue User wählen zwischen:
  - Benutzername & Passwort (lokal)
  - GitHub / Google OAuth
✅ **Rollenverwaltung** - Rolle wird bei Einladung festgelegt (ADMIN, MODERATOR, EDITOR)
✅ **Automatische Ungültigkeit** - Links werden nach Verwendung ungültig
✅ **Einladungsübersicht** - Alle aktiven, verwendeten und abgelaufenen Einladungen einsehen

## Datenbank-Schema

### User Tabelle (erweitert)
```prisma
model User {
  id        String         @id @default(cuid())
  email     String         @unique
  name      String?
  image     String?
  role      UserRole       @default(EDITOR)
  password  String?        // NEU: Für Credentials-basierte Auth
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
  invitations UserInvitation[]
}
```

### UserInvitation Tabelle (neu)
```prisma
model UserInvitation {
  id        String   @id @default(cuid())
  email     String
  name      String?
  role      UserRole @default(EDITOR)
  token     String   @unique
  used      Boolean  @default(false)
  expiresAt DateTime
  createdBy String
  creator   User     @relation(fields: [createdBy], references: [id])
  createdAt DateTime @default(now())
  usedAt    DateTime?
}
```

## Workflow

### 1. Einladung erstellen (Admin)
- Admin geht zu "Benutzer" → "Einladungen"
- Klickt auf "Neue Einladung"
- Gibt E-Mail, Name (optional) und Rolle ein
- System generiert Token und URL
- Link wird automatisch in Zwischenablage kopiert

**API Endpoint:** `POST /api/users/invitations`

### 2. Einladungslink versenden
Der generierte Link hat folgendes Format:
```
https://ihre-domain.de/invite/[TOKEN]
```

Admin sendet diesen Link per E-Mail/Chat an den neuen Benutzer.

### 3. Einladung annehmen (Neuer User)
1. User öffnet Einladungslink
2. Sieht Willkommensseite mit:
   - E-Mail-Adresse
   - Zugewiesene Rolle
   - Eingeladen von (Creator)

3. Wählt Authentifizierungsmethode:
   - **Benutzername & Passwort**: Gibt Name, Username, Passwort ein
   - **OAuth**: Wird zu OAuth-Login weitergeleitet

4. Account wird erstellt und Einladung als "verwendet" markiert

**API Endpoints:**
- `GET /api/users/accept-invitation?token=...` - Einladung validieren
- `POST /api/users/setup-credentials` - Account erstellen

### 4. Anmeldung
Nach Account-Erstellung kann sich der User anmelden:
- **Credentials**: Mit Username/Passwort auf `/login`
- **OAuth**: Mit GitHub/Google auf `/login`

## API Referenz

### POST /api/users/invitations
Erstellt neue Einladung (nur ADMIN).

**Request:**
```json
{
  "email": "user@example.com",
  "name": "Max Mustermann",
  "role": "EDITOR"
}
```

**Response:**
```json
{
  "success": true,
  "invitation": {
    "id": "clx...",
    "email": "user@example.com",
    "name": "Max Mustermann",
    "role": "EDITOR",
    "expiresAt": "2025-11-27T...",
    "inviteUrl": "https://domain.de/invite/abc123..."
  }
}
```

### GET /api/users/invitations
Listet alle Einladungen (nur ADMIN).

### DELETE /api/users/invitations
Widerruft Einladung (nur ADMIN).

### GET /api/users/accept-invitation?token=TOKEN
Validiert Einladungstoken.

### POST /api/users/setup-credentials
Erstellt User-Account und markiert Einladung als verwendet.

**Request:**
```json
{
  "token": "abc123...",
  "authMethod": "credentials",
  "name": "Max Mustermann",
  "username": "max",
  "password": "securepassword"
}
```

oder für OAuth:

```json
{
  "token": "abc123...",
  "authMethod": "oauth"
}
```

## Sicherheit

✅ **Token-Validierung**
- Tokens sind 32 Bytes hex (64 Zeichen)
- Einmalig verwendbar
- 7 Tage Ablaufzeit
- Werden nach Verwendung als `used` markiert

✅ **Passwort-Hashing**
- SHA-256 Hash (für Produktion bcrypt empfohlen!)
- Passwörter nie im Klartext gespeichert

✅ **Berechtigungen**
- Nur ADMINs können Einladungen erstellen/verwalten
- Token-Validierung ist öffentlich (für Einladungsseite)
- Account-Erstellung nur mit gültigem Token

## UI Komponenten

### UserInvitationsView (`components/UserInvitationsView.js`)
- Einladungen erstellen
- Aktive/verwendete/abgelaufene Einladungen anzeigen
- Links kopieren
- Einladungen widerrufen

### Invite Page (`pages/invite/[token].js`)
- 3-Schritt-Prozess:
  1. Willkommen & Einladungsdetails
  2. Authentifizierungsmethode wählen
  3. Credentials eingeben (falls nötig)
- Responsive Design
- Schönes Gradient-UI

## Admin-Panel Integration

Im Admin-Panel unter "Benutzer":
- Tab "Benutzer": Bestehende User verwalten (Rollen ändern)
- Tab "Einladungen": Neue Einladungen erstellen und verwalten

## Testing

1. Als Admin einloggen
2. Zu "Benutzer" → "Einladungen"
3. Neue Einladung erstellen
4. Link kopieren
5. In Inkognito-Tab öffnen
6. Durchlaufen des Onboarding-Prozesses
7. Mit neuen Credentials anmelden

## Erweiterungsmöglichkeiten

🔮 **E-Mail-Versand**
- Integration mit Nodemailer/SendGrid
- Automatischer Versand bei Einladungserstellung
- E-Mail-Templates mit Branding

🔮 **Erweiterte Passwort-Sicherheit**
- bcrypt statt SHA-256
- Passwort-Stärke-Prüfung
- 2FA-Option

🔮 **Bulk-Einladungen**
- CSV-Upload für mehrere Einladungen
- Massenversand

🔮 **Reminder-System**
- Erinnerung vor Ablauf
- Einladung verlängern

## Fehlerbehebung

**"Einladung nicht gefunden"**
- Token ist falsch
- Einladung wurde gelöscht

**"Einladung bereits verwendet"**
- Link wurde schon einmal benutzt
- Neuen Link vom Admin anfordern

**"Einladung abgelaufen"**
- 7 Tage überschritten
- Neuen Link vom Admin anfordern

**"Benutzer existiert bereits"**
- E-Mail-Adresse bereits registriert
- Mit bestehenden Credentials anmelden
