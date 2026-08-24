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
ASSET='frontend/public/images/vidyasetu-hero-sprite.jpg'

for file in "$HOME" "$HOME_ROUTE" "$HERO" "$MODULE" "$LEARN" "$LOGIN" "$COMPETITION" "$ASSET" frontend/src/components/public/imageHero.module.css frontend/src/components/public/publicHomeVisual.module.css frontend/src/components/public/publicModuleVisual.module.css; do
  [[ -s "$file" ]] || fail "Required visual-storytelling file is missing: $file"
done

printf '==> Homepage visual story\n'
require_text "$HOME_ROUTE" 'PublicHomeVisualExperience' 'Home route must use the approved image-led public experience'
require_text "$HOME" 'title="Welcome to VidyaSetu"' 'Homepage must use the approved concise welcome headline'
require_text "$HOME" 'India’s unified education platform for learning, schools and families.' 'Homepage must use the approved unified-platform supporting line'
require_text "$HOME" "const HERO_SPRITE = '/images/vidyasetu-hero-sprite.jpg';" 'Homepage must use the repo-owned approved hero artwork'
require_text "$HOME" 'ONE PLATFORM · MANY CONNECTIONS' 'Homepage must expose the compact module navigation'
require_text "$HOME" 'getPublicLearningResources({ featured: true, limit: 3 })' 'Homepage must preserve real Learning discovery'
require_text "$HOME" 'getPublicSchools()' 'Homepage must preserve real school discovery'
require_text "$HOME" 'getPublicCompetitions()' 'Homepage must preserve real competition discovery'
reject_text "$HOME_ROUTE" 'PublicHomeExperience' 'Home route must not render the old carousel experience'

printf '==> Public module visual stories\n'
require_text "$MODULE" "title: 'Every student’s learning day, in one place'" 'Students must have the approved student-focused hero copy'
require_text "$MODULE" "title: 'Stay connected to every step of their journey'" 'Parents must have the approved parent-focused hero copy'
require_text "$MODULE" "title: 'A stronger school starts with a clearer view'" 'Schools must have the approved school-focused hero copy'
require_text "$MODULE" "title: 'Education gets stronger when people connect'" 'Communities must have the approved community-focused hero copy'
require_text "$MODULE" "title: 'See the network. Guide the system.'" 'Platform Admin must have the approved admin-focused hero copy'
require_text "$MODULE" "const HERO_SPRITE = '/images/vidyasetu-hero-sprite.jpg';" 'Public modules must use the repo-owned approved hero artwork'
require_text "$MODULE" 'config.capabilities.slice(0, 6)' 'Module pages must use a compact six-card highlight set'
require_text "$MODULE" 'capabilityHref(config, capability)' 'Module highlight cards must keep functional destinations'
require_text "$MODULE" 'id="module-capabilities"' 'Full module capabilities must remain available below the visual intro'
require_text "$MODULE" 'config.schoolDirectory' 'School directory behavior must remain intact'

printf '==> Learning visual story and bounded catalogue\n'
require_text "$LEARN" 'Learning that fits into real life.' 'Learning must use the approved page-specific image-led headline'
require_text "$LEARN" 'Explore lessons, practice, reading and skills that help learners keep moving forward.' 'Learning must retain the approved supporting line'
require_text "$LEARN" "image=\"/images/vidyasetu-hero-sprite.jpg\"" 'Learning must use the repo-owned approved hero artwork'
require_text "$LEARN" 'INITIAL_RESOURCE_LIMIT = 6' 'Learning must initially load six resources'
require_text "$LEARN" 'MAX_HOME_RESOURCE_LIMIT = 24' 'Learning landing page must remain bounded'
require_text "$LEARN" 'Load 6 more' 'Learning must retain incremental loading'
require_text "$LEARN" 'View all learning' 'Learning must retain dedicated full catalogue navigation'
reject_text "$LEARN" 'Built around how students actually learn.' 'Old split-screen Learning journey hero must not return'
reject_text "$LEARN" 'heroJourney' 'Old right-side Learning hero panel must not render'

printf '==> Competition and Student Login visuals\n'
require_text "$COMPETITION" 'Give talent somewhere to go.' 'Competition page must use the approved student-focused photographic hero'
require_text "$COMPETITION" 'Discover opportunities that help students participate, perform and grow beyond everyday classwork.' 'Competition must retain the approved supporting line'
require_text "$COMPETITION" "image=\"/images/vidyasetu-hero-sprite.jpg\"" 'Competition must use the repo-owned approved hero artwork'
require_text "$COMPETITION" 'listCompetitions()' 'Competition data flow must remain intact'
require_text "$COMPETITION" 'registerExam(examId)' 'Competition registration must remain intact'
require_text "$LOGIN" 'Welcome back to your learning space' 'Student Login must use its unique learning-space message'
require_text "$LOGIN" "url('/images/vidyasetu-hero-sprite.jpg')" 'Student Login must use the repo-owned approved student photograph'
require_text "$LOGIN" "const [method, setMethod] = useState<'password' | 'otp'>('password')" 'Password login must remain the default method'
require_text "$LOGIN" 'Username / Email / Mobile / Student ID' 'Student password login must retain all supported identifiers'
require_text "$LOGIN" 'loginWithPassword(identifier.trim(), password' 'Password login handler must remain connected'
require_text "$LOGIN" 'sendOTP(mobile, role)' 'OTP login handler must remain connected'
require_text "$LOGIN" 'forgotPassword(identifier.trim())' 'Password recovery handler must remain connected'

printf '\nPublic visual storytelling contract smoke passed.\n'
