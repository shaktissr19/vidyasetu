#!/usr/bin/env bash
set -Eeuo pipefail

fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }
require_text() { grep -Fq -- "$2" "$1" || fail "$3 ($1)"; }
reject_text() { ! grep -Fq -- "$2" "$1" || fail "$3 ($1)"; }

HOME='frontend/src/components/public/PublicHomeVisualExperience.tsx'
HOME_IMPL='frontend/src/components/public/PublicHomeSampleExperience.tsx'
HOME_SAMPLE_CSS='frontend/src/components/public/homeSample.module.css'
HOME_ROUTE='frontend/src/app/page.tsx'
HERO='frontend/src/components/public/ImageHero.tsx'
HERO_CSS='frontend/src/components/public/imageHero.module.css'
HERO_ASSETS='frontend/src/components/public/heroAssets.ts'
MODULE='frontend/src/components/public/PublicModulePage.tsx'
MODULE_CSS='frontend/src/components/public/publicModuleVisual.module.css'
SUBJECT='frontend/src/components/public/SubjectVisual.tsx'
LEARN='frontend/src/components/public/PublicLearningLibrary.tsx'
CATALOGUE='frontend/src/components/public/PublicLearningCatalogue.tsx'
LOGIN='frontend/src/app/(auth)/login/page.tsx'
COMPETITION='frontend/src/app/competition/page.tsx'

SOURCE_FILES=("$HOME" "$HOME_IMPL" "$HOME_SAMPLE_CSS" "$HOME_ROUTE" "$HERO" "$HERO_CSS" "$HERO_ASSETS" "$MODULE" "$MODULE_CSS" "$SUBJECT" "$LEARN" "$CATALOGUE" "$LOGIN" "$COMPETITION")
for file in "${SOURCE_FILES[@]}"; do [[ -s "$file" ]] || fail "Required public visual file is missing: $file"; done

printf '==> Partial production PNG preview architecture\n'
for mapping in \
  "home: '/images/heroes/home-hero.png'" \
  "student: '/images/heroes/students-hero.png'" \
  "school: '/images/heroes/schools-hero.png'" \
  "learn: '/images/heroes/learn-hero.png'" \
  "parent: '/images/home-cards/home-parents.png'"
do
  require_text "$HERO_ASSETS" "$mapping" "Missing supplied local production PNG mapping: $mapping"
done
require_text "$HERO_ASSETS" 'previewFallback' 'Unfinished preview surfaces must retain a non-breaking fallback'
require_text "$HERO_ASSETS" 'Remove previewFallback once the complete production PNG set is present.' 'Preview fallback must be explicitly temporary'

printf '==> Compact hero and approved Home proportions\n'
require_text "$HERO" "import Image from 'next/image'" 'Shared hero must use Next Image'
require_text "$HERO" "fetchPriority={priority ? 'high' : 'auto'}" 'Above-the-fold hero must request high fetch priority'
require_text "$HERO" 'quality={88}' 'Local hero must use optimized delivery'
reject_text "$HERO" 'unoptimized' 'Local hero must not bypass Next image optimization'
require_text "$HERO_CSS" '.homeHero { min-height: 440px; }' 'Home hero must remain sample-proportioned'
require_text "$HERO_CSS" '.compactHero { min-height: 380px; }' 'Inner heroes must remain compact'
require_text "$HERO_CSS" 'inset: 0;' 'Hero must remain one full-bleed scene'
reject_text "$HERO_CSS" 'left: 42%;' 'Hero must not return to a separate right-side pane'

printf '==> Approved Home opening\n'
require_text "$HOME_ROUTE" 'PublicHomeVisualExperience' 'Home route must use public visual experience'
require_text "$HOME" "export { default } from './PublicHomeSampleExperience'" 'Home must use approved opening implementation'
for copy in \
  'One platform for learning,' \
  'schools and families.' \
  'Learn Better' \
  'Run Schools Better' \
  'Stay Connected' \
  'Who is VidyaSetu for?' \
  'Built for everyone in the education ecosystem'
do
  require_text "$HOME_IMPL" "$copy" "Approved Home content missing: $copy"
done
require_text "$HOME_IMPL" 'src={HERO_IMAGES.home}' 'Home must use production hero mapping'
require_text "$HOME_IMPL" '<Image src={module.image}' 'Home cards must render mapped photography'
require_text "$HOME_SAMPLE_CSS" 'height: 440px;' 'Home hero must remain 440px desktop'
require_text "$HOME_SAMPLE_CSS" 'grid-template-columns: repeat(6, minmax(0, 1fr));' 'Home must show six compact cards across'
require_text "$HOME_SAMPLE_CSS" 'aspect-ratio: 190 / 130;' 'Home card media ratio must remain approved'
require_text "$HOME_SAMPLE_CSS" 'grid-template-columns: repeat(4, minmax(0, 1fr));' 'Home stats strip must remain four across'
require_text "$HOME_IMPL" 'getPublicLearningResources({ featured: true, limit: 3 })' 'Home Learning preview must remain API-backed'
require_text "$HOME_IMPL" 'getPublicSchools()' 'Home school discovery must remain API-backed'
require_text "$HOME_IMPL" 'getPublicCompetitions()' 'Home competition discovery must remain API-backed'

printf '==> Module pages and Learning preservation\n'
require_text "$MODULE" 'variant="compact"' 'Role pages must use compact heroes'
require_text "$MODULE" 'config.capabilities.slice(0, 6)' 'Role pages must retain six highlights'
require_text "$MODULE" 'capabilityHref(config, capability)' 'Role highlights must remain functional'
require_text "$MODULE" 'config.schoolDirectory' 'School directory behavior must remain intact'
require_text "$SUBJECT" "export type LearningGradeBand = 'primary' | 'middle' | 'secondary'" 'Learning must retain three grade bands'
for subject in math science english hindi social computer evs commerce; do
  require_text "$SUBJECT" "$subject:" "Subject visual missing: $subject"
done
require_text "$LEARN" 'Learning that fits into real life.' 'Learning headline must remain'
require_text "$LEARN" 'image={HERO_IMAGES.learn}' 'Learning must use mapped hero'
require_text "$LEARN" 'INITIAL_RESOURCE_LIMIT = 6' 'Learning must initially load 6'
require_text "$LEARN" 'MAX_HOME_RESOURCE_LIMIT = 24' 'Learning landing must remain bounded'
require_text "$LEARN" 'Load 6 more' 'Learning must preserve load-more behavior'
require_text "$LEARN" 'View all learning' 'Learning must preserve catalogue navigation'
require_text "$LEARN" 'getPublicLearningResources' 'Learning resources must remain API-backed'
require_text "$LEARN" 'getPublicLearningAssessments' 'Learning practice must remain API-backed'
require_text "$CATALOGUE" '<SubjectVisual input={resource} selectedGrade={grade}' 'Catalogue fallback must stay grade-aware'

printf '==> Competition and auth preservation\n'
require_text "$COMPETITION" 'listCompetitions()' 'Competition listing must remain intact'
require_text "$COMPETITION" 'registerExam(examId)' 'Competition registration must remain intact'
require_text "$COMPETITION" 'getLeaderboard(activeLbExamId)' 'Competition leaderboard must remain intact'
require_text "$COMPETITION" 'router.push(`/exams/${exam.id}`)' 'Competition attempt navigation must remain intact'
require_text "$LOGIN" "const [method, setMethod] = useState<'password' | 'otp'>('password')" 'Password login must remain default'
require_text "$LOGIN" 'Username / Email / Mobile / Student ID' 'Student identifiers must remain intact'
require_text "$LOGIN" 'loginWithPassword(identifier.trim(), password' 'Password login handler must remain intact'
require_text "$LOGIN" 'sendOTP(mobile, role)' 'OTP send must remain intact'
require_text "$LOGIN" 'verifyOTP(verificationMobile, otp' 'OTP verification must remain intact'
require_text "$LOGIN" 'forgotPassword(identifier.trim())' 'Password recovery must remain intact'
require_text "$LOGIN" 'resetPassword(identifier.trim(), recoveryOtp, newPassword)' 'Password reset must remain intact'
require_text "$LOGIN" 'router.replace(ROLE_DASHBOARDS[user.role]' 'Role redirects must remain intact'

printf '\nPartial production visual preview contract smoke passed.\n'
