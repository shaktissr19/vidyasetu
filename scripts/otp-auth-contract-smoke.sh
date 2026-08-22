#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf 'FAILED: %s\n' "$*" >&2
  exit 1
}

require_text() {
  local file="$1" pattern="$2" description="$3"
  grep -Fq -- "$pattern" "$file" || fail "$description ($file)"
}

LOGIN='frontend/src/app/(auth)/login/page.tsx'
AUTH_SERVICE='frontend/src/services/authService.ts'
AUTH_ROUTES='backend/src/routes/auth.routes.ts'
AUTH_CONTROLLER='backend/src/controllers/auth.controller.ts'
SMS_SERVICE='backend/src/services/notification.service.ts'
TOPBAR='frontend/src/components/layout/GlobalTopbar.tsx'
HOME='frontend/src/components/public/PublicHomeExperience.tsx'
STUDENT_PROD_SMOKE='scripts/student-production-smoke.sh'

for file in "$LOGIN" "$AUTH_SERVICE" "$AUTH_ROUTES" "$AUTH_CONTROLLER" "$SMS_SERVICE" "$TOPBAR" "$HOME" "$STUDENT_PROD_SMOKE" scripts/otp-provider-preflight.sh; do
  [[ -s "$file" ]] || fail "Required OTP/public-contract file is missing: $file"
done

printf '==> OTP request and UX contract\n'
require_text "$AUTH_ROUTES" 'role: roleSchema.optional()' 'Send OTP must accept the selected role'
require_text "$AUTH_CONTROLLER" 'validateOtpRole' 'OTP controller must validate selected account role'
require_text "$AUTH_CONTROLLER" 'resendAfterSeconds: 30' 'OTP API must publish resend timing'
require_text "$AUTH_SERVICE" 'sendOTP = (mobile: string, role?' 'Frontend OTP service must accept role'
require_text "$AUTH_SERVICE" "'/auth/send-otp', { mobile, role }" 'Frontend OTP service must send role'
require_text "$LOGIN" 'sendOTP(mobile, role)' 'Login must pass selected role when requesting OTP'
require_text "$LOGIN" 'Resend OTP' 'Login must expose Resend OTP'
require_text "$LOGIN" 'Change number' 'Login must expose Change number'
require_text "$LOGIN" 'sentMobile' 'OTP verification must retain the number that actually received the OTP'

printf '==> SMS provider contract\n'
require_text "$SMS_SERVICE" 'https://api-alerts.kaleyra.com/v4/' 'Kaleyra integration must use Alerts v4 endpoint'
require_text "$SMS_SERVICE" 'https://2factor.in/API/V1/OTP/SEND' '2Factor integration must use OTP send endpoint'
require_text "$SMS_SERVICE" "'X-API-Key': apiKey" '2Factor integration must authenticate with X-API-Key'
require_text "$SMS_SERVICE" "process.env.NODE_ENV === 'production'" 'Production SMS path must distinguish production mode'
require_text "$SMS_SERVICE" 'SMS delivery is not configured on the production server' 'Production mock SMS must fail explicitly'

printf '==> Production provider preflight behavior\n'
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

cat > "$tmp_dir/mock.env" <<'ENV'
NODE_ENV=production
SMS_PROVIDER=mock
ENV
if bash scripts/otp-provider-preflight.sh "$tmp_dir/mock.env" >/dev/null 2>&1; then
  fail 'Production SMS_PROVIDER=mock must be rejected'
fi

cat > "$tmp_dir/twofactor.env" <<'ENV'
NODE_ENV=production
SMS_PROVIDER=twofactor
TWOFACTOR_API_KEY=ci-placeholder
TWOFACTOR_TEMPLATE_NAME=LOGIN_OTP
ENV
bash scripts/otp-provider-preflight.sh "$tmp_dir/twofactor.env" >/dev/null

cat > "$tmp_dir/kaleyra.env" <<'ENV'
NODE_ENV=production
SMS_PROVIDER=kaleyra
KALEYRA_API_KEY=ci-placeholder
KALEYRA_SID=VSETU
ENV
bash scripts/otp-provider-preflight.sh "$tmp_dir/kaleyra.env" >/dev/null

printf '==> Production smoke must not send a real OTP\n'
require_text "$STUDENT_PROD_SMOKE" 'ALLOW_MOCK_AUTH_SMOKE="${ALLOW_MOCK_AUTH_SMOKE:-0}"' 'Authenticated mock smoke must be explicit opt-in'
require_text "$STUDENT_PROD_SMOKE" 'if [[ "$ALLOW_MOCK_AUTH_SMOKE" == "1" ]]' 'OTP send must be guarded by the explicit mock-auth flag'
require_text "$STUDENT_PROD_SMOKE" 'production/read-only smoke must never send a real SMS' 'Production smoke must document its no-SMS behavior'

printf '==> Communities naming/public route contract\n'
require_text "$TOPBAR" "['Communities', '/communities']" 'Primary public navigation must use Communities'
require_text "$HOME" "href: '/communities'" 'Homepage Communities slide must use canonical route'
require_text "$HOME" 'Education Communities' 'Homepage must explain Education Communities'
[[ -s frontend/src/app/communities/page.tsx ]] || fail 'Canonical /communities page is missing'
require_text frontend/src/app/groups-info/page.tsx "export { default } from '../communities/page';" 'Legacy /groups-info must remain a compatibility page'

printf '\nOTP and Communities contract smoke passed.\n'
