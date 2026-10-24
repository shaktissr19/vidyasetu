#!/usr/bin/env bash
set -Eeuo pipefail

LIMIT_FILE="${NGINX_UPLOAD_LIMIT_FILE:-/etc/nginx/conf.d/vidyasetu-syllabus-upload-limit.conf}"
NGINX_BIN="${NGINX_BIN:-nginx}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-systemctl}"
LIMIT_MEGABYTES="${SYLLABUS_UPLOAD_REQUEST_LIMIT_MB:-260}"

fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run this script as root."
[[ "$LIMIT_MEGABYTES" =~ ^[0-9]+$ ]] || fail "SYLLABUS_UPLOAD_REQUEST_LIMIT_MB must be an integer."
(( LIMIT_MEGABYTES >= 260 )) || fail "The request limit must be at least 260 MB for ten 25 MB PDFs plus multipart overhead."
command -v "$NGINX_BIN" >/dev/null || fail "nginx is not installed."
command -v "$SYSTEMCTL_BIN" >/dev/null || fail "systemctl is not available."

EXPECTED_CONTENT="# Managed by VidyaSetu syllabus upload deployment helper.
# The API enforces 25 MB per PDF and a maximum of 10 PDFs per batch.
client_max_body_size ${LIMIT_MEGABYTES}m;
"

if [[ -f "$LIMIT_FILE" ]] && [[ "$(cat "$LIMIT_FILE")"$'\n' == "$EXPECTED_CONTENT" ]]; then
  "$NGINX_BIN" -t
  printf 'Nginx syllabus upload limit is already configured: %s MB.\n' "$LIMIT_MEGABYTES"
  exit 0
fi

install -d -m 0755 "$(dirname "$LIMIT_FILE")"
stamp="$(date +%Y%m%d%H%M%S)"
backup_file=""
if [[ -e "$LIMIT_FILE" ]]; then
  backup_file="${LIMIT_FILE}.before-${stamp}"
  cp -a "$LIMIT_FILE" "$backup_file"
fi

temporary_file="${LIMIT_FILE}.tmp.$$"
restore_previous() {
  if [[ -n "$backup_file" ]]; then
    cp -a "$backup_file" "$LIMIT_FILE"
  else
    rm -f "$LIMIT_FILE"
  fi
  rm -f "$temporary_file"
}

printf '%s' "$EXPECTED_CONTENT" > "$temporary_file"
chmod 0644 "$temporary_file"
mv -f "$temporary_file" "$LIMIT_FILE"

if ! "$NGINX_BIN" -t; then
  restore_previous
  "$NGINX_BIN" -t || true
  fail "Nginx validation failed. Previous configuration was restored."
fi

if ! "$SYSTEMCTL_BIN" reload nginx; then
  restore_previous
  "$NGINX_BIN" -t && "$SYSTEMCTL_BIN" reload nginx || true
  fail "Nginx reload failed. Previous configuration was restored."
fi

printf 'Configured Nginx to accept syllabus upload requests up to %s MB.\n' "$LIMIT_MEGABYTES"
if [[ -n "$backup_file" ]]; then
  printf 'Previous helper config backup: %s\n' "$backup_file"
fi
