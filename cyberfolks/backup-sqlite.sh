#!/usr/bin/env bash

# Prosty backup bazy SQLite. Dla spójności danych najlepiej uruchamiać go
# po zatrzymaniu aplikacji albo przed operacją aktualizacji.
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_FILE="${DATABASE_FILE:-$APP_DIR/prisma/data/prod.db}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/prisma/backups}"

if [[ ! -f "$DB_FILE" ]]; then
  echo "Nie znaleziono bazy SQLite: $DB_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/prod-$(date +%Y%m%d-%H%M%S).db"
cp "$DB_FILE" "$BACKUP_FILE"

echo "Backup zapisany: $BACKUP_FILE"