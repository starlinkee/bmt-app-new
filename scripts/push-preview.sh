#!/usr/bin/env bash
# Jedyna droga na produkcję (bezpośredni merge/push do master jest niedozwolony).
# Commit + push bieżącego brancha (np. dev) triggeruje Vercel Preview Deployment,
# a po zielonych testach skrypt otwiera PR do master i go merguje.
#
#   0. LOKALNIE: db push na bazę dev (.env.local) - żeby baza dev miała
#      nowy schemat od razu, bez czekania na build na Vercelu
#   1. commit + push na bieżący branch
#   2. LOKALNIE: testy jednostkowe (vitest) muszą przejść - inaczej stop
#   3. e2e (Playwright) w GitHub Actions (.github/workflows/e2e.yml) na ŚWIEŻO
#      zbudowanym deploymencie preview tego commita - czekamy na wynik,
#      inaczej stop (wymaga zalogowanego `gh`)
#   4. PR dev -> master i jego merge (dopiero po zielonych testach)
#   5. powrót na dev + rebase na master

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
  fail "Brak zalogowanego GitHub CLI (uruchom 'gh auth login') - bez niego nie da się zweryfikować e2e ani otworzyć PR. Nic nie trafiło na master."
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
  [ -n "$RUN_ID" ] || fail "Nie wystartowały testy e2e w GitHub Actions dla $SHA (deploy preview nieudany lub nie gotowy po 10 min) - nic nie zostało wypchnięte na master."
  if ! gh run watch "$RUN_ID" --exit-status; then
    fail "Testy e2e NIE przeszły: $(gh run view "$RUN_ID" --json url --jq .url). Napraw je zanim spróbujesz znowu - nic nie zostało wypchnięte na master."
  fi
fi

log "4/5 PR '$CURRENT_BRANCH' -> master i merge"
[ "$CURRENT_BRANCH" != "master" ] || fail "Jesteś na master - przełącz się na branch roboczy (np. dev)."
PR_URL="$(gh pr list --head "$CURRENT_BRANCH" --base master --state open --json url --jq '.[0].url // empty')"
if [ -z "$PR_URL" ]; then
  PR_URL="$(gh pr create --base master --head "$CURRENT_BRANCH"     --title "Release: $CURRENT_BRANCH -> master (${SHA:0:7})"     --body "Automatycznie z scripts/push-preview.sh po zielonych testach jednostkowych i e2e.")"
fi
echo "  PR: $PR_URL"
gh pr merge "$PR_URL" --merge || fail "Merge PR nie powiódł się: $PR_URL"

log "5/5 Powrót na '$CURRENT_BRANCH' i rebase na master"
git fetch origin master
git rebase origin/master

log "Gotowe. master zaktualizowany przez PR po testach jednostkowych i e2e."
