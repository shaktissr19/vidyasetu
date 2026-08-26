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
SUBJECT_CSS='frontend/src/components/public/subjectVisual.module.css'
LEARN='frontend/src/components/public/PublicLearningLibrary.tsx'
CATALOGUE='frontend/src/components/public/PublicLearningCatalogue.tsx'
LOGIN='frontend/src/app/(auth)/login/page.tsx'
COMPETITION='frontend/src/app/competition/page.tsx'

SOURCE_FILES=("$HOME" "$HOME_IMPL" "$HOME_SAMPLE_CSS" "$HOME_ROUTE" "$HERO" "$HERO_CSS" "$HERO_ASSETS" "$MODULE" "$MODULE_CSS" "$SUBJECT" "$SUBJECT_CSS" "$LEARN" "$CATALOGUE" "$LOGIN" "$COMPETITION")
for file in "${SOURCE_FILES[@]}"; do [[ -s "$file" ]] || fail "Required public visual file is missing: $file"; done

printf '==> Local image architecture\n'
reject_text "$HERO_ASSETS" 'images.pexels.com' 'Public imagery must not depend on Pexels at runtime'
reject_text "$HERO_ASSETS" 'pexels(' 'Public imagery must use approved repo-owned PNG files'
for mapping in \
  "home: '/images/heroes/home-hero.png'" \
  "student: '/images/heroes/students-hero.png'" \
  "school: '/images/heroes/schools-hero.png'" \
  "parent: '/images/heroes/parents-hero.png'" \
  "learn: '/images/heroes/learn-hero.png'" \
  "competition: '/images/heroes/competition-hero.png'" \
  "communities: '/images/heroes/communities-hero.png'" \
  "admin: '/images/heroes/platform-admin-hero.png'"
do
  require_text "$HERO_ASSETS" "$mapping" "Missing approved local hero mapping: $mapping"
done
for mapping in \
  "student: '/images/home-cards/home-students.png'" \
  "school: '/images/home-cards/home-schools.png'" \
  "parent: '/images/home-cards/home-parents.png'" \
  "learn: '/images/home-cards/home-learning.png'" \
  "competition: '/images/home-cards/home-competitions.png'" \
  "communities: '/images/home-cards/home-communities.png'"
do
  require_text "$HERO_ASSETS" "$mapping" "Missing unique Home card image mapping: $mapping"
done

printf '==> Unified compact inner heroes\n'
require_text "$HERO" "import Image from 'next/image'" 'Shared hero must use Next Image'
require_text "$HERO" "fetchPriority={priority ? 'high' : 'auto'}" 'Above-the-fold hero must request high fetch priority'
require_text "$HERO" 'quality={88}' 'Local hero must use optimized quality delivery'
reject_text "$HERO" 'unoptimized' 'Local hero must not bypass Next image optimization'
require_text "$HERO_CSS" '.homeHero { min-height: 440px; }' 'Shared Home hero height must remain sample-proportioned'
require_text "$HERO_CSS" '.compactHero { min-height: 380px; }' 'Inner public heroes must remain shorter than the rejected version'
require_text "$HERO_CSS" 'inset: 0;' 'Inner hero photograph must remain one full-bleed scene'
reject_text "$HERO_CSS" 'left: 42%;' 'Hero must not return to a separate right-side photo pane'

printf '==> Exact approved Home opening\n'
require_text "$HOME_ROUTE" 'PublicHomeVisualExperience' 'Home route must use the public visual experience'
require_text "$HOME" "export { default } from './PublicHomeSampleExperience'" 'Home must use the approved sample implementation'
require_text "$HOME_IMPL" 'One platform for learning,' 'Approved sample Home headline is missing'
require_text "$HOME_IMPL" 'schools and families.' 'Approved sample Home headline second line is missing'
require_text "$HOME_IMPL" 'Learn Better' 'Approved Learn Better benefit is missing'
require_text "$HOME_IMPL" 'Run Schools Better' 'Approved Run Schools Better benefit is missing'
require_text "$HOME_IMPL" 'Stay Connected' 'Approved Stay Connected benefit is missing'
require_text "$HOME_IMPL" 'Who is VidyaSetu for?' 'Approved audience heading is missing'
require_text "$HOME_IMPL" 'Built for everyone in the education ecosystem' 'Approved audience subheading is missing'
require_text "$HOME_IMPL" '10,000+' 'Approved stats strip is missing learning-resource metric'
require_text "$HOME_IMPL" '1M+' 'Approved stats strip is missing student metric'
require_text "$HOME_IMPL" '15K+' 'Approved stats strip is missing school metric'
require_text "$HOME_IMPL" '50+' 'Approved stats strip is missing competition metric'
require_text "$HOME_IMPL" 'src={HERO_IMAGES.home}' 'Home must use approved local hero mapping'
require_text "$HOME_IMPL" '<Image src={module.image}' 'Home role cards must render their own local image'
for key in student school parent learn competition communities; do
  require_text "$HOME_IMPL" "MODULE_IMAGES.$key" "Home role-card mapping missing: $key"
done
require_text "$HOME_SAMPLE_CSS" 'height: 440px;' 'Approved Home hero must remain 440px on desktop'
require_text "$HOME_SAMPLE_CSS" 'grid-template-columns: repeat(6, minmax(0, 1fr));' 'Home must show six role cards in one desktop row'
require_text "$HOME_SAMPLE_CSS" 'aspect-ratio: 190 / 130;' 'Home role-card media proportions must match the approved sample'
require_text "$HOME_SAMPLE_CSS" 'grid-template-columns: repeat(4, minmax(0, 1fr));' 'Home stats strip must remain four across'
reject_text "$HOME_SAMPLE_CSS" 'home-sprite.webp' 'Home must not use a repeated sprite image'
require_text "$HOME_IMPL" 'getPublicLearningResources({ featured: true, limit: 3 })' 'Home must preserve 3-resource public Learning preview'
require_text "$HOME_IMPL" 'getPublicSchools()' 'Home school discovery must remain API-backed'
require_text "$HOME_IMPL" 'getPublicCompetitions()' 'Home competition discovery must remain API-backed'
require_text "$HOME_IMPL" '<SubjectVisual input={resource} compact />' 'Home Learning fallback must remain subject-aware'

printf '==> Module pages\n'
require_text "$MODULE" 'variant="compact"' 'Role pages must use compact heroes'
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

printf '==> Learning and subject visuals\n'
require_text "$SUBJECT" "export type LearningGradeBand = 'primary' | 'middle' | 'secondary'" 'Learning must retain three grade bands'
for subject in math science english hindi social computer evs commerce; do
  require_text "$SUBJECT" "$subject:" "Subject visual missing: $subject"
done
require_text "$LEARN" 'Learning that fits into real life.' 'Learning approved headline must remain'
require_text "$LEARN" 'image={HERO_IMAGES.learn}' 'Learning must use its dedicated local hero'
require_text "$LEARN" 'INITIAL_RESOURCE_LIMIT = 6' 'Learning must initially load 6'
require_text "$LEARN" 'MAX_HOME_RESOURCE_LIMIT = 24' 'Learning landing must remain bounded'
require_text "$LEARN" 'Load 6 more' 'Learning must preserve Load 6 more'
require_text "$LEARN" 'View all learning' 'Learning must preserve full catalogue navigation'
require_text "$LEARN" 'getPublicLearningResources' 'Learning resources must remain API-backed'
require_text "$LEARN" 'getPublicLearningAssessments' 'Learning practice must remain API-backed'
require_text "$LEARN" '<SubjectVisual input={resource} selectedGrade={selectedGrade}' 'Learning fallback visuals must stay grade-aware'
require_text "$CATALOGUE" '<SubjectVisual input={resource} selectedGrade={grade}' 'Catalogue fallback visuals must stay grade-aware'

printf '==> Competition and authentication preservation\n'
require_text "$COMPETITION" 'variant="compact"' 'Competition hero must stay compact'
require_text "$COMPETITION" 'Give talent somewhere to go.' 'Competition approved headline must remain'
require_text "$COMPETITION" 'image={HERO_IMAGES.competition}' 'Competition must use its dedicated local hero'
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

printf '\nApproved production public visual and behavior contract smoke passed.\n'
