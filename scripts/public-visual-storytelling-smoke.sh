#!/usr/bin/env bash
set -Eeuo pipefail

fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }
require_text() { grep -Fq -- "$2" "$1" || fail "$3 ($1)"; }
reject_text() { ! grep -Fq -- "$2" "$1" || fail "$3 ($1)"; }

HOME='frontend/src/components/public/PublicHomeVisualExperience.tsx'
HOME_ROUTE='frontend/src/app/page.tsx'
HERO='frontend/src/components/public/ImageHero.tsx'
HERO_CSS='frontend/src/components/public/imageHero.module.css'
HERO_ASSETS='frontend/src/components/public/heroAssets.ts'
NEXT_CONFIG='frontend/next.config.js'
HOME_CSS='frontend/src/components/public/publicHomeVisual.module.css'
MODULE='frontend/src/components/public/PublicModulePage.tsx'
MODULE_CSS='frontend/src/components/public/publicModuleVisual.module.css'
SUBJECT='frontend/src/components/public/SubjectVisual.tsx'
LEARN='frontend/src/components/public/PublicLearningLibrary.tsx'
CATALOGUE='frontend/src/components/public/PublicLearningCatalogue.tsx'
LOGIN='frontend/src/app/(auth)/login/page.tsx'
COMPETITION='frontend/src/app/competition/page.tsx'

SOURCE_FILES=("$HOME" "$HOME_ROUTE" "$HERO" "$HERO_CSS" "$HERO_ASSETS" "$NEXT_CONFIG" "$HOME_CSS" "$MODULE" "$MODULE_CSS" "$SUBJECT" "$LEARN" "$CATALOGUE" "$LOGIN" "$COMPETITION")
for file in "${SOURCE_FILES[@]}"; do [[ -s "$file" ]] || fail "Required public visual file is missing: $file"; done

if grep -R -Fq -- 'vidyasetu-hero-sprite.jpg' frontend/src; then
  fail 'Public source must not return to the shared hero-sprite architecture'
fi
if grep -R -Eq -- '/images/heroes/(home|students|schools|parents|learning|competitions|communities|platform-admin)\.avif' frontend/src; then
  fail 'The rejected low-resolution local hero AVIFs must not return to active source'
fi

printf '==> Sharp, wide hero architecture\n'
require_text "$HERO" "import Image from 'next/image'" 'Shared hero must use Next Image'
require_text "$HERO" 'quality={90}' 'Shared hero must request high image quality'
require_text "$HERO" '58vw' 'Desktop image sizes must match the dedicated image pane'
reject_text "$HERO" 'sizes="100vw"' 'Desktop hero must not request a full-screen photo anymore'
require_text "$HERO_CSS" 'left: 42%;' 'Desktop photo must own a dedicated right-side pane'
require_text "$HERO_CSS" 'rgba(247,249,252,0) 52%' 'Desktop blend must end around the centre'
reject_text "$HERO_CSS" 'rgba(255,255,255,0) 70%' 'The old 70-percent white wash must never return'
require_text "$HERO_CSS" 'height: 300px;' 'Tablet/mobile hero must separate copy and photo'
require_text "$NEXT_CONFIG" "hostname: 'images.pexels.com'" 'Next Image must allow the high-resolution image host'
require_text "$HERO_ASSETS" 'w=3840' 'Hero sources must request UHD-class width'
for mapping in \
  'home: pexels(4622108)' \
  'student: pexels(18012463)' \
  'school: pexels(35551059)' \
  'parent: pexels(8054840)' \
  'learn: pexels(4308093)' \
  'competition: pexels(6208709)' \
  'communities: pexels(20556421)' \
  'admin: pexels(4308104)'
do
  require_text "$HERO_ASSETS" "$mapping" "Missing dedicated high-resolution hero mapping: $mapping"
done

printf '==> Home visual and API behavior\n'
require_text "$HOME_ROUTE" 'PublicHomeVisualExperience' 'Home route must use the public visual experience'
require_text "$HOME" 'title="Welcome to VidyaSetu"' 'Home approved title must remain'
require_text "$HOME" 'India’s unified education platform for learning, schools and families.' 'Home approved supporting copy must remain'
require_text "$HOME" 'image={HERO_IMAGES.home}' 'Home must use its dedicated hero'
require_text "$HOME" '<Image src={module.image}' 'Home module cards must use full photographic media'
for key in student school parent learn competition communities; do
  require_text "$HOME" "MODULE_IMAGES.$key" "Home module image missing: $key"
done
require_text "$HOME_CSS" 'grid-template-columns: repeat(3, minmax(0, 1fr));' 'Home module cards must remain 3 across'
require_text "$HOME_CSS" 'height: 205px;' 'Home cards must reserve meaningful photo area'
require_text "$HOME" 'getPublicLearningResources({ featured: true, limit: 3 })' 'Home must preserve 3-resource Learning preview'
require_text "$HOME" 'getPublicSchools()' 'Home school discovery must remain API-backed'
require_text "$HOME" 'getPublicCompetitions()' 'Home competition discovery must remain API-backed'
require_text "$HOME" '<SubjectVisual input={resource} compact />' 'Home Learning fallback must remain subject-aware'

printf '==> Module pages\n'
for title in \
  "Every student’s learning day, in one place" \
  "Stay connected to every step of their journey" \
  "A stronger school starts with a clearer view" \
  "Education gets stronger when people connect" \
  "See the network. Guide the system."
do
  require_text "$MODULE" "$title" "Approved module hero copy missing: $title"
done
for key in student parent school communities admin; do
  require_text "$MODULE" "HERO_IMAGES.$key" "Module hero mapping missing: $key"
done
require_text "$MODULE" 'config.capabilities.slice(0, 6)' 'Module pages must preserve six compact highlights'
require_text "$MODULE" 'capabilityHref(config, capability)' 'Module highlights must remain functional'
require_text "$MODULE" 'config.schoolDirectory' 'School directory behavior must remain intact'
require_text "$MODULE_CSS" 'grid-template-columns: repeat(3, minmax(0, 1fr));' 'Module highlight cards must remain 3 across'

printf '==> Learning visual system and bounded catalogue\n'
require_text "$SUBJECT" "export type LearningGradeBand = 'primary' | 'middle' | 'secondary'" 'Learning must retain three grade bands'
for subject in math science english hindi social computer evs commerce; do
  require_text "$SUBJECT" "$subject:" "Subject visual missing: $subject"
done
require_text "$SUBJECT" "band === 'primary' ? 'Classes 1–4'" 'Primary subject visual band must remain'
require_text "$SUBJECT" "band === 'middle' ? 'Classes 5–8'" 'Middle subject visual band must remain'
require_text "$SUBJECT" "'Classes 9–12'" 'Secondary subject visual band must remain'
require_text "$LEARN" 'Learning that fits into real life.' 'Learning approved headline must remain'
require_text "$LEARN" 'image={HERO_IMAGES.learn}' 'Learning must use its dedicated hero'
require_text "$LEARN" 'INITIAL_RESOURCE_LIMIT = 6' 'Learning must initially load 6'
require_text "$LEARN" 'MAX_HOME_RESOURCE_LIMIT = 24' 'Learning landing must remain bounded'
require_text "$LEARN" 'Load 6 more' 'Learning must preserve Load 6 more'
require_text "$LEARN" 'View all learning' 'Learning must preserve full catalogue navigation'
require_text "$LEARN" 'getPublicLearningResources' 'Learning resources must remain API-backed'
require_text "$LEARN" 'getPublicLearningAssessments' 'Learning practice must remain API-backed'
require_text "$LEARN" '<SubjectVisual input={resource} selectedGrade={selectedGrade}' 'Learning fallback visuals must stay grade-aware'
require_text "$CATALOGUE" '<SubjectVisual input={resource} selectedGrade={grade}' 'Catalogue fallback visuals must stay grade-aware'

printf '==> Competition and authentication preservation\n'
require_text "$COMPETITION" 'Give talent somewhere to go.' 'Competition approved headline must remain'
require_text "$COMPETITION" 'image={HERO_IMAGES.competition}' 'Competition must use its dedicated hero'
require_text "$COMPETITION" 'listCompetitions()' 'Competition listing must remain intact'
require_text "$COMPETITION" 'registerExam(examId)' 'Competition registration must remain intact'
require_text "$COMPETITION" 'getLeaderboard(activeLbExamId)' 'Competition leaderboard must remain intact'
require_text "$COMPETITION" 'router.push(`/exams/${exam.id}`)' 'Competition attempt navigation must remain intact'
require_text "$LOGIN" 'Welcome back to your learning space' 'Student Login approved message must remain'
require_text "$LOGIN" 'continue where you left off' 'Student Login continuation message must remain'
for key in student parent school admin; do
  require_text "$LOGIN" "HERO_IMAGES.$key" "Role login visual missing: $key"
done
require_text "$LOGIN" "const [method, setMethod] = useState<'password' | 'otp'>('password')" 'Password login must remain default'
require_text "$LOGIN" 'Username / Email / Mobile / Student ID' 'Student identifiers must remain intact'
require_text "$LOGIN" 'loginWithPassword(identifier.trim(), password' 'Password login handler must remain intact'
require_text "$LOGIN" 'sendOTP(mobile, role)' 'OTP send handler must remain intact'
require_text "$LOGIN" 'verifyOTP(verificationMobile, otp' 'OTP verification must remain intact'
require_text "$LOGIN" 'forgotPassword(identifier.trim())' 'Password recovery must remain intact'
require_text "$LOGIN" 'resetPassword(identifier.trim(), recoveryOtp, newPassword)' 'Password reset must remain intact'
require_text "$LOGIN" 'if (user.role !== role)' 'Role validation must remain intact'
require_text "$LOGIN" 'router.replace(ROLE_DASHBOARDS[user.role]' 'Role-aware redirects must remain intact'

printf '\nPublic visual quality and behavior contract smoke passed.\n'
