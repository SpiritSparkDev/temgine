#!/bin/bash
# Wrapper um den offiziellen postgres-Entrypoint: POSTGRES_USER/PASSWORD/DB
# werden von Postgres nur beim allerersten Init eines leeren Datenverzeichnisses
# ausgewertet (siehe https://hub.docker.com/_/postgres, Abschnitt "Initialization
# scripts"). Läuft der Container gegen ein Volume, das schon mal mit anderen
# Werten initialisiert wurde (z. B. nach einem Deploy-Tool-Wechsel oder einer
# geänderten .env), bleiben Rolle und/oder Datenbank stillschweigend auf dem
# alten Stand — die App scheitert dann erst Minuten später mit einem kryptischen
# Prisma-Auth-Fehler, ohne dass irgendwo im Postgres-Log ein Hinweis auf die
# eigentliche Ursache steht.
#
# Dieses Skript gleicht Rolle (Passwort) und Datenbank bei JEDEM Start gegen die
# aktuellen POSTGRES_USER/PASSWORD/DB-Werte ab, nicht nur beim ersten Init.
# Das ist idempotent: bei einem frisch initialisierten Volume sind es No-Ops.
set -Eeo pipefail

docker-entrypoint.sh postgres &
PG_PID=$!

echo "[reconcile] Warte auf Postgres..."
until pg_isready -U "$POSTGRES_USER" -d postgres -q; do
  sleep 1
done

# Lokale Verbindungen über den Unix-Socket laufen im offiziellen Image per
# "trust" (siehe pg_hba.conf) — das ALTER greift also auch dann, wenn das
# aktuell in der Rolle hinterlegte Passwort nicht mehr mit POSTGRES_PASSWORD
# übereinstimmt. :"var" / :'var' sind psql-Variablen (sicher gegen Sonderzeichen
# in Benutzername/Passwort/DB-Name, keine String-Interpolation in SQL).
psql -v ON_ERROR_STOP=1 \
  -v pguser="$POSTGRES_USER" \
  -v pgpassword="$POSTGRES_PASSWORD" \
  -v pgdb="$POSTGRES_DB" \
  -U "$POSTGRES_USER" -d postgres <<-'SQL'
	\echo [reconcile] Gleiche Rollen-Passwort und Datenbank mit aktueller Config ab...
	ALTER USER :"pguser" WITH PASSWORD :'pgpassword';
	SELECT 'CREATE DATABASE ' || quote_ident(:'pgdb') || ' OWNER ' || quote_ident(:'pguser')
	WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'pgdb')\gexec
	\echo [reconcile] Abgeglichen.
SQL

wait "$PG_PID"
