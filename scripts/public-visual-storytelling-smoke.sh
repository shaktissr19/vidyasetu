#!/usr/bin/env bash
set -Eeuo pipefail

fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }
require_text() { grep -Fq -- "$2" "$1" || fail "$3 ($1)"; }
reject_text() { ! grep -Fq -- "$2" "$1" || fail "$3 ($1)"; }

HOME='frontend/src/components/public/PublicHomeVisualExperience.tsx'
HOME_ROUTE='frontend/src/app/page.tsx'
HERO='frontend/src/components/public/ImageHero.tsx'
HERO_CSS='frontend/src/components/public/imageHero.module.css'
HOME_CSS='frontend/src/components/public/publicHomeVisual.module.css'
MODULE='frontend/src/components/public/PublicModulePage.tsx'
MODULE_CSS='frontend/src/components/public/publicModuleVisual.module.css'
LEARN='frontend/src/components/public/PublicLearningLibrary.tsx'
LOGIN='frontend/src/app/(auth)/login/page.tsx'
COMPETITION='frontend/src/app/competition/page.tsx'
ASSET='frontend/public/images/vidyasetu-hero-sprite.jpg'

for file in "$HOME" "$HOME_ROUTE" "$HERO" "$HERO_CSS" "$HOME_CSS" "$MODULE" "$MODULE_CSS" "$LEARN" "$LOGIN" "$COMPETITION" "$ASSET"; do
  [[ -s "$file" ]] || fail "Required visual-storytelling file is missing: $file"
done

printf '==> Hero asset integrity and delivery\n'
ASSET_BYTES="$(wc -c < "$ASSET" | tr -d ' ')"
[[ "$ASSET_BYTES" -ge 12000 ]] || fail "Approved hero artwork is unexpectedly small (${ASSET_BYTES} bytes)."
JPEG_MAGIC="$(od -An -tx1 -N2 "$ASSET" | tr -d ' \n')"
[[ "$JPEG_MAGIC" == 'ffd8' ]] || fail "Approved hero artwork is not a valid JPEG (magic=$JPEG_MAGIC)."
require_text "$HERO_CSS" 'z-index: 0;' 'Hero photo layer must render in front of the hero background'
require_text "$HERO_CSS" 'opacity: 1;' 'Hero photography must remain fully visible'
require_text "$HERO_CSS" 'z-index: 3;' 'Hero content must render above the photo and wash layers'
require_text "$HERO_CSS" 'rgba(255,255,255,0) 64%' 'Desktop hero wash must release the photograph before the right-side visual focus'
reject_text "$HERO_CSS" 'rgba(255,255,255,0) 74%' 'Old over-wide wash must not return'
reject_text "$HERO_CSS" 'z-index:-3' 'Hero photo must never use the broken negative stacking layer again'
reject_text "$HERO_CSS" 'z-index: -3' 'Hero photo must never use the broken negative stacking layer again'

printf '==> Homepage visual story\n'
require_text "$HOME_ROUTE" 'PublicHomeVisualExperience' 'Home route must use the approved image-led public experience'
require_text "$HOME" 'title="Welcome to VidyaSetu"' 'Homepage must use the approved concise welcome headline'
require_text "$HOME" 'India’s unified education platform for learning, schools and families.' 'Homepage must use the approved unified-platform supporting line'
require_text "$HOME" "const HERO_SPRITE = '/images/vidyasetu-hero-sprite.jpg';" 'Homepage must use the repo-owned approved hero artwork'
require_text "$HOME" 'moduleMedia' 'Homepage module cards must include an editorial visual area'
require_text "$HOME" 'discoveryVisual' 'Homepage Learning cards must include subject-relevant visual treatment'
require_text "$HOME" "from 'lucide-react'" 'Homepage primary cards must use consistent vector symbols rather than emoji-only UI'
reject_text "$HOME" "icon: '🎓'" 'Homepage module cards must not regress to emoji-only symbols'
require_text "$HOME_CSS" 'grid-template-columns: repeat(3, minmax(0, 1fr));' 'Homepage module cards must be three across on desktop'
require_text "$HOME_CSS" 'grid-template-columns: 132px minmax(0, 1fr);' 'Homepage module cards must use the compact horizontal editorial layout'
require_text "$HOME_CSS" 'min-height: 184px;' 'Homepage module cards must remain compact on desktop'
require_text "$HOME_CSS" 'box-shadow: 0 14px 32px' 'Homepage cards must visibly lift away from the section background'
reject_text "$HOME_CSS" 'height: 180px;' 'Oversized empty module media must not return'
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
require_text "$MODULE" 'quickIconFor(config, capability, index)' 'Module highlight cards must use consistent functional symbols'
require_text "$MODULE" 'id="module-capabilities"' 'Full module capabilities must remain available below the visual intro'
require_text "$MODULE" 'config.schoolDirectory' 'School directory behavior must remain intact'
require_text "$MODULE_CSS" 'grid-template-columns: repeat(3, minmax(0, 1fr));' 'Module highlight cards must be three across on desktop'
require_text "$MODULE_CSS" 'min-height: 174px;' 'Module highlight cards must remain compact on desktop'
reject_text "$MODULE_CSS" 'min-height: 205px;' 'Oversized public capability cards must not return'

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
