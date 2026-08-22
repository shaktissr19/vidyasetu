#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/vidyasetu}"

[[ $EUID -eq 0 ]] || { echo 'ERROR: run as root.' >&2; exit 1; }
[[ -d "$PROJECT_DIR/.git" ]] || { echo "ERROR: repository not found at $PROJECT_DIR" >&2; exit 1; }

PROJECT_DIR="$PROJECT_DIR" bash "$PROJECT_DIR/scripts/verify-production-otp-config.sh"
bash "$PROJECT_DIR/scripts/deploy-main-native.sh"
