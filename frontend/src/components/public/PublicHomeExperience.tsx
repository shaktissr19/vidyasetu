'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import {
  getPublicCompetitions,
  getPublicOverview,
  getPublicSchools,
  type PublicCompetition,
  type PublicOverview,
  type PublicSchool,
} from '@/services/publicService';
import styles from './publicExperience.module.css';

type MetricKey = 'students' | 'schools' | 'teachers' | 'parents' | 'groups' | 'competitions';

interface SlideMetric {
  key: MetricKey;
  label: string;
}

interface Slide {
  kicker: string;
  icon: string;
  title: string;
  accent: string;
  copy: string;
  href: string;
  cta: string;
  loginHref: string;
  metrics: [SlideMetric, SlideMetric];
  points: string[];
  panelGradient: string;
  glow: string;
}

const SLIDES: Slide[] = [
  {
    kicker: 'VidyaSetu · Bharat Education Platform',
    icon: '🇮🇳',
    title: 'Learning, school operations and family visibility',
    accent: 'connected through one trusted identity',
    copy: 'VidyaSetu connects learning, school administration, parent visibility, competitions and Education Community while keeping personal records protected behind role-based access.',
    href: '/for-students',
    cta: 'Explore VidyaSetu',
    loginHref: '/login',
    metrics: [
      { key: 'students', label: 'Active students' },
      { key: 'schools', label: 'Active schools' },
    ],
    points: ['One identity across learning and school records', 'School, teacher and family workflows in one platform', 'Hindi and regional-language ready experiences'],
    panelGradient: 'linear-gradient(145deg, rgba(255,153,51,.28), rgba(31,91,163,.30) 52%, rgba(19,136,8,.18))',
    glow: 'rgba(255,153,51,.32)',
  },
  {
    kicker: 'For Students',
    icon: '🎓',
    title: 'Learn, practise and understand your',
    accent: 'school-connected progress',
    copy: 'Students can move between subjects, doubts, AI support, attendance, report cards, competitions, offline study, achievements and Education Community from one VidyaSetu account.',
    href: '/for-students',
    cta: 'See Student capabilities',
    loginHref: '/login?role=student',
    metrics: [
      { key: 'students', label: 'Active students' },
      { key: 'competitions', label: 'Published competitions' },
    ],
    points: ['Permanent VidyaSetu Student ID and school-link workflow', 'Attendance, results and learning progress together', 'Study circles, competitions, doubts, XP and badges'],
    panelGradient: 'linear-gradient(145deg, rgba(28,143,109,.34), rgba(47,112,181,.28))',
    glow: 'rgba(41,191,138,.28)',
  },
  {
    kicker: 'For Schools & Teachers',
    icon: '🏫',
    title: 'Run academics and daily operations from',
    accent: 'one school workspace',
    copy: 'Schools can manage students, classes, teachers, attendance, fees, timetables, exams, results, announcements, enrollments, Parent concerns and school Communities without jumping between disconnected tools.',
    href: '/for-schools',
    cta: 'See School capabilities',
    loginHref: '/login?role=school',
    metrics: [
      { key: 'schools', label: 'Active schools' },
      { key: 'teachers', label: 'Teachers' },
    ],
    points: ['Class, section, teacher and enrollment administration', 'Attendance, fees, timetable, exams and results', 'Parent communication, grievances and school Communities'],
    panelGradient: 'linear-gradient(145deg, rgba(255,107,0,.30), rgba(66,113,187,.34))',
    glow: 'rgba(255,126,35,.28)',
  },
  {
    kicker: 'For Parents & Guardians',
    icon: '👨‍👩‍👧',
    title: 'Stay connected to the child journey with',
    accent: 'clear school-linked visibility',
    copy: 'Parents can switch between linked children and review attendance, performance, report cards, fees, teacher messages, notifications, formal grievances and moderated Parent Communities.',
    href: '/for-parents',
    cta: 'See Parent capabilities',
    loginHref: '/login?role=parent',
    metrics: [
      { key: 'parents', label: 'Active parent accounts' },
      { key: 'students', label: 'Students on the platform' },
    ],
    points: ['Multiple children under one protected Parent account', 'Attendance, marks, fees and school notices in context', 'Teacher communication, grievance tracking and Parent Community'],
    panelGradient: 'linear-gradient(145deg, rgba(184,80,154,.30), rgba(28,143,109,.24))',
    glow: 'rgba(208,91,171,.24)',
  },
  {
    kicker: 'Academic Competitions',
    icon: '🏆',
    title: 'Discover challenges with',
    accent: 'real registration, attempts and results',
    copy: 'VidyaSetu Competitions use actual exam lifecycle records. Students can discover eligible challenges, register, attempt assessments and view completed results or leaderboards.',
    href: '/competition',
    cta: 'View Competitions',
    loginHref: '/login?role=student',
    metrics: [
      { key: 'competitions', label: 'Published competitions' },
      { key: 'students', label: 'Potential student participants' },
    ],
    points: ['Eligibility and registration workflow', 'Timed attempts and scoring', 'Results and leaderboard visibility'],
    panelGradient: 'linear-gradient(145deg, rgba(244,180,0,.36), rgba(255,107,0,.24), rgba(84,91,171,.24))',
    glow: 'rgba(244,180,0,.28)',
  },
  {
    kicker: 'VidyaSetu Education Community',
    icon: '🌐',
    title: 'Connect students, parents, teachers and schools in',
    accent: 'moderated education communities',
    copy: 'Education Community is VidyaSetu’s social collaboration layer: study circles, Parent networks, Teacher communities and school/class spaces with verified identities, approval, consent and reporting.',
    href: '/community',
    cta: 'Explore Education Community',
    loginHref: '/login',
    metrics: [
      { key: 'groups', label: 'Active Communities' },
      { key: 'teachers', label: 'Teachers on VidyaSetu' },
    ],
    points: ['Student, Parent, Teacher and mixed learning communities', 'Private, school and class context', 'Membership approval, invitation consent and moderation'],
    panelGradient: 'linear-gradient(145deg, rgba(123,83,196,.38), rgba(0,151,167,.28))',
    glow: 'rgba(135,91,214,.30)',
  },
  {
    kicker: 'Platform Governance',
    icon: '🛡️',
    title: 'Operate the VidyaSetu network with',
    accent: 'platform-level visibility and control',
    copy: 'Platform Admin is distinct from School Admin. It covers analytics, schools, users, content, support, revenue, competitions, grievances, configuration and Education Community governance.',
    href: '/platform-admin',
    cta: 'See Platform Admin',
    loginHref: '/login?role=admin',
    metrics: [
      { key: 'schools', label: 'Institutions under governance' },
      { key: 'groups', label: 'Active Communities' },
    ],
    points: ['Network analytics and school/user controls', 'Support, content, grievance and configuration oversight', 'Competition and Education Community governance'],
    panelGradient: 'linear-gradient(145deg, rgba(0,172,193,.28), rgba(74,86,168,.34))',
    glow: 'rgba(0,188,212,.24)',
  },
];

const AUDIENCES = [
  { icon: '🎓', title: 'Students', text: 'Learning, school records, attendance, report cards, doubts, competitions and progress.', href: '/for-students' },
  { icon: '🏫', title: 'Schools & Teachers', text: 'Students, staff, attendance, fees, timetable, exams, results, Parent concerns and communication.', href: '/for-schools' },
  { icon: '👨‍👩‍👧', title: 'Parents', text: 'Child performance, attendance, report cards, fees, teacher messages, grievances and Community.', href: '/for-parents' },
  { icon: '🌐', title: 'Education Community', text: 'Moderated Student, Parent, Teacher and school/class communities with verified identities.', href: '/community' },
  { icon: '🛡️', title: 'Platform Admin', text: 'Analytics, schools, users, support, configuration, competitions, grievances and governance.', href: '/platform-admin' },
];

const PLATFORM_AREAS = [
  ['📚', 'Learning & Content', 'Subjects, chapters, learning items, completion, doubts and AI-assisted study support.'],
  ['🏫', 'School Operations', 'Students, teachers, classes, attendance, fees, timetables, exams, results and announcements.'],
  ['👨‍👩‍👧', 'Family Visibility', 'Linked-child dashboards, attendance, performance, report cards, fees, messages and formal concerns.'],
  ['🏆', 'Competitions', 'Published academic challenges, registration, attempts, scoring, results and leaderboards.'],
  ['🌐', 'Education Community', 'Study circles, Parent networks, Teacher communities and school/class collaboration with moderation.'],
  ['⚙️', 'Platform Governance', 'Analytics, school/user controls, content, revenue, support, grievances, configuration and Community governance.'],
];

function formatCount(overview: PublicOverview | null, key: MetricKey): string {
  if (!overview) return '—';
  return new Intl.NumberFormat('en-IN').format(overview[key]);
}

function formatDate(value?: string | null): string {
  if (!value) return 'Schedule to be announced';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Schedule to be announced';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export default function PublicHomeExperience() {
  const [overview, setOverview] = useState<PublicOverview | null>(null);
  const [competitions, setCompetitions] = useState<PublicCompetition[]>([]);
  const [schools, setSchools] = useState<PublicSchool[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.allSettled([getPublicOverview(), getPublicCompetitions(), getPublicSchools()]).then((results) => {
      if (!active) return;
      const [overviewResult, competitionResult, schoolResult] = results;
      if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value.data.data);
      if (competitionResult.status === 'fulfilled') setCompetitions(competitionResult.value.data.data || []);
      if (schoolResult.status === 'fulfilled') setSchools(schoolResult.value.data.data || []);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setInterval(() => setSlideIndex((index) => (index + 1) % SLIDES.length), 8000);
    return () => window.clearInterval(timer);
  }, [paused]);

  const slide = SLIDES[slideIndex];
  const competitionPreview = useMemo(() => competitions.slice(0, 3), [competitions]);
  const schoolPreview = useMemo(() => schools.slice(0, 3), [schools]);

  function moveSlide(direction: -1 | 1): void {
    setSlideIndex((index) => (index + direction + SLIDES.length) % SLIDES.length);
  }

  const panelStyle = {
    background: slide.panelGradient,
    boxShadow: `0 28px 70px ${slide.glow}`,
  } satisfies CSSProperties;

  return (
    <div className={styles.page}>
      <GlobalTopbar />

      <section
        className={styles.homeHero}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        aria-roledescription="carousel"
        aria-label="VidyaSetu platform overview"
      >
        <div className={styles.homeHeroInner}>
          <div className={styles.slideCopyColumn} aria-live="polite">
            <div className={styles.slideKicker}>{slide.kicker}</div>
            <h1 className={styles.slideTitle}>
              {slide.title}<br /><span className={styles.accent}>{slide.accent}</span>
            </h1>
            <p className={styles.slideCopy}>{slide.copy}</p>
            <div className={styles.chips}>
              {slide.points.map((point) => <span className={styles.chip} key={point}>{point}</span>)}
            </div>
            <div className={styles.heroActions}>
              <Link className={styles.primary} href={slide.href}>{slide.cta}</Link>
              <Link className={styles.secondary} href={slide.loginHref}>Login to your dashboard</Link>
            </div>
            <div className={styles.carouselRow}>
              <button type="button" className={styles.carouselArrow} onClick={() => moveSlide(-1)} aria-label="Previous platform story">‹</button>
              <div className={styles.carouselControls} aria-label="Choose platform story">
                {SLIDES.map((item, index) => (
                  <button
                    key={item.kicker}
                    type="button"
                    className={`${styles.dot} ${index === slideIndex ? styles.dotActive : ''}`}
                    onClick={() => setSlideIndex(index)}
                    aria-label={`Show slide ${index + 1}: ${item.kicker}`}
                    aria-current={index === slideIndex}
                  />
                ))}
              </div>
              <button type="button" className={styles.carouselArrow} onClick={() => moveSlide(1)} aria-label="Next platform story">›</button>
            </div>
          </div>

          <aside className={styles.slidePanel} style={panelStyle}>
            <div className={styles.slideVisualTop}>
              <div className={styles.slideIcon}>{slide.icon}</div>
              <div>
                <div className={styles.visualEyebrow}>Live platform snapshot</div>
                <div className={styles.visualTitle}>{slide.kicker}</div>
              </div>
            </div>
            <div className={styles.heroMetricGrid}>
              {slide.metrics.map((metric) => (
                <div className={styles.heroMetricCard} key={metric.key}>
                  <div className={styles.slideMetric}>{formatCount(overview, metric.key)}</div>
                  <div className={styles.slideMetricLabel}>{metric.label}</div>
                </div>
              ))}
            </div>
            <div className={styles.slidePoints}>
              {slide.points.map((point) => <div className={styles.slidePoint} key={point}><span>✓</span>{point}</div>)}
            </div>
            <div className={styles.liveNote}><span className={styles.liveDot} /> Counts shown above come from the VidyaSetu database</div>
          </aside>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>Explore VidyaSetu by who you are</h2>
            <p>Understand the platform first. Personal records and operational actions remain protected inside the correct role dashboard.</p>
          </div>
          <div className={styles.audienceGrid}>
            {AUDIENCES.map((audience) => (
              <Link className={styles.audienceCard} href={audience.href} key={audience.title}>
                <div className={styles.capIcon}>{audience.icon}</div>
                <strong>{audience.title}</strong>
                <p>{audience.text}</p>
                <span className={styles.smallLink}>Explore details</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.sectionAlt}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>One platform for the connected education journey</h2>
            <p>VidyaSetu combines learning, school operations, family visibility and a moderated social layer without mixing public information with private records.</p>
          </div>
          <div className={styles.capGrid}>
            {PLATFORM_AREAS.map(([icon, title, copy]) => (
              <article className={styles.capCard} key={title}>
                <div className={styles.capIcon}>{icon}</div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>Schools currently connected to VidyaSetu</h2>
            <p>This preview uses active institution records and safe aggregate counts—not invented marketing numbers.</p>
          </div>
          {schoolPreview.length === 0 ? (
            <div className={styles.empty}>No active school records are currently available for public preview.</div>
          ) : (
            <div className={styles.previewGrid}>
              {schoolPreview.map((school) => (
                <article className={styles.previewCard} key={school.id}>
                  <div className={styles.capIcon}>🏫</div>
                  <h3>{school.name}</h3>
                  <p>{[school.city, school.district, school.state].filter(Boolean).join(' · ')}</p>
                  <div className={styles.miniStats}>
                    <div className={styles.miniStat}><strong>{school.students}</strong><span>Students</span></div>
                    <div className={styles.miniStat}><strong>{school.teachers}</strong><span>Teachers</span></div>
                    <div className={styles.miniStat}><strong>{school.classes}</strong><span>Classes</span></div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className={styles.heroActions} style={{ justifyContent: 'center', marginTop: 24 }}>
            <Link className={styles.primary} href="/for-schools#school-directory">Explore Schools & Directory</Link>
          </div>
        </div>
      </section>

      <section className={styles.sectionAlt}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>Published academic Competitions</h2>
            <p>This preview comes from the live public Competition API and follows actual competition lifecycle states.</p>
          </div>
          {competitionPreview.length === 0 ? (
            <div className={styles.empty}>There are no published Competitions in an active/public state right now.</div>
          ) : (
            <div className={styles.previewGrid}>
              {competitionPreview.map((competition) => (
                <article className={styles.previewCard} key={competition.id}>
                  <div className={styles.capIcon}>🏆</div>
                  <h3>{competition.title}</h3>
                  <p>{competition.description || `Classes ${competition.class_names?.join(', ') || 'as configured'} · ${formatDate(competition.start_time)}`}</p>
                  <span className={styles.badge}>{competition.status.replaceAll('_', ' ')}</span>
                </article>
              ))}
            </div>
          )}
          <div className={styles.heroActions} style={{ justifyContent: 'center', marginTop: 24 }}>
            <Link className={styles.primary} href="/competition">View all Competitions</Link>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.cta}>
            <div>
              <h2>Education records stay private. Opportunities stay discoverable.</h2>
              <p>Explore VidyaSetu publicly, then sign in only when you need your personal, family, school or platform workspace.</p>
            </div>
            <div className={styles.twoActions}>
              <Link className={styles.lightButton} href="/login">Login to your dashboard</Link>
              <Link className={styles.secondary} href="/register">Create an account</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>© 2026 VidyaSetu · Learning, school operations, family visibility, Competitions and Education Community</footer>
    </div>
  );
}
