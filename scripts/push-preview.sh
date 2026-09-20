#!/usr/bin/env bash
# Jedyna droga na produkcję (bezpośredni merge/push do master jest niedozwolony).
# Wszystkie testy chodzą LOKALNIE (nic nie zużywa minut GitHub Actions):
#
#   0. db push na bazę dev (.env.local) - żeby baza dev miała nowy schemat
#      od razu, bez czekania na build na Vercelu
#   1. commit
#   2. testy jednostkowe (vitest) - inaczej stop, nic nie wypchnięte
#   3. push na bieżący branch -> Vercel buduje Preview Deployment
#   4. czekanie na deploy preview TEGO commita (GitHub API: deployments)
#   5. testy e2e (Playwright) lokalnie, przeciwko URL-owi tego preview
#      (reszta konfiguracji z .env.e2e; E2E_BASE_URL jest nadpisywany)
#   6. PR branch -> master (dopiero po zielonych testach) - merge ręcznie
#      przyciskiem na GitHubie
#
# Wymaga zalogowanego `gh` i .env.e2e (patrz e2e/README.md).

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

[ "$CURRENT_BRANCH" != "master" ] || fail "Jesteś na master - przełącz się na branch roboczy (np. dev)."
command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1 \
  || fail "Brak zalogowanego GitHub CLI (uruchom 'gh auth login') - bez niego nie da się znaleźć deploya preview ani otworzyć PR."
[ -f .env.e2e ] || fail "Brak .env.e2e (skopiuj z .env.e2e.example, patrz e2e/README.md)."

log "0/6 Db push na bazę dev (.env.local)"
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

log "1/6 Commit"
git add .
git commit -m 'update' || echo "  (nic do commitowania)"

log "2/6 Testy jednostkowe (vitest) - bramka przed pushem"
npm run test || fail "Testy jednostkowe NIE przeszły. Napraw je zanim spróbujesz znowu - nic nie zostało wypchnięte."

log "3/6 Push brancha '$CURRENT_BRANCH'"
git push origin "$CURRENT_BRANCH"
SHA="$(git rev-parse HEAD)"
echo "  commit: $SHA"

log "4/6 Czekam na deploy preview commita ${SHA:0:7} (Vercel)"
# Vercel zgłasza do GitHuba deployment + statusy (pending -> success/failure).
# Bierzemy najnowszy status każdego deploya tego commita.
PREVIEW_URL=""
for _ in $(seq 1 120); do
  DEPLOY_IDS="$(gh api "repos/{owner}/{repo}/deployments?sha=$SHA" --jq '.[].id' 2>/dev/null || true)"
  for ID in $DEPLOY_IDS; do
    STATUS="$(gh api "repos/{owner}/{repo}/deployments/$ID/statuses" \
      --jq '.[0] | "\(.state) \(.environment_url // .target_url // "")"' 2>/dev/null || true)"
    STATE="${STATUS%% *}"
    URL="${STATUS#* }"
    case "$STATE" in
      success) [ -n "$URL" ] && PREVIEW_URL="$URL" ;;
      failure|error) fail "Deploy preview na Vercelu nieudany ($URL) - nic nie zostało wypchnięte na master." ;;
    esac
    [ -n "$PREVIEW_URL" ] && break
  done
  [ -n "$PREVIEW_URL" ] && break
  sleep 10
done
[ -n "$PREVIEW_URL" ] || fail "Deploy preview nie był gotowy po 20 min - nic nie zostało wypchnięte na master."
echo "  preview: $PREVIEW_URL"

log "5/6 Testy e2e (Playwright, lokalnie) na $PREVIEW_URL"
# dotenv w playwright.config.ts nie nadpisuje zmiennych już ustawionych,
# więc E2E_BASE_URL z .env.e2e ustępuje adresowi świeżego deploya.
E2E_BASE_URL="$PREVIEW_URL" npm run test:e2e \
  || fail "Testy e2e NIE przeszły (raport: npx playwright show-report). Napraw je zanim spróbujesz znowu - nic nie zostało wypchnięte na master."

log "6/6 PR '$CURRENT_BRANCH' -> master (bez merge)"
PR_URL="$(gh pr list --head "$CURRENT_BRANCH" --base master --state open --json url --jq '.[0].url // empty')"
if [ -z "$PR_URL" ]; then
  PR_URL="$(gh pr create --base master --head "$CURRENT_BRANCH" \
    --title "Release: $CURRENT_BRANCH -> master (${SHA:0:7})" \
    --body "Otwarty przez scripts/push-preview.sh po zielonych testach jednostkowych i e2e (lokalnie). Merge ręcznie.")"
fi
echo "  PR: $PR_URL"

log "Gotowe. Testy zielone, PR czeka na ręczny merge przyciskiem na GitHubie: $PR_URL"
echo "  Po merge: git fetch origin master && git rebase origin/master"
