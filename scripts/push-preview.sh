#!/usr/bin/env bash
# Odpowiednik `push-master`, ale bez mergowania do master - tylko commit + push
# bieżącego brancha (np. dev), co triggeruje Vercel Preview Deployment.
#
#   0. LOKALNIE: db push na bazę dev (.env.local) - żeby baza dev miała
#      nowy schemat od razu, bez czekania na build na Vercelu
#   1. commit + push na bieżący branch
#   2. LOKALNIE: testy jednostkowe (vitest) muszą przejść - inaczej stop
#   3. e2e (Playwright) na ŚWIEŻO zbudowanym deploymencie preview tego commita
#      - inaczej stop (pomijane, jeśli brak .env.e2e - patrz e2e/README.md)

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

log "0/3 Db push na bazę dev (.env.local)"
if [ -f .env.local ]; then
  # W subshellu, żeby zmienne z .env.local (m.in. VERCEL=1) nie wyciekły do
  # kolejnych kroków (vitest, playwright).
  (
    set -a
    source .env.local
    set +a
    if [ -n "${SUPABASE_DB_URL:-}" ]; then
      npx supabase db push --db-url "$SUPABASE_DB_URL" --yes
    else
      echo "  (pomijam - brak SUPABASE_DB_URL w .env.local)"
    fi
  ) || fail "Db push na bazę dev nie powiódł się. Napraw migrację zanim spróbujesz znowu."
else
  echo "  (pomijam - brak .env.local)"
fi

log "1/3 Commit + push brancha '$CURRENT_BRANCH'"
git add .
git commit -m 'update' || echo "  (nic do commitowania)"

log "2/3 Testy jednostkowe (vitest) - lokalna bramka przed pushem"
if ! npm run test; then
  fail "Testy jednostkowe NIE przeszły. Napraw je zanim spróbujesz znowu - nic nie zostało wypchnięte."
fi

git push origin "$CURRENT_BRANCH"
SHA="$(git rev-parse HEAD)"
echo "  commit: $SHA"

log "3/3 Testy e2e (Playwright) na świeżym deploymencie preview tego commita"
if [ ! -f .env.e2e ]; then
  echo "  (pomijam - brak .env.e2e; jednorazowa konfiguracja: patrz e2e/README.md)"
else
  PREVIEW_HOST="$(node scripts/wait-for-preview-deploy.mjs "$SHA" "$CURRENT_BRANCH")" \
    || fail "Nie doczekano się gotowego deploya preview dla $SHA."
  if ! E2E_BASE_URL="https://$PREVIEW_HOST" npm run test:e2e; then
    fail "Testy e2e NIE przeszły na https://$PREVIEW_HOST."
  fi
fi

log "Gotowe. Push wykonany, Preview Deployment dla '$CURRENT_BRANCH' zweryfikowany testami e2e."
