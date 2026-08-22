#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${1:-backend/.env}"

fail() {
  printf 'FAILED: %s\n' "$*" >&2
  exit 1
}

read_env_value() {
  local key="$1" value
  value="$(grep -m1 -E "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)"
  value="${value%$'\r'}"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

[[ -s "$ENV_FILE" ]] || fail "OTP preflight cannot find environment file: $ENV_FILE"

NODE_ENV_VALUE="$(read_env_value NODE_ENV)"
SMS_PROVIDER_VALUE="$(read_env_value SMS_PROVIDER)"
NODE_ENV_VALUE="${NODE_ENV_VALUE:-production}"
SMS_PROVIDER_VALUE="${SMS_PROVIDER_VALUE:-mock}"

if [[ "$NODE_ENV_VALUE" == "production" && "$SMS_PROVIDER_VALUE" == "mock" ]]; then
  fail "SMS_PROVIDER=mock is not allowed in production because users would see OTP success without receiving an SMS."
fi

case "$SMS_PROVIDER_VALUE" in
  twofactor)
    [[ -n "$(read_env_value TWOFACTOR_API_KEY)" ]] || fail "TWOFACTOR_API_KEY is required when SMS_PROVIDER=twofactor."
    template_name="$(read_env_value TWOFACTOR_TEMPLATE_NAME)"
    if [[ -n "$template_name" ]]; then
      printf 'OTP provider preflight: 2Factor configured with custom template name.\n'
    else
      printf 'OTP provider preflight: 2Factor configured with provider default OTP template.\n'
    fi
    ;;
  kaleyra)
    [[ -n "$(read_env_value KALEYRA_API_KEY)" ]] || fail "KALEYRA_API_KEY is required when SMS_PROVIDER=kaleyra."
    [[ -n "$(read_env_value KALEYRA_ACCOUNT_SID)" ]] || fail "KALEYRA_ACCOUNT_SID is required when SMS_PROVIDER=kaleyra."
    sender_id="$(read_env_value KALEYRA_SENDER_ID)"
    legacy_sender="$(read_env_value KALEYRA_SID)"
    [[ -n "$sender_id" || -n "$legacy_sender" ]] || fail "KALEYRA_SENDER_ID is required when SMS_PROVIDER=kaleyra."
    [[ -n "$(read_env_value KALEYRA_ENTITY_ID)" ]] || fail "KALEYRA_ENTITY_ID is required for India DLT-compliant Kaleyra OTP delivery."
    [[ -n "$(read_env_value KALEYRA_TEMPLATE_ID)" ]] || fail "KALEYRA_TEMPLATE_ID is required for India DLT-compliant Kaleyra OTP delivery."
    printf 'OTP provider preflight: Kaleyra India account, sender and DLT identifiers configured.\n'
    ;;
  mock)
    printf 'OTP provider preflight: mock provider allowed for non-production environment.\n'
    ;;
  *)
    fail "Unsupported SMS_PROVIDER='$SMS_PROVIDER_VALUE'. Use twofactor, kaleyra or mock."
    ;;
esac
