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
LAYOUT='frontend/src/app/layout.tsx'
HOME_CSS='frontend/src/components/public/publicHomeVisual.module.css'
MODULE='frontend/src/components/public/PublicModulePage.tsx'
MODULE_CSS='frontend/src/components/public/publicModuleVisual.module.css'
SUBJECT='frontend/src/components/public/SubjectVisual.tsx'
SUBJECT_CSS='frontend/src/components/public/subjectVisual.module.css'
LEARN='frontend/src/components/public/PublicLearningLibrary.tsx'
CATALOGUE='frontend/src/components/public/PublicLearningCatalogue.tsx'
LOGIN='frontend/src/app/(auth)/login/page.tsx'
COMPETITION='frontend/src/app/competition/page.tsx'

SOURCE_FILES=("$HOME" "$HOME_ROUTE" "$HERO" "$HERO_CSS" "$HERO_ASSETS" "$NEXT_CONFIG" "$LAYOUT" "$HOME_CSS" "$MODULE" "$MODULE_CSS" "$SUBJECT" "$SUBJECT_CSS" "$LEARN" "$CATALOGUE" "$LOGIN" "$COMPETITION")
for file in "${SOURCE_FILES[@]}"; do [[ -s "$file" ]] || fail "Required public visual file is missing: $file"; done

if grep -R -Fq -- 'vidyasetu-hero-sprite.jpg' frontend/src; then
  fail 'Public source must not return to the shared hero-sprite architecture'
fi
if grep -R -Eq -- '/images/heroes/(home|students|schools|parents|learning|competitions|communities|platform-admin)\.avif' frontend/src; then
  fail 'The rejected low-resolution local hero AVIFs must not return to active source'
fi

printf '==> Unified, shorter hero architecture\n'
require_text "$HERO" "import Image from 'next/image'" 'Shared hero must use Next Image'
require_text "$HERO" "variant?: 'home' | 'compact'" 'Shared hero must distinguish Home and compact inner heights'
require_text "$HERO" 'unoptimized' 'Remote hero must bypass first-navigation server image optimisation'
require_text "$HERO" "fetchPriority={priority ? 'high' : 'auto'}" 'Above-the-fold hero must request high fetch priority'
require_text "$HERO" 'sizes="100vw"' 'Unified hero image must cover the full hero composition'
require_text "$HERO_CSS" '.homeHero { min-height: 480px; }' 'Home desktop hero must stay at the approved compact height'
require_text "$HERO_CSS" '.compactHero { min-height: 410px; }' 'Inner desktop hero must stay compact'
require_text "$HERO_CSS" 'inset: 0;' 'Hero photograph must be full-bleed'
reject_text "$HERO_CSS" 'left: 42%;' 'Hero must not return to a separate right-side photo pane'
reject_text "$HERO_CSS" 'height: 300px;' 'Mobile hero must not become a detached lower image panel'
require_text "$HERO_CSS" 'rgba(247,249,252,0) 64%' 'Desktop readability fade must end before the image is visually erased'
require_text "$NEXT_CONFIG" "hostname: 'images.pexels.com'" 'Next config must allow the hero image host'
require_text "$LAYOUT" 'rel="preconnect" href="https://images.pexels.com"' 'Hero image host must be preconnected'
require_text "$HERO_ASSETS" 'w=2560' 'Hero delivery must request sharp desktop width without the old 3840 payload'
for mapping in \
  'home: pexels(35551059)' \
  'student: pexels(18012463)' \
  'school: pexels(35551044)' \
  'parent: pexels(9345612)' \
  'learn: pexels(33745700)' \
  'competition: pexels(13812360)' \
  'communities: pexels(18012458)' \
  'admin: pexels(4308104)'
do
  require_text "$HERO_ASSETS" "$mapping" "Missing final Indian-context hero mapping: $mapping"
done

printf '==> Home value proposition and information architecture\n'
require_text "$HOME_ROUTE" 'PublicHomeVisualExperience' 'Home route must use the public visual experience'
require_text "$HOME" 'variant="home"' 'Home must explicitly use the Home hero size'
require_text "$HOME" 'One connected platform for learning, schools and families.' 'Home must explain the platform in the headline'
require_text "$HOME" 'student learning, school operations, parent visibility, competitions and education communities' 'Home must explain the connected platform value'
require_text "$HOME" 'Learn & practise by class' 'Home hero must include student value cue'
require_text "$HOME" 'Run school academics & operations' 'Home hero must include school value cue'
require_text "$HOME" 'Keep families connected' 'Home hero must include parent value cue'
for copy in \
  'Learning in one place' \
  'Connected schools' \
  'Parents stay informed' \
  'Beyond the classroom' \
  'WHO VIDYASETU IS FOR' \
  'ONE CONNECTED JOURNEY' \
  'BUILT TO BE TRUSTED'
do
  require_text "$HOME" "$copy" "Home storytelling section missing: $copy"
done
require_text "$HOME" 'image={HERO_IMAGES.home}' 'Home must use its dedicated hero'
require_text "$HOME" 'imagePosition={HERO_POSITIONS.home}' 'Home must use its reviewed focal position'
require_text "$HOME" '<Image src={module.image}' 'Home module cards must use photographic media'
for key in student school parent learn competition communities; do
  require_text "$HOME" "MODULE_IMAGES.$key" "Home module image missing: $key"
done
require_text "$HOME_CSS" 'grid-template-columns: repeat(3, minmax(0, 1fr));' 'Home module cards must remain 3 across on desktop'
require_text "$HOME_CSS" 'height: 168px;' 'Home module cards must be compact with meaningful media'
require_text "$HOME" 'getPublicLearningResources({ featured: true, limit: 3 })' 'Home must preserve the 3-resource Learning preview'
require_text "$HOME" 'getPublicSchools()' 'Home school discovery must remain API-backed'
require_text "$HOME" 'getPublicCompetitions()' 'Home competition discovery must remain API-backed'
require_text "$HOME" '<SubjectVisual input={resource} compact />' 'Home Learning fallback must remain subject-aware'

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
  require_text "$MODULE" "HERO_POSITIONS.$key" "Module hero focal position missing: $key"
done
require_text "$MODULE" 'config.capabilities.slice(0, 6)' 'Module pages must preserve six compact highlights'
require_text "$MODULE" 'capabilityHref(config, capability)' 'Module highlights must remain functional'
require_text "$MODULE" 'config.schoolDirectory' 'School directory behavior must remain intact'
require_text "$MODULE_CSS" 'grid-template-columns: repeat(3, minmax(0, 1fr));' 'Module highlight cards must remain 3 across'

printf '==> Meaningful subject and grade-band visual system\n'
require_text "$SUBJECT" "export type LearningGradeBand = 'primary' | 'middle' | 'secondary'" 'Learning must retain three grade bands'
for subject in math science english hindi social computer evs commerce; do
  require_text "$SUBJECT" "$subject:" "Subject visual missing: $subject"
done
for cue in '1 2 3' 'f(x)' 'H₂O' 'ABC' 'क  ख  ग' 'history • civics' '</>' 'air • water' 'P&L'; do
  require_text "$SUBJECT" "$cue" "Subject visual cue missing: $cue"
done
require_text "$SUBJECT" "band === 'primary' ? 'Classes 1–4'" 'Primary subject band must remain'
require_text "$SUBJECT" "band === 'middle' ? 'Classes 5–8'" 'Middle subject band must remain'
require_text "$SUBJECT" "'Classes 9–12'" 'Secondary subject band must remain'
require_text "$SUBJECT" 'className={styles.formulaPanel}' 'Subject visuals must use the richer artwork panel'
require_text "$SUBJECT_CSS" '.formulaPanel strong' 'Subject artwork must give the learning motif visual weight'
require_text "$SUBJECT_CSS" 'min-height:164px' 'Subject visual must occupy a meaningful card media area'
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
require_text "$COMPETITION" 'variant="compact"' 'Competition hero must stay compact'
require_text "$COMPETITION" 'Give talent somewhere to go.' 'Competition approved headline must remain'
require_text "$COMPETITION" 'image={HERO_IMAGES.competition}' 'Competition must use its dedicated hero'
require_text "$COMPETITION" 'HERO_POSITIONS.competition' 'Competition must use reviewed image framing'
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
