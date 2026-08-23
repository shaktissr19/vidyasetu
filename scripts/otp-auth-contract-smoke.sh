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
RATE_LIMIT='backend/src/middleware/rateLimit.middleware.ts'
ERROR_HANDLER='backend/src/middleware/error.middleware.ts'
TOPBAR='frontend/src/components/layout/GlobalTopbar.tsx'
NAVBAR='frontend/src/components/layout/Navbar.tsx'
HOME='frontend/src/components/public/PublicHomeExperience.tsx'
STUDENT_PROD_SMOKE='scripts/student-production-smoke.sh'
IDENTITY_MIGRATION='database/migrations/015_realistic_demo_identities.sql'
PROVISION_SCRIPT='scripts/provision-production-demo-logins.sh'
AUDIT_SCRIPT='scripts/production-auth-data-audit.sh'

for file in "$LOGIN" "$AUTH_SERVICE" "$AUTH_ROUTES" "$AUTH_CONTROLLER" "$SMS_SERVICE" "$RATE_LIMIT" "$ERROR_HANDLER" "$TOPBAR" "$NAVBAR" "$HOME" "$STUDENT_PROD_SMOKE" "$IDENTITY_MIGRATION" "$PROVISION_SCRIPT" "$AUDIT_SCRIPT" scripts/otp-provider-preflight.sh; do
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
require_text "$LOGIN" "role === 'SUPER_ADMIN' ? 'Platform Admin' : role.replaceAll('_', ' ').toLowerCase()" 'OTP helper must derive the selected role instead of always showing Platform Admin'

printf '==> OTP rate-limit failure recovery contract\n'
require_text "$RATE_LIMIT" 'windowMs: 10 * 60 * 1000' 'OTP send window must be ten minutes, not one hour'
require_text "$RATE_LIMIT" 'max: 5' 'OTP send limit must permit five successful sends per window'
require_text "$RATE_LIMIT" 'skipFailedRequests: true' 'Failed SMS/provider requests must not consume OTP send quota'
require_text "$RATE_LIMIT" 'Too many OTP requests. Try again in 10 minutes.' 'OTP rate-limit message must match the new window'
require_text "$ERROR_HANDLER" 'OTP SMS service is temporarily unavailable. Please try again shortly or use password login.' 'Production SMS failures must return an actionable safe message'
require_text "$ERROR_HANDLER" "status === 503 ? 'SERVICE_UNAVAILABLE'" 'HTTP 503 must expose a stable service-unavailable API code'

printf '==> SMS provider contract\n'
require_text "$SMS_SERVICE" 'https://api.in.kaleyra.io/v1/' 'Kaleyra integration must use the current India SMS API domain'
require_text "$SMS_SERVICE" 'KALEYRA_ACCOUNT_SID' 'Kaleyra integration must use the account SID'
require_text "$SMS_SERVICE" "'api-key': apiKey" 'Kaleyra integration must use the api-key header'
require_text "$SMS_SERVICE" 'KALEYRA_SENDER_ID' 'Kaleyra integration must use an approved sender ID'
require_text "$SMS_SERVICE" "template_id: templateId" 'Kaleyra integration must send the approved DLT template ID'
require_text "$SMS_SERVICE" "entity_id: entityId" 'Kaleyra integration must send the DLT entity ID'
require_text "$SMS_SERVICE" "'https://2factor.in/API/V1'" '2Factor integration must use its manual OTP API base'
require_text "$SMS_SERVICE" "encodeURIComponent(otp)" '2Factor integration must send the VidyaSetu-generated OTP'
require_text "$SMS_SERVICE" "process.env.NODE_ENV === 'production'" 'Production SMS path must distinguish production mode'
require_text "$SMS_SERVICE" 'SMS delivery is not configured on the production server' 'Production mock SMS must fail explicitly'

printf '==> Human-friendly login and language contract\n'
require_text "$IDENTITY_MIGRATION" 'Human-friendly legacy usernames' 'Legacy UUID-style login names must be replaced'
require_text "$IDENTITY_MIGRATION" 'vidyasetu.admin@demo.vidyasetu.sbs' 'Canonical Platform Admin demo identity must remain defined'
require_text "$TOPBAR" "{lang === 'hi' ? 'EN' : 'हिंदी'}" 'Public navbar language switch must display हिंदी, not English Hindi'
require_text "$NAVBAR" "{lang === 'hi' ? 'EN' : 'हिंदी'}" 'Authenticated navbar language switch must display हिंदी consistently'
bash -n "$PROVISION_SCRIPT"
bash -n "$AUDIT_SCRIPT"
require_text "$PROVISION_SCRIPT" 'password_hash' 'Demo login provisioning must configure password hashes'
require_text "$PROVISION_SCRIPT" 'Internal UUIDs are intentionally not used as login IDs.' 'Demo credential output must use human-friendly login IDs'
require_text "$PROVISION_SCRIPT" '9000000000' 'Platform Admin demo account must be included in password provisioning'
require_text "$PROVISION_SCRIPT" '9100000001' 'School Admin demo account must be included in password provisioning'
require_text "$PROVISION_SCRIPT" '9200000001' 'Teacher demo account must be included in password provisioning'
require_text "$PROVISION_SCRIPT" '9300000001' 'Student demo account must be included in password provisioning'
require_text "$PROVISION_SCRIPT" '9400000001' 'Parent demo account must be included in password provisioning'

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
KALEYRA_ACCOUNT_SID=HXCI_PLACEHOLDER_IN
KALEYRA_SENDER_ID=VSETU
KALEYRA_ENTITY_ID=1200000000000000000
KALEYRA_TEMPLATE_ID=1207000000000000000
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

printf '\nOTP, demo login and Communities contract smoke passed.\n'