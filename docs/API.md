# API-Dokumentation

## Übersicht

TempHelix verwendet Next.js API Routes für die Backend-Kommunikation. Alle API-Endpunkte befinden sich unter `/api/*`.

---

## Authentifizierung

### NextAuth.js Endpunkte

**Base URL**: `/api/auth/*`

NextAuth.js stellt automatisch folgende Endpunkte bereit:

- `GET /api/auth/signin` - Sign-in Seite
- `POST /api/auth/signin/:provider` - OAuth-Provider Login
- `GET /api/auth/signout` - Sign-out Seite
- `POST /api/auth/signout` - Benutzer abmelden
- `GET /api/auth/session` - Aktuelle Session abrufen
- `GET /api/auth/csrf` - CSRF-Token
- `GET /api/auth/providers` - Verfügbare Auth-Provider

---

## Seiten (Pages)

### GET /api/pages

Alle Seiten oder eine einzelne Seite abrufen.

**Query-Parameter:**
- `slug` (optional) - Slug der spezifischen Seite
- `includeDrafts` (optional) - `true` um auch unveröffentlichte Seiten zu laden

**Response (alle Seiten):**
```json
[
  {
    "id": "uuid",
    "slug": "home",
    "title": "Startseite",
    "blocks": [...],
    "template": "Seiten",
    "data": {},
    "children": [],
    "status": "PUBLISHED",
    "publishAt": null,
    "isHomepage": true,
    "createdAt": "2025-12-09T...",
    "updatedAt": "2025-12-09T..."
  }
]
```

**Response (einzelne Seite):**
```json
{
  "id": "uuid",
  "slug": "about",
  "title": "Über uns",
  ...
}
```

**Fehler:**
- `404` - Seite nicht gefunden
- `500` - Server-Fehler

### POST /api/pages

Seiten anlegen oder aktualisieren (Upsert).

**Body (Array für Batch-Update):**
```json
[
  {
    "slug": "home",
    "title": "Startseite",
    "blocks": [
      {
        "type": "content",
        "template": "Text",
        "props": {
          "title": "Willkommen",
          "text": "Hallo Welt"
        }
      }
    ],
    "template": "Seiten",
    "data": {},
    "children": [],
    "status": "PUBLISHED",
    "publishAt": null,
    "isHomepage": true
  }
]
```

**Body (Single Page):**
```json
{
  "slug": "about",
  "title": "Über uns",
  "blocks": [...],
  ...
}
```

**Response:**
```json
[
  {
    "id": "uuid",
    "slug": "home",
    "title": "Startseite",
    ...
  }
]
```

**Funktionalität:**
- Erstellt automatisch PageRevisions
- Löscht Seiten, die nicht mehr im Array sind
- Setzt `isHomepage: false` für alle anderen Seiten wenn eine als Homepage markiert wird
- Sanitiert HTML-Input

**Fehler:**
- `400` - Slug fehlt
- `500` - Server-Fehler

### DELETE /api/pages

Seite löschen.

**Body:**
```json
{
  "slug": "page-to-delete"
}
```

**Response:**
```json
{
  "ok": true
}
```

**Fehler:**
- `400` - Slug fehlt
- `500` - Server-Fehler

---

## Templates

### GET /api/templates

Alle Templates oder ein einzelnes Template abrufen.

**Query-Parameter:**
- `name` (optional) - Name des spezifischen Templates

**Response (alle Templates):**
```json
{
  "templates": ["Seiten", "Text", "Hero", "Feature Cards", ...]
}
```

**Response (einzelnes Template):**
```json
{
  "name": "Text",
  "code": "<div class=\"text-block\">\n  <h2>{{title}}</h2>\n  <p>{{text}}</p>\n</div>",
  "fields": ["title", "text"]
}
```

### POST /api/templates

Template erstellen oder aktualisieren.

**Body:**
```json
{
  "name": "Text",
  "code": "<div class=\"text-block\">...</div>"
}
```

**Response:**
```json
{
  "message": "Template gespeichert"
}
```

### DELETE /api/templates

Template löschen.

**Body:**
```json
{
  "name": "Text"
}
```

**Response:**
```json
{
  "ok": true
}
```

---

## Snippets

### GET /api/snippets

Alle Snippets abrufen.

**Response:**
```json
{
  "snippets": {
    "header": "<header>...</header>",
    "footer": "<footer>...</footer>"
  }
}
```

### POST /api/snippets

Snippet erstellen oder aktualisieren.

**Body:**
```json
{
  "name": "header",
  "code": "<header>...</header>"
}
```

**Response:**
```json
{
  "message": "Snippet gespeichert"
}
```

### DELETE /api/snippets

Snippet löschen.

**Body:**
```json
{
  "name": "header"
}
```

**Response:**
```json
{
  "ok": true
}
```

---

## Navigationen

### GET /api/navigations

Alle Navigationen oder eine einzelne Navigation abrufen.

**Query-Parameter:**
- `name` (optional) - Name der spezifischen Navigation

**Response (alle Navigationen):**
```json
{
  "navigations": ["main", "footer"]
}
```

**Response (einzelne Navigation):**
```json
{
  "name": "main",
  "code": "<nav>...</nav>"
}
```

### POST /api/navigations

Navigation erstellen oder aktualisieren.

**Body:**
```json
{
  "name": "main",
  "code": "<nav class=\"navbar\">...</nav>"
}
```

**Response:**
```json
{
  "message": "Navigation gespeichert"
}
```

### DELETE /api/navigations

Navigation löschen.

**Body:**
```json
{
  "name": "main"
}
```

**Response:**
```json
{
  "ok": true
}
```

---

## CSS

### GET /api/css

CSS-Datei(en) abrufen.

**Query-Parameter:**
- `file` (optional) - Name der CSS-Datei (z.B. "main.css")

**Response (alle Dateien):**
```json
{
  "files": ["main.css", "admin.css"]
}
```

**Response (einzelne Datei):**
```json
{
  "file": "main.css",
  "content": "body { margin: 0; ... }"
}
```

### POST /api/css

CSS-Datei speichern.

**Body:**
```json
{
  "file": "main.css",
  "content": "body { margin: 0; ... }"
}
```

**Response:**
```json
{
  "message": "CSS gespeichert"
}
```

---

## Dateien (Files)

### GET /api/files

Alle hochgeladenen Dateien auflisten.

**Response:**
```json
{
  "files": [
    {
      "name": "logo.png",
      "path": "/uploads/logo.png",
      "size": 12345,
      "type": "image/png"
    }
  ]
}
```

### POST /api/files

Datei hochladen (Multipart Form Data).

**Form Data:**
- `file` - Die hochzuladende Datei

**Response:**
```json
{
  "message": "Datei hochgeladen",
  "path": "/uploads/1234567890_logo.png"
}
```

### DELETE /api/files

Datei löschen.

**Body:**
```json
{
  "filename": "1234567890_logo.png"
}
```

**Response:**
```json
{
  "ok": true
}
```

---

## Benutzer (Users)

### GET /api/users

Alle Benutzer abrufen.

**Authentifizierung**: Admin-Rolle erforderlich

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Max Mustermann",
    "email": "max@example.com",
    "role": "ADMIN",
    "createdAt": "2025-12-09T..."
  }
]
```

### POST /api/users

Benutzer erstellen oder aktualisieren.

**Authentifizierung**: Admin-Rolle erforderlich

**Body (neu):**
```json
{
  "name": "Max Mustermann",
  "email": "max@example.com",
  "password": "secure-password",
  "role": "USER"
}
```

**Body (update):**
```json
{
  "id": "uuid",
  "name": "Max Mustermann",
  "role": "ADMIN"
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Max Mustermann",
  "email": "max@example.com",
  "role": "ADMIN"
}
```

### DELETE /api/users

Benutzer löschen.

**Authentifizierung**: Admin-Rolle erforderlich

**Body:**
```json
{
  "id": "uuid"
}
```

**Response:**
```json
{
  "ok": true
}
```

---

## Benutzer-Einladungen

### GET /api/users/invitations

Alle Einladungen abrufen.

**Authentifizierung**: Admin-Rolle erforderlich

**Response:**
```json
[
  {
    "id": "uuid",
    "email": "new@example.com",
    "token": "abc123...",
    "role": "USER",
    "expiresAt": "2025-12-16T...",
    "createdAt": "2025-12-09T..."
  }
]
```

### POST /api/users/invitations

Einladung erstellen.

**Authentifizierung**: Admin-Rolle erforderlich

**Body:**
```json
{
  "email": "new@example.com",
  "role": "USER"
}
```

**Response:**
```json
{
  "token": "abc123...",
  "inviteUrl": "http://localhost:3000/invite/abc123..."
}
```

### DELETE /api/users/invitations

Einladung löschen.

**Authentifizierung**: Admin-Rolle erforderlich

**Body:**
```json
{
  "id": "uuid"
}
```

**Response:**
```json
{
  "ok": true
}
```

---

## Database

### GET /api/database/check

Datenbankverbindung prüfen.

**Response:**
```json
{
  "status": "connected",
  "database": "temphelix"
}
```

### POST /api/database/backup

Datenbank-Backup erstellen.

**Authentifizierung**: Admin-Rolle erforderlich

**Response:**
```json
{
  "message": "Backup erstellt",
  "filename": "backup-2025-12-09.sql"
}
```

---

## Fehler-Codes

### Allgemeine Fehler

- **400 Bad Request** - Ungültige Anfrage oder fehlende Parameter
- **401 Unauthorized** - Authentifizierung erforderlich
- **403 Forbidden** - Keine Berechtigung
- **404 Not Found** - Ressource nicht gefunden
- **405 Method Not Allowed** - HTTP-Methode nicht erlaubt
- **500 Internal Server Error** - Server-Fehler

### Beispiel Fehler-Response

```json
{
  "error": "Slug erforderlich"
}
```

---

## Rate Limiting

Aktuell kein Rate Limiting implementiert.

**TODO**: Rate Limiting für API-Endpunkte hinzufügen

---

## Authentifizierung & Autorisierung

### Development Mode

Wenn `DEV_MODE=true`, wird die Authentifizierung übersprungen.

### Production Mode

NextAuth.js Session-basierte Authentifizierung:

```javascript
import { getSession } from 'next-auth/react';

export default async function handler(req, res) {
  const session = await getSession({ req });
  
  if (!session) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }
  
  if (session.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }
  
  // ... API-Logik
}
```

---

**Letzte Aktualisierung**: 9. Dezember 2025
