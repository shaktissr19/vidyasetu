#!/usr/bin/env bash
set -Eeuo pipefail

[[ $# -eq 2 ]] || {
  echo "Usage: $0 KEY ENV_FILE" >&2
  exit 2
}

KEY="$1"
ENV_FILE="$2"

[[ "$KEY" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
  echo "Invalid environment key: $KEY" >&2
  exit 2
}

[[ -f "$ENV_FILE" ]] || {
  echo "Environment file not found: $ENV_FILE" >&2
  exit 2
}

env -i PATH="$PATH" node --env-file="$ENV_FILE" -e '
const key = process.argv[1];
const value = process.env[key];
if (typeof value === "string") process.stdout.write(value);
' "$KEY"
