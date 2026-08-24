'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileText,
  GraduationCap,
  HeartHandshake,
  Landmark,
  MessageCircle,
  School,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  UserRoundCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import ImageHero from '@/components/public/ImageHero';
import { getPublicSchools, type PublicSchool } from '@/services/publicService';
import styles from './publicExperience.module.css';
import visualStyles from './publicModuleVisual.module.css';

type MetricKey = 'students' | 'schools' | 'teachers' | 'parents' | 'groups' | 'competitions';
type PublicRole = 'student' | 'parent' | 'school' | 'teacher' | 'admin';
type HeroTheme = 'orange' | 'blue' | 'green' | 'violet' | 'teal' | 'rose';

export interface ModuleCapability { icon: string; title: string; description: string; bullets: string[]; href?: string; }
export interface ModuleStep { title: string; description: string; }
export interface ModuleProof { icon: string; title: string; description: string; }
export interface ModuleMetric { key: MetricKey; label: string; }
export interface PublicModuleConfig {
  eyebrow: string;
  title: string;
  accentTitle: string;
  summary: string;
  audience: string;
  loginRole: PublicRole;
  metrics: ModuleMetric[];
  capabilities: ModuleCapability[];
  steps: ModuleStep[];
  proofTitle: string;
  proofIntro: string;
  proofs: ModuleProof[];
  loginTitle: string;
  loginText: string;
  heroImage?: string;
  heroTheme?: HeroTheme;
  heroImagePosition?: string;
  heroImageSize?: string;
  secondaryLogin?: { role: PublicRole; label: string };
  schoolDirectory?: boolean;
}

interface VisualStory {
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  imagePosition: string;
  imageSize: string;
  theme: HeroTheme;
}

const HERO_SPRITE = '/images/vidyasetu-hero-sprite.jpg';
const QUICK_TONES = [visualStyles.quickBlue, visualStyles.quickGreen, visualStyles.quickOrange, visualStyles.quickViolet, visualStyles.quickRose, visualStyles.quickTeal];
const QUICK_ICONS: LucideIcon[] = [BookOpen, ClipboardCheck, BarChart3, Target, MessageCircle, Sparkles];

const VISUAL_STORIES: Record<'student' | 'parent' | 'school' | 'admin' | 'communities', VisualStory> = {
  student: {
    eyebrow: 'For Students',
    title: 'Every student’s learning day, in one place',
    description: 'Lessons, homework, attendance, practice, exams and progress tracking built for Indian school learners.',
    image: HERO_SPRITE,
    imagePosition: '50% 0%',
    imageSize: '300% 300%',
    theme: 'blue',
  },
  parent: {
    eyebrow: 'For Parents & Guardians',
    title: 'Stay connected to every step of their journey',
    description: 'Follow learning, school progress and communication from one trusted parent space.',
    image: HERO_SPRITE,
    imagePosition: '100% 0%',
    imageSize: '300% 300%',
    theme: 'violet',
  },
  school: {
    eyebrow: 'For Schools & Teachers',
    title: 'A stronger school starts with a clearer view',
    description: 'Bring students, teachers, academics and daily school operations into one connected workspace.',
    image: HERO_SPRITE,
    imagePosition: '0% 50%',
    imageSize: '300% 300%',
    theme: 'green',
  },
  admin: {
    eyebrow: 'Platform Administration',
    title: 'See the network. Guide the system.',
    description: 'Manage schools, users, learning, governance and platform operations from one central view.',
    image: HERO_SPRITE,
    imagePosition: '50% 100%',
    imageSize: '300% 300%',
    theme: 'violet',
  },
  communities: {
    eyebrow: 'Education Communities',
    title: 'Education gets stronger when people connect',
    description: 'Safe spaces for students, parents, teachers and schools to learn, discuss and help one another.',
    image: HERO_SPRITE,
    imagePosition: '0% 100%',
    imageSize: '300% 300%',
    theme: 'teal',
  },
};

function storyFor(config: PublicModuleConfig): VisualStory {
  if (config.eyebrow.toLowerCase().includes('communit')) return VISUAL_STORIES.communities;
  const base = config.loginRole === 'teacher' ? VISUAL_STORIES.school : VISUAL_STORIES[config.loginRole];
  return {
    ...base,
    image: config.heroImage || base.image,
    imagePosition: config.heroImagePosition || base.imagePosition,
    imageSize: config.heroImageSize || base.imageSize,
    theme: config.heroTheme || base.theme,
  };
}

function capabilityHref(config: PublicModuleConfig, capability: ModuleCapability): string {
  if (capability.href) return capability.href;
  const title = capability.title.toLowerCase();
  if (config.loginRole === 'student') {
    if (title.includes('subject') || title.includes('chapter')) return '/subjects';
    if (title.includes('doubt')) return '/doubts';
    if (title.includes('result') || title.includes('report')) return '/report-card';
    if (title.includes('competition')) return '/competition';
    if (title.includes('participation') || title.includes('progress')) return '/leaderboard';
    if (title.includes('connectivity') || title.includes('offline')) return '/offline';
    if (title.includes('communit')) return '/communities';
    return '/student';
  }
  if (title.includes('communit')) return '/communities';
  if (config.loginRole === 'parent') return '/login?role=parent';
  if (config.loginRole === 'school' || config.loginRole === 'teacher') return `/login?role=${config.loginRole}`;
  if (config.loginRole === 'admin') return '/login?role=admin';
  return '#module-capabilities';
}

function quickIconFor(config: PublicModuleConfig, capability: ModuleCapability, index: number): LucideIcon {
  const title = capability.title.toLowerCase();
  if (title.includes('student') || title.includes('learner')) return GraduationCap;
  if (title.includes('school') || title.includes('class')) return School;
  if (title.includes('parent') || title.includes('family') || title.includes('child')) return Users;
  if (title.includes('teacher') || title.includes('staff')) return UserRoundCheck;
  if (title.includes('attendance') || title.includes('calendar') || title.includes('timetable')) return CalendarDays;
  if (title.includes('result') || title.includes('report') || title.includes('record')) return FileText;
  if (title.includes('competition') || title.includes('achievement')) return Trophy;
  if (title.includes('communit') || title.includes('message') || title.includes('communication')) return MessageCircle;
  if (title.includes('safe') || title.includes('security') || title.includes('govern')) return ShieldCheck;
  if (title.includes('support') || title.includes('grievance') || title.includes('concern')) return HeartHandshake;
  if (title.includes('admin') || title.includes('platform') || title.includes('network')) return Landmark;
  return QUICK_ICONS[index % QUICK_ICONS.length];
}

export default function PublicModulePage({ config }: { config: PublicModuleConfig }) {
  const [schools, setSchools] = useState<PublicSchool[]>([]);
  const [query, setQuery] = useState('');
  const [loadingSchools, setLoadingSchools] = useState(Boolean(config.schoolDirectory));
  const story = storyFor(config);

  useEffect(() => {
    if (!config.schoolDirectory) return;
    let active = true;
    setLoadingSchools(true);
    getPublicSchools().then((response) => { if (active) setSchools(response.data.data || []); }).catch(() => { if (active) setSchools([]); }).finally(() => { if (active) setLoadingSchools(false); });
    return () => { active = false; };
  }, [config.schoolDirectory]);

  const filteredSchools = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return schools;
    return schools.filter((school) => [school.name, school.nameHi, school.board, school.city, school.district, school.state].some((value) => value?.toLowerCase().includes(search)));
  }, [query, schools]);

  const loginHref = `/login?role=${config.loginRole}`;

  return (
    <div className={styles.page}>
      <GlobalTopbar />

      <ImageHero
        image={story.image}
        imagePosition={story.imagePosition}
        imageSize={story.imageSize}
        eyebrow={story.eyebrow}
        title={story.title}
        description={story.description}
        theme={story.theme}
        actions={[
          { label: config.loginTitle, href: loginHref },
          { label: 'Explore this module', href: '#module-capabilities', variant: 'secondary' },
        ]}
      />

      <section className={visualStyles.quickSection} aria-label={`${config.audience} highlights`}>
        <div className={styles.shell}>
          <div className={visualStyles.quickGrid}>
            {config.capabilities.slice(0, 6).map((capability, index) => {
              const QuickIcon = quickIconFor(config, capability, index);
              return (
                <Link className={`${visualStyles.quickCard} ${QUICK_TONES[index % QUICK_TONES.length]}`} href={capabilityHref(config, capability)} key={capability.title}>
                  <div className={visualStyles.quickIcon} aria-hidden="true"><QuickIcon strokeWidth={1.9} /></div>
                  <strong>{capability.title}</strong>
                  <p>{capability.description}</p>
                  <span>Explore <b aria-hidden="true">→</b></span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <div className={styles.loginRibbon}>
        <div><strong>Already part of VidyaSetu?</strong><div className={styles.muted}>{config.loginText}</div></div>
        <div className={styles.twoActions}>
          <Link className={styles.primary} href={loginHref}>{config.loginTitle}</Link>
          {config.secondaryLogin && <Link className={styles.lightButton} href={`/login?role=${config.secondaryLogin.role}`}>{config.secondaryLogin.label}</Link>}
        </div>
      </div>

      <section className={styles.section} id="module-capabilities">
        <div className={styles.shell}>
          <div className={styles.sectionHeader}><h2>Everything {config.audience} need in one connected place</h2><p>Explore the practical capabilities available inside this role-aware VidyaSetu workspace.</p></div>
          <div className={styles.capGrid}>
            {config.capabilities.map((capability) => (
              <article className={styles.capCard} key={capability.title}>
                <div className={styles.capIcon}>{capability.icon}</div><h3>{capability.title}</h3><p>{capability.description}</p>
                <ul className={styles.bulletList}>{capability.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.sectionAlt}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}><h2>How the experience works</h2><p>Public pages explain the platform. Personal records, school actions and family information remain protected inside the authenticated role workspace.</p></div>
          <div className={styles.steps}>{config.steps.map((step) => <article className={styles.step} key={step.title}><h3>{step.title}</h3><p>{step.description}</p></article>)}</div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}><h2>{config.proofTitle}</h2><p>{config.proofIntro}</p></div>
          <div className={styles.proofGrid}>{config.proofs.map((proof) => <article className={styles.proof} key={proof.title}><span>{proof.icon}</span><div><strong>{proof.title}</strong><p>{proof.description}</p></div></article>)}</div>
        </div>
      </section>

      {config.schoolDirectory && (
        <section className={styles.sectionAlt} id="school-directory">
          <div className={styles.shell}>
            <div className={styles.sectionHeader}><h2>Schools currently on VidyaSetu</h2><p>Browse active institution records by school name, board, district or state. Only safe institution-level information is shown publicly.</p></div>
            <div className={styles.directoryTools}><input className={styles.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by school, board, district or state" aria-label="Search VidyaSetu schools" /></div>
            {loadingSchools ? <div className={styles.empty}>Loading active schools…</div> : filteredSchools.length === 0 ? <div className={styles.empty}>No active school matches this search.</div> : (
              <div className={styles.schoolGrid}>
                {filteredSchools.map((school) => (
                  <article className={styles.schoolCard} key={school.id}>
                    <div className={styles.schoolTop}><div><div className={styles.schoolName}>{school.name}</div><div className={styles.schoolMeta}>{[school.city, school.district, school.state].filter(Boolean).join(' · ')}</div><div className={styles.schoolMeta}>{school.board || 'Board not listed'} · Academic year {school.academicYear}</div></div>{school.isUdiseLinked && <span className={styles.badge}>UDISE linked</span>}</div>
                    <div className={styles.miniStats}><div className={styles.miniStat}><strong>{school.students}</strong><span>Students</span></div><div className={styles.miniStat}><strong>{school.teachers}</strong><span>Teachers</span></div><div className={styles.miniStat}><strong>{school.classes}</strong><span>Classes</span></div></div>
                    {school.website && <a className={styles.smallLink} href={school.website} target="_blank" rel="noreferrer">Visit school website</a>}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.cta}><div><h2>Explore publicly. Sign in for your own records and actions.</h2><p>Use the role dashboard to access personal learning data, school operations, family records, Communities and support workflows.</p></div><div className={styles.twoActions}><Link className={styles.lightButton} href={loginHref}>{config.loginTitle}</Link><Link className={styles.secondary} href="/register">Create an account</Link></div></div>
        </div>
      </section>
      <footer className={styles.footer}>© 2026 VidyaSetu · Learning, schools, families, Competitions, Communities and accountable support</footer>
    </div>
  );
}
