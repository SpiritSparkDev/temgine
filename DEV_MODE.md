# Development Mode

## Übersicht

Der Development Mode ermöglicht lokale Entwicklung ohne Authentifizierung im Admin-Bereich.

## Aktivierung

In der `.env.local` Datei:

```bash
# Development Mode aktivieren
DEV_MODE=true
NEXT_PUBLIC_DEV_MODE=true
```

## Deaktivierung (Production)

```bash
# Development Mode deaktivieren
DEV_MODE=false
NEXT_PUBLIC_DEV_MODE=false
```

Oder entfernen Sie die Variablen komplett aus `.env.local`.

## Funktionsweise

### Server-seitig (Middleware)
- Wenn `DEV_MODE=true`, überspringt die Middleware die Authentifizierungsprüfung
- Der Admin-Bereich ist ohne Login erreichbar
- Console-Warnung: "⚠️ DEV_MODE aktiv - Authentifizierung deaktiviert"

### Client-seitig (UI)
- Orange Warning-Banner im Admin-Interface
- Zeigt "⚠️ DEVELOPMENT MODE - Authentifizierung deaktiviert"
- Nur sichtbar wenn `NEXT_PUBLIC_DEV_MODE=true`

## Sicherheitshinweise

⚠️ **WICHTIG**: 
- Niemals in Production verwenden!
- Nur für lokale Entwicklung gedacht
- Vor Deployment sicherstellen, dass DEV_MODE deaktiviert ist

## Verwendung

1. **Lokale Entwicklung**: 
   - Setze `DEV_MODE=true`
   - Admin-Bereich ist unter `/admin` ohne Login erreichbar

2. **Production/Staging**:
   - Setze `DEV_MODE=false` oder entferne die Variable
   - Normale Authentifizierung wird erzwungen

## Dateien

- `middleware.js` - Prüft DEV_MODE und überspringt Auth
- `pages/admin.js` - Zeigt Warning-Banner
- `.env.local` - Konfiguration

## Beispiel .env.local für Production

```bash
# NextAuth Configuration
NEXTAUTH_URL=https://ihre-domain.com
NEXTAUTH_SECRET=ihr-production-secret

# Development Mode AUSGESCHALTET
# DEV_MODE=false
# NEXT_PUBLIC_DEV_MODE=false

DATABASE_URL=ihre-production-database-url
```
