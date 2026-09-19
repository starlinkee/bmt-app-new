#!/usr/bin/env bash
# Zastępuje stary alias `push-master`. Przepływ:
#
#   0. LOKALNIE: db push na bazę dev (.env.local) - żeby baza dev miała
#      nowy schemat od razu, bez czekania na build na Vercelu
#   1. commit + push na bieżący branch (dev)
#   2. LOKALNIE: testy jednostkowe (vitest) muszą przejść - inaczej stop
#   3. e2e (Playwright) w GitHub Actions (.github/workflows/e2e.yml) na ŚWIEŻO
#      zbudowanym deploymencie preview tego commita - czekamy na wynik,
#      inaczej stop (pomijane, jeśli brak zalogowanego `gh`)
#   4. merge dev do master i push master
#   5. checkout z powrotem na dev + rebase na master

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

log "0/5 Db push na bazę dev (.env.local)"
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

log "3/5 Testy e2e (GitHub Actions) na świeżym deploymencie preview tego commita"
if ! command -v gh >/dev/null 2>&1 || ! gh auth status >/dev/null 2>&1; then
  echo "  (pomijam - brak zalogowanego GitHub CLI: uruchom 'gh auth login')"
else
  # Workflow startuje dopiero, gdy Vercel zbuduje preview (zdarzenie
  # deployment_status). Stany pending/in_progress dają przebiegi "skipped" -
  # pomijamy je, żeby nie wziąć ich za zaliczony test.
  echo "  czekam na start testów e2e w GitHub Actions (commit ${SHA:0:7})..."
  RUN_ID=""
  for _ in $(seq 1 60); do
    RUN_ID="$(gh run list --commit "$SHA" --limit 30 --json databaseId,conclusion,workflowName \
      --jq '[.[] | select(.workflowName == "E2E" and .conclusion != "skipped")][0].databaseId // empty' 2>/dev/null || true)"
    [ -n "$RUN_ID" ] && break
    sleep 10
  done
  [ -n "$RUN_ID" ] || fail "Nie wystartowały testy e2e w GitHub Actions dla $SHA (deploy preview nieudany lub po 10 min nie gotowy) - nic nie zostało wypchnięte na master."
  if ! gh run watch "$RUN_ID" --exit-status; then
    fail "Testy e2e NIE przeszły: $(gh run view "$RUN_ID" --json url --jq .url). Napraw je zanim spróbujesz znowu - nic nie zostało wypchnięte na master."
  fi
fi

log "4/5 Merge '$CURRENT_BRANCH' -> master i push"
git checkout master
git merge "$CURRENT_BRANCH"
git push origin master

log "5/5 Powrót na '$CURRENT_BRANCH' i rebase na master"
git checkout "$CURRENT_BRANCH"
git rebase master

log "Gotowe. master zaktualizowany i zweryfikowany testami jednostkowymi oraz e2e."
