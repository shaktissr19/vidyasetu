#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/vidyasetu}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/backend/.env}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

read_env_value() {
  local key="$1"
  grep -m1 -E "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' || true
}

require_env() {
  local key="$1"
  local value
  value="$(read_env_value "$key")"
  [[ -n "$value" ]] || fail "$key is missing from $ENV_FILE"
}

[[ -s "$ENV_FILE" ]] || fail "Production backend environment file is missing: $ENV_FILE"

provider="$(read_env_value SMS_PROVIDER | tr '[:upper:]' '[:lower:]')"
case "$provider" in
  kaleyra)
    require_env KALEYRA_API_KEY
    require_env KALEYRA_ACCOUNT_SID
    require_env KALEYRA_SENDER_ID
    require_env KALEYRA_TEMPLATE_ID
    printf 'Production OTP provider: Kaleyra\n'
    ;;
  twofactor)
    require_env TWOFACTOR_API_KEY
    require_env TWOFACTOR_TEMPLATE_NAME
    printf 'Production OTP provider: 2Factor\n'
    ;;
  ''|mock)
    fail "Production OTP cannot use SMS_PROVIDER=${provider:-<missing>}. Configure kaleyra or twofactor before deployment."
    ;;
  *)
    fail "Unsupported SMS_PROVIDER=$provider. Supported production values: kaleyra, twofactor."
    ;;
esac

printf 'OTP provider configuration is present. No secret values were printed.\n'
