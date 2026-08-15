#!/usr/bin/env bash

# Uruchamiaj z katalogu głównego aplikacji lub jako:
# ./cyberfolks/post-deploy.sh
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [[ ! -f package.json ]]; then
  echo "Brak package.json w katalogu aplikacji: $APP_DIR" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Brak pliku .env. Najpierw skopiuj cyberfolks/.env.production.example do .env." >&2
  exit 1
fi

mkdir -p prisma/data
npm ci
npm run db:generate
npm run db:push
npm run build

echo "Wdrożenie przygotowane. Zrestartuj aplikację Node.js w panelu cyber_Folks."