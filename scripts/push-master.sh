#!/usr/bin/env bash
# Zastępuje stary alias `push-master`. Przepływ:
#
#   1. commit + push na bieżący branch (dev)
#   2. LOKALNIE: testy jednostkowe (vitest) muszą przejść - inaczej stop
#   3. merge dev do master i push master
#   4. checkout z powrotem na dev + rebase na master

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

log "1/4 Commit + push brancha '$CURRENT_BRANCH'"
git add .
git commit -m 'update' || echo "  (nic do commitowania)"

log "2/4 Testy jednostkowe (vitest) - lokalna bramka przed pushem"
if ! npm run test; then
  fail "Testy jednostkowe NIE przeszły. Napraw je zanim spróbujesz znowu - nic nie zostało wypchnięte na master."
fi

git push origin "$CURRENT_BRANCH"
SHA="$(git rev-parse HEAD)"
echo "  commit: $SHA"

log "3/4 Merge '$CURRENT_BRANCH' -> master i push"
git checkout master
git merge "$CURRENT_BRANCH"
git push origin master

log "4/4 Powrót na '$CURRENT_BRANCH' i rebase na master"
git checkout "$CURRENT_BRANCH"
git rebase master

log "Gotowe. master zaktualizowany i zweryfikowany testami jednostkowymi."
