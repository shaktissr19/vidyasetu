#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[[ -d "$PROJECT_DIR/backend" ]] || fail "Missing backend directory: $PROJECT_DIR/backend"
[[ -d "$PROJECT_DIR/frontend" ]] || fail "Missing frontend directory: $PROJECT_DIR/frontend"
[[ -d "$PROJECT_DIR/shared/contracts" ]] || fail "Missing shared contracts directory: $PROJECT_DIR/shared/contracts"

for command_name in node npm; do
  command -v "$command_name" >/dev/null || fail "$command_name is not installed"
done

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
(( NODE_MAJOR >= 20 )) || fail "Node.js 20+ is required; found $(node --version)"

install_without_lockfile() {
  # shared/contracts and frontend currently do not have committed lockfiles.
  # Do not create untracked lockfiles on production; CI executes this same path.
  npm install --package-lock=false --no-audit --no-fund
}

log "Build shared TypeScript contracts"
cd "$PROJECT_DIR/shared/contracts"
rm -rf node_modules dist
install_without_lockfile
npm run typecheck
npm run build
test -s dist/index.d.ts || fail "shared/contracts/dist/index.d.ts was not generated"

log "Install, typecheck and compile backend"
cd "$PROJECT_DIR/backend"
rm -rf node_modules dist
[[ -s package-lock.json ]] || fail "backend/package-lock.json is required"
npm ci --no-audit --no-fund
npm run typecheck
npm run build
test -s dist/index.js || fail "backend/dist/index.js was not generated"

log "Install, typecheck and build production Next.js"
cd "$PROJECT_DIR/frontend"
rm -rf node_modules .next
install_without_lockfile
npm run typecheck
NODE_ENV=production npm run build
test -s .next/BUILD_ID || fail "frontend production build did not create .next/BUILD_ID"

log "Enforce migrated application source invariants"
BACKEND_JS="$(find "$PROJECT_DIR/backend/src" -type f -name '*.js' | wc -l | tr -d ' ')"
FRONTEND_JS="$(find "$PROJECT_DIR/frontend/src" -type f \( -name '*.js' -o -name '*.jsx' \) | wc -l | tr -d ' ')"
[[ "$BACKEND_JS" == "0" ]] || fail "backend/src still contains $BACKEND_JS JavaScript files"
[[ "$FRONTEND_JS" == "0" ]] || fail "frontend/src still contains $FRONTEND_JS JavaScript/JSX files"

grep -q '"allowJs": false' "$PROJECT_DIR/backend/tsconfig.json" || fail "backend allowJs must remain false"
grep -q '"allowJs": false' "$PROJECT_DIR/frontend/tsconfig.json" || fail "frontend allowJs must remain false"

log "Production-equivalent native build passed"
printf 'Node: %s\n' "$(node --version)"
printf 'Backend artifact: %s\n' "$PROJECT_DIR/backend/dist/index.js"
printf 'Frontend build: %s\n' "$PROJECT_DIR/frontend/.next/BUILD_ID"
