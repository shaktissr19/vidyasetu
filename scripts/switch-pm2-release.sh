#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_DIR="${1:-}"
[[ -n "$RELEASE_DIR" ]] || { echo "Usage: $0 <release-dir>" >&2; exit 2; }
RELEASE_DIR="$(cd "$RELEASE_DIR" && pwd)"
ECOSYSTEM="$RELEASE_DIR/ecosystem.config.cjs"

fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[[ -s "$ECOSYSTEM" ]] || fail "Missing ecosystem file: $ECOSYSTEM"
[[ -s "$RELEASE_DIR/backend/dist/index.js" ]] || fail "Missing compiled API: $RELEASE_DIR/backend/dist/index.js"
[[ -s "$RELEASE_DIR/frontend/.next/BUILD_ID" || -s "$RELEASE_DIR/frontend/package.json" ]] || fail "Missing frontend release artifacts"
command -v pm2 >/dev/null || fail "pm2 is not installed"
command -v jq >/dev/null || fail "jq is not installed"

# PM2 startOrReload does not reliably replace pm_exec_path/pm_cwd for an app
# that already exists under the same name. Delete the old definitions first,
# then start both apps from the certified release ecosystem.
pm2 delete vs-api >/dev/null 2>&1 || true
pm2 delete vs-web >/dev/null 2>&1 || true
pm2 start "$ECOSYSTEM" --update-env

API_SCRIPT="$(pm2 jlist | jq -r '.[] | select(.name=="vs-api") | .pm2_env.pm_exec_path' | head -1)"
API_CWD="$(pm2 jlist | jq -r '.[] | select(.name=="vs-api") | .pm2_env.pm_cwd' | head -1)"
WEB_CWD="$(pm2 jlist | jq -r '.[] | select(.name=="vs-web") | .pm2_env.pm_cwd' | head -1)"

[[ "$API_SCRIPT" == "$RELEASE_DIR/backend/dist/index.js" ]] || fail "vs-api pm_exec_path mismatch: '$API_SCRIPT'"
[[ "$API_CWD" == "$RELEASE_DIR/backend" ]] || fail "vs-api cwd mismatch: '$API_CWD'"
[[ "$WEB_CWD" == "$RELEASE_DIR/frontend" ]] || fail "vs-web cwd mismatch: '$WEB_CWD'"

pm2 save

printf 'PM2 release handoff complete.\nAPI: %s\nAPI cwd: %s\nWeb cwd: %s\n' "$API_SCRIPT" "$API_CWD" "$WEB_CWD"
