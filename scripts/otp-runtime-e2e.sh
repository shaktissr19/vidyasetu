#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
MOBILE="${OTP_E2E_MOBILE:-9300000001}"

fail() {
  printf 'FAILED: %s\n' "$*" >&2
  exit 1
}

printf '==> Selected-role validation occurs before OTP login\n'
wrong_role_code="$(curl -sS -o /tmp/otp-wrong-role.json -w '%{http_code}' \
  -X POST "$API_BASE/auth/send-otp" \
  -H 'Content-Type: application/json' \
  -d "{\"mobile\":\"$MOBILE\",\"role\":\"PARENT\"}")"
[[ "$wrong_role_code" == "403" ]] || {
  cat /tmp/otp-wrong-role.json >&2 || true
  fail "Expected wrong-role OTP request to return 403; got $wrong_role_code"
}

grep -q 'student account' /tmp/otp-wrong-role.json || fail 'Wrong-role response did not explain the registered Student role'

printf '==> Request first OTP\n'
first="$(curl -fsS -X POST "$API_BASE/auth/send-otp" \
  -H 'Content-Type: application/json' \
  -d "{\"mobile\":\"$MOBILE\",\"role\":\"STUDENT\"}")"
otp1="$(jq -er '.data.otp' <<< "$first")"
[[ "$otp1" =~ ^[0-9]{6}$ ]] || fail 'First disposable OTP is not six digits'
[[ "$(jq -r '.data.resendAfterSeconds' <<< "$first")" == "30" ]] || fail 'OTP resend timing contract changed unexpectedly'

printf '==> Request replacement OTP\n'
second="$(curl -fsS -X POST "$API_BASE/auth/send-otp" \
  -H 'Content-Type: application/json' \
  -d "{\"mobile\":\"$MOBILE\",\"role\":\"STUDENT\"}")"
otp2="$(jq -er '.data.otp' <<< "$second")"
[[ "$otp2" =~ ^[0-9]{6}$ ]] || fail 'Replacement disposable OTP is not six digits'

# A one-in-a-million random collision should not turn a valid implementation into a flaky CI failure.
# When a collision happens, request no additional OTP because the endpoint intentionally allows only
# three requests/hour per mobile and the wrong-role request already consumed one limiter slot.
if [[ "$otp1" == "$otp2" ]]; then
  printf 'Generated OTPs collided; resend overwrite was exercised but old/new values are identical, so invalidation assertion is skipped.\n'
else
  printf '==> Old OTP must be invalid after resend\n'
  old_code="$(curl -sS -o /tmp/otp-old.json -w '%{http_code}' \
    -X POST "$API_BASE/auth/verify-otp" \
    -H 'Content-Type: application/json' \
    -d "{\"mobile\":\"$MOBILE\",\"otp\":\"$otp1\",\"role\":\"STUDENT\"}")"
  [[ "$old_code" == "401" ]] || {
    cat /tmp/otp-old.json >&2 || true
    fail "Old OTP remained valid after resend; expected 401, got $old_code"
  }
fi

printf '==> Replacement OTP must authenticate the correct Student\n'
login="$(curl -fsS -X POST "$API_BASE/auth/verify-otp" \
  -H 'Content-Type: application/json' \
  -d "{\"mobile\":\"$MOBILE\",\"otp\":\"$otp2\",\"role\":\"STUDENT\"}")"
[[ "$(jq -r '.data.user.mobile' <<< "$login")" == "$MOBILE" ]] || fail 'OTP login returned the wrong mobile identity'
[[ "$(jq -r '.data.user.role' <<< "$login")" == "STUDENT" ]] || fail 'OTP login returned the wrong role'
jq -e '.data.accessToken | type == "string" and length > 20' <<< "$login" >/dev/null || fail 'OTP login did not issue an access token'

printf '\nDisposable OTP role/resend E2E passed.\n'
