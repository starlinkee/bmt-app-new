#!/usr/bin/env bash
# Odpowiednik `push-master`, ale bez mergowania do master - tylko commit + push
# bieżącego brancha (np. dev), co triggeruje Vercel Preview Deployment.
#
#   1. commit + push na bieżący branch
#   2. LOKALNIE: testy jednostkowe (vitest) muszą przejść - inaczej stop

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

log "1/2 Commit + push brancha '$CURRENT_BRANCH'"
git add .
git commit -m 'update' || echo "  (nic do commitowania)"

log "2/2 Testy jednostkowe (vitest) - lokalna bramka przed pushem"
if ! npm run test; then
  fail "Testy jednostkowe NIE przeszły. Napraw je zanim spróbujesz znowu - nic nie zostało wypchnięte."
fi

git push origin "$CURRENT_BRANCH"
SHA="$(git rev-parse HEAD)"
echo "  commit: $SHA"

log "Gotowe. Push wykonany - Vercel powinien wystartować Preview Deployment dla '$CURRENT_BRANCH'."
