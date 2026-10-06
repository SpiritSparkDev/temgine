# Entwicklung (lokal)

Alles läuft über **Docker Compose** (`docker-compose.dev.yml`): App (`next dev` mit Hot Reload) und Postgres.
Kein `npx next dev`, kein lokaler Postgres. Der Voll-Stack für Deployment steht in `docker-compose.yml` (siehe README).

## Schnellstart

```bash
docker compose -f docker-compose.dev.yml up -d
```

App: **http://localhost:3020** — der erste Start dauert einige Minuten (`npm install` im Container, Migrationen laufen automatisch).
Fortschritt: `docker compose -f docker-compose.dev.yml logs -f app` (fertig bei „Ready in …").

- Quellcode wird vom Host eingebunden (Bind-Mount), Änderungen sind sofort sichtbar.
- `node_modules` und `.next-dev` liegen in Docker-Volumes (Linux-Binaries bzw. Turbopack-Lockfile funktionieren nicht auf dem Windows-Mount). Die `node_modules` auf dem Host werden nicht genutzt.
- Zugangsdaten/Secrets stehen direkt in `docker-compose.dev.yml` (nur lokal gültig). Die `.env` auf dem Host wird vom Container überlagert und spielt hier keine Rolle.
- Postgres ist zusätzlich auf `127.0.0.1:5441` erreichbar (für psql / Prisma Studio): `postgresql://temgine:temgine_dev@localhost:5441/temgine_cms`.

## Erster Login

Es gibt keinen Standard-Account. Bei leerer Datenbank `http://localhost:3020/setup` öffnen und den Admin selbst anlegen
(der Endpunkt sperrt sich, sobald ein User existiert). Danach Login unter `/admin`.

Für reine UI-Arbeit umgeht `NEXT_PUBLIC_DEV_MODE: "true"` im `app.environment` die Authentifizierung
(nur localhost, niemals in Produktion; Details in `.env.local.example`).

## Alltag

| Aktion | Befehl |
|---|---|
| Stoppen | `docker compose -f docker-compose.dev.yml stop` |
| Starten | `docker compose -f docker-compose.dev.yml up -d` |
| Logs | `docker compose -f docker-compose.dev.yml logs -f app` |
| Befehl im Container (Migration, Jest, …) | `docker compose -f docker-compose.dev.yml exec app npx prisma migrate deploy` |
| Tests | `docker compose -f docker-compose.dev.yml exec app npx jest __tests__/templateParser.test.js` |
| Neue Abhängigkeit installiert | `docker compose -f docker-compose.dev.yml restart app` (führt `npm install` erneut aus) |
| Alles zurücksetzen (löscht DB-Daten!) | `docker compose -f docker-compose.dev.yml down -v`, dann Schnellstart |

Docker Desktop muss laufen; die Container starten danach von selbst (`restart: unless-stopped` bei Postgres, App per `up -d`).

## Häufige Fehler

- **Port 3020 / 5441 belegt** — Host-Port links in `docker-compose.dev.yml` ändern (bei 3020 auch `NEXTAUTH_URL`).
- **„Authentication failed against database server"** — Die App erreicht eine andere Datenbank als die aus dem Compose-Stack
  (z. B. lokaler Postgres auf 5432). Im Compose-Setup zeigt `DATABASE_URL` auf den Service `postgres`.
- **„lockfile … Permission denied"** beim Start — das `.next-dev`-Volume fehlt; `docker-compose.dev.yml` muss `next_cache:/app/.next-dev` enthalten.
- **Container-Name/Volumes kollidieren mit dem Voll-Stack** — nicht passiert: Projektname ist `temgine-dev`.

## Beispieldaten

`docker compose -f docker-compose.dev.yml exec app node scripts/seed-example-pages.js` legt Beispiel-Seiten an (Startseite, Über uns, Leistungen mit zwei Unterseiten, Kontakt; idempotent, nutzt vorhandene Block-Templates).
