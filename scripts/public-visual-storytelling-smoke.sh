#!/usr/bin/env bash
set -Eeuo pipefail

fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }
require_text() { grep -Fq -- "$2" "$1" || fail "$3 ($1)"; }
reject_text() { ! grep -Fq -- "$2" "$1" || fail "$3 ($1)"; }

HOME='frontend/src/components/public/PublicHomeVisualExperience.tsx'
HOME_ROUTE='frontend/src/app/page.tsx'
HERO='frontend/src/components/public/ImageHero.tsx'
MODULE='frontend/src/components/public/PublicModulePage.tsx'
LEARN='frontend/src/components/public/PublicLearningLibrary.tsx'
LOGIN='frontend/src/app/(auth)/login/page.tsx'
COMPETITION='frontend/src/app/competition/page.tsx'

for file in "$HOME" "$HOME_ROUTE" "$HERO" "$MODULE" "$LEARN" "$LOGIN" "$COMPETITION" frontend/src/components/public/imageHero.module.css frontend/src/components/public/publicHomeVisual.module.css frontend/src/components/public/publicModuleVisual.module.css; do
  [[ -s "$file" ]] || fail "Required visual-storytelling file is missing: $file"
done

printf '==> Homepage visual story\n'
require_text "$HOME_ROUTE" 'PublicHomeVisualExperience' 'Home route must use the approved image-led public experience'
require_text "$HOME" 'Welcome to VidyaSetu — India’s Unified Education Platform' 'Homepage must use the approved concise welcome headline'
require_text "$HOME" 'ONE PLATFORM · MANY CONNECTIONS' 'Homepage must expose the compact module navigation'
require_text "$HOME" 'getPublicLearningResources({ featured: true, limit: 3 })' 'Homepage must preserve real Learning discovery'
require_text "$HOME" 'getPublicSchools()' 'Homepage must preserve real school discovery'
require_text "$HOME" 'getPublicCompetitions()' 'Homepage must preserve real competition discovery'
reject_text "$HOME_ROUTE" 'PublicHomeExperience' 'Home route must not render the old carousel experience'

printf '==> Public module visual stories\n'
require_text "$MODULE" "title: 'Every student’s learning day, in one connected place'" 'Students must have unique student-focused hero copy'
require_text "$MODULE" "title: 'Stay close to your child’s school journey'" 'Parents must have unique parent-focused hero copy'
require_text "$MODULE" "title: 'One connected workspace for modern schools'" 'Schools must have unique school-focused hero copy'
require_text "$MODULE" "title: 'Communities that support every learner'" 'Communities must have unique community-focused hero copy'
require_text "$MODULE" "title: 'Run the education network from one command centre'" 'Platform Admin must have unique admin-focused hero copy'
require_text "$MODULE" 'config.capabilities.slice(0, 6)' 'Module pages must use a compact six-card highlight strip'
require_text "$MODULE" 'id="module-capabilities"' 'Full module capabilities must remain available below the visual intro'
require_text "$MODULE" 'config.schoolDirectory' 'School directory behavior must remain intact'

printf '==> Learning visual story and bounded catalogue\n'
require_text "$LEARN" 'Learn with clarity. Practise with purpose.' 'Learning must use the approved image-led headline'
require_text "$LEARN" 'INITIAL_RESOURCE_LIMIT = 6' 'Learning must initially load six resources'
require_text "$LEARN" 'MAX_HOME_RESOURCE_LIMIT = 24' 'Learning landing page must remain bounded'
require_text "$LEARN" 'View all learning' 'Learning must retain dedicated full catalogue navigation'
reject_text "$LEARN" 'Built around how students actually learn.' 'Old split-screen Learning journey hero must not return'
reject_text "$LEARN" 'heroJourney' 'Old right-side Learning hero panel must not render'

printf '==> Competition and Student Login visuals\n'
require_text "$COMPETITION" 'Opportunities that turn effort into achievement' 'Competition page must use a student-focused photographic hero'
require_text "$COMPETITION" 'listCompetitions()' 'Competition data flow must remain intact'
require_text "$COMPETITION" 'registerExam(examId)' 'Competition registration must remain intact'
require_text "$LOGIN" 'Welcome back to your learning space' 'Student Login must use its unique learning-space message'
require_text "$LOGIN" 'pexels-photo-3231358.jpeg' 'Student Login must have a school learner photograph'
require_text "$LOGIN" "const [method, setMethod] = useState<'password' | 'otp'>('password')" 'Password login must remain the default method'
require_text "$LOGIN" 'Username / Email / Mobile / Student ID' 'Student password login must retain all supported identifiers'
require_text "$LOGIN" 'loginWithPassword(identifier.trim(), password' 'Password login handler must remain connected'
require_text "$LOGIN" 'sendOTP(mobile, role)' 'OTP login handler must remain connected'

printf '\nPublic visual storytelling contract smoke passed.\n'
