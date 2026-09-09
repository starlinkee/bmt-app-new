#!/usr/bin/env bash
# Zastępuje stary alias `push-master`. Przepływ:
#
#   1. commit + push na bieżący branch (dev)
#   2. LOKALNIE: testy jednostkowe (vitest) muszą przejść - inaczej stop
#   3. CZEKAMY na workflow "Preview E2E" (GitHub Actions), który odpala się
#      automatycznie po tym jak Vercel wystawi Preview deployment dla tego
#      pusha i uruchamia testy e2e (Playwright) na tym URL-u
#   4. dopiero gdy (2) i (3) przejdą -> merge dev do master i push master
#   5. checkout z powrotem na dev + rebase na master
#
# Wymaga zainstalowanego i zalogowanego `gh` (GitHub CLI) oraz włączonej
# integracji Vercel<->GitHub w tym repo (Vercel musi tworzyć Deployment
# Status, żeby .github/workflows/preview-e2e.yml mógł się odpalić).
#
# Zmienne środowiskowe:
#   PUSH_MASTER_SKIP_E2E=1   - pomija krok 3 (awaryjny wyłącznik, użyj świadomie)
#   PUSH_MASTER_E2E_TIMEOUT  - maks. czas oczekiwania na e2e w sekundach (domyślnie 900)

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
TIMEOUT="${PUSH_MASTER_E2E_TIMEOUT:-900}"
POLL_INTERVAL=15

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

log "1/5 Commit + push brancha '$CURRENT_BRANCH'"
git add .
git commit -m 'update' || echo "  (nic do commitowania)"

log "2/5 Testy jednostkowe (vitest) - lokalna bramka przed pushem"
if ! npm run test; then
  fail "Testy jednostkowe NIE przeszły. Napraw je zanim spróbujesz znowu - nic nie zostało wypchnięte na master."
fi

git push origin "$CURRENT_BRANCH"
SHA="$(git rev-parse HEAD)"
echo "  commit: $SHA"

if [ "${PUSH_MASTER_SKIP_E2E:-0}" = "1" ]; then
  log "3/5 PUSH_MASTER_SKIP_E2E=1 - pomijam oczekiwanie na e2e (świadomie ryzykowne!)"
else
  log "3/5 Czekam na Vercel Preview + testy e2e (workflow 'Preview E2E')..."

  if ! command -v gh >/dev/null 2>&1; then
    fail "Brak 'gh' (GitHub CLI) - nie mogę sprawdzić statusu e2e. Zainstaluj gh albo ustaw PUSH_MASTER_SKIP_E2E=1."
  fi

  ELAPSED=0
  RUN_ID=""
  while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
    RUN_ID="$(gh run list --workflow=preview-e2e.yml --json databaseId,headSha \
      --jq ".[] | select(.headSha == \"$SHA\") | .databaseId" 2>/dev/null | head -n1 || true)"
    if [ -n "$RUN_ID" ]; then
      break
    fi
    sleep "$POLL_INTERVAL"
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
    echo "  ...jeszcze nie widzę uruchomienia workflow (${ELAPSED}s/${TIMEOUT}s) - Vercel wciąż buduje Preview?"
  done

  if [ -z "$RUN_ID" ]; then
    fail "Nie znalazłem uruchomienia 'Preview E2E' dla commita $SHA w ciągu ${TIMEOUT}s. Sprawdź ręcznie w GitHub Actions i integrację Vercel<->GitHub, albo popraw PUSH_MASTER_E2E_TIMEOUT."
  fi

  echo "  znaleziono run: $RUN_ID - czekam na wynik (może potrwać kilka minut)..."
  if ! gh run watch "$RUN_ID" --exit-status; then
    fail "Testy e2e na Preview NIE przeszły (run $RUN_ID). NIE mergowałem do master. Zobacz: gh run view $RUN_ID --log"
  fi
  echo "  ✓ e2e na Preview przeszły"
fi

log "4/5 Merge '$CURRENT_BRANCH' -> master i push"
git checkout master
git merge "$CURRENT_BRANCH"
git push origin master

log "5/5 Powrót na '$CURRENT_BRANCH' i rebase na master"
git checkout "$CURRENT_BRANCH"
git rebase master

log "Gotowe. master zaktualizowany i zweryfikowany testami jednostkowymi + e2e na Preview."
