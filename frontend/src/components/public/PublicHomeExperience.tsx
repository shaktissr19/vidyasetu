'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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

interface Slide {
  icon: string;
  kicker: string;
  title: string;
  accent: string;
  copy: string;
  href: string;
  cta: string;
  metric: MetricKey;
  metricLabel: string;
  points: string[];
}

const SLIDES: Slide[] = [
  {
    icon: '📚',
    kicker: 'VidyaSetu · India-first education platform',
    title: 'Students, schools and families',
    accent: 'connected through one education bridge',
    copy: 'VidyaSetu brings learning, school operations, family visibility, competitions, grievances and moderated Education Communities into one connected platform designed around Indian school workflows.',
    href: '/for-students',
    cta: 'Explore the platform',
    metric: 'students',
    metricLabel: 'active students in the current database',
    points: ['Classes 1–12 learning and school records', 'School operations with parent visibility', 'Hindi/regional-friendly, role-based access'],
  },
  {
    icon: '🎓',
    kicker: 'For Students',
    title: 'Learn, participate and track',
    accent: 'your school-connected progress',
    copy: 'Students can move from subjects and study resources to doubts, attendance, report cards, competitions, offline learning and moderated Communities without switching between disconnected systems.',
    href: '/for-students',
    cta: 'See Student capabilities',
    metric: 'students',
    metricLabel: 'active students',
    points: ['Permanent VidyaSetu Student ID', 'Attendance, report cards and learning progress', 'Competitions, doubts and Education Communities'],
  },
  {
    icon: '🏫',
    kicker: 'For Schools & Teachers',
    title: 'Run academics and administration',
    accent: 'from one school workspace',
    copy: 'Schools manage students, classes, teachers, attendance, fees, timetables, exams, results, announcements, enrollment, parent concerns and school Communities in one operational workspace.',
    href: '/for-schools',
    cta: 'See School capabilities',
    metric: 'schools',
    metricLabel: 'active schools',
    points: ['Student and teacher administration', 'Attendance, fees, timetable, exams and results', 'Parent communication, grievances and Communities'],
  },
  {
    icon: '👨‍👩‍👧',
    kicker: 'For Parents & Guardians',
    title: 'Follow your child’s journey with',
    accent: 'clear school-linked visibility',
    copy: 'Parents can switch between linked children and review attendance, performance, report cards, fees, teacher communication, notifications, formal grievances and moderated Education Communities.',
    href: '/for-parents',
    cta: 'See Parent capabilities',
    metric: 'parents',
    metricLabel: 'active parent accounts',
    points: ['Multiple linked children', 'Attendance, results, fees and school updates', 'Teacher communication, grievances and Communities'],
  },
  {
    icon: '🏆',
    kicker: 'Academic Competitions',
    title: 'Discover challenges with',
    accent: 'real registration, attempts and results',
    copy: 'Students can discover eligible academic competitions, register, attempt published exams and view scores or leaderboards through real competition lifecycle records.',
    href: '/competition',
    cta: 'View Competitions',
    metric: 'competitions',
    metricLabel: 'published competitions',
    points: ['Eligibility and registration', 'Timed attempts and scoring', 'Results and leaderboards'],
  },
  {
    icon: '🤝',
    kicker: 'Education Communities',
    title: 'Safe social collaboration for',
    accent: 'students, parents, teachers and schools',
    copy: 'Communities support learning, discussion, school-family interaction and peer support while keeping membership controlled, invitations consent-based and moderation built in.',
    href: '/communities',
    cta: 'Explore Communities',
    metric: 'groups',
    metricLabel: 'active Education Communities',
    points: ['Student, Parent, Teacher and School communities', 'Teacher–Student and Parent–Teacher collaboration', 'Moderation, reporting and consent controls'],
  },
  {
    icon: '🛡️',
    kicker: 'Platform Governance',
    title: 'Operate VidyaSetu with',
    accent: 'network-level visibility and control',
    copy: 'Platform Admin governs schools, users, content, competitions, Communities, grievances, support, revenue and configuration while School Admin remains focused on individual institution operations.',
    href: '/platform-admin',
    cta: 'See Platform Admin',
    metric: 'schools',
    metricLabel: 'active institutions under platform governance',
    points: ['Network analytics and school/user controls', 'Grievance, support and content governance', 'Competition and Community moderation'],
  },
];

const AUDIENCES = [
  { icon: '🎓', title: 'Students', text: 'Learning, school records, attendance, report cards, doubts, competitions and Communities.', href: '/for-students' },
  { icon: '🏫', title: 'Schools & Teachers', text: 'Students, classes, teachers, attendance, fees, timetable, exams, results and parent engagement.', href: '/for-schools' },
  { icon: '👨‍👩‍👧', title: 'Parents', text: 'Child progress, attendance, report cards, fees, teacher communication, grievances and Communities.', href: '/for-parents' },
  { icon: '🛡️', title: 'Platform Admin', text: 'Analytics, schools, users, support, configuration, competitions, grievances and governance.', href: '/platform-admin' },
];

const PLATFORM_AREAS = [
  ['📚', 'Learning & Study Support', 'Subjects, chapters, learning items, completion, doubts and AI-assisted study support for Classes 1–12.'],
  ['🏫', 'School Operations', 'Students, teachers, classes, attendance, fees, timetables, exams, results and announcements.'],
  ['👨‍👩‍👧', 'Family Visibility', 'Linked-child dashboards, attendance, performance, report cards, fees, messages and notifications.'],
  ['🏆', 'Competitions', 'Published academic challenges, registration, attempts, scoring, results and leaderboards.'],
  ['🤝', 'Education Communities', 'Moderated collaboration for students, parents, teachers and schools with controlled membership and reporting.'],
  ['🛡️', 'Grievances & Governance', 'Formal parent concerns, school response, escalation, platform oversight and accountable resolution.'],
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
    if (paused) return;
    const timer = window.setInterval(() => setSlideIndex((index) => (index + 1) % SLIDES.length), 7000);
    return () => window.clearInterval(timer);
  }, [paused]);

  const slide = SLIDES[slideIndex];
  const competitionPreview = useMemo(() => competitions.slice(0, 3), [competitions]);
  const schoolPreview = useMemo(() => schools.slice(0, 3), [schools]);

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
          <div aria-live="polite" className={styles.heroStory}>
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
              <Link className={styles.secondary} href="/login">Login to your dashboard</Link>
            </div>
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
          </div>

          <aside className={styles.heroVisual} aria-label={`${slide.kicker} highlights`}>
            <div className={styles.heroVisualIcon}>{slide.icon}</div>
            <div className={styles.heroVisualMetric}>{formatCount(overview, slide.metric)}</div>
            <div className={styles.heroVisualLabel}>{slide.metricLabel}</div>
            <div className={styles.heroVisualPoints}>
              {slide.points.map((point, index) => (
                <div className={styles.heroVisualPoint} key={point}>
                  <span>{['📘', '✏️', '🌱'][index % 3]}</span>
                  <strong>{point}</strong>
                </div>
              ))}
            </div>
            <div className={styles.liveNote}><span className={styles.liveDot} /> Live aggregate counts from VidyaSetu data</div>
          </aside>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>Explore VidyaSetu by who you are</h2>
            <p>Understand each module before signing in. Personal records, school operations and family information stay protected behind role-based access.</p>
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
            <h2>One platform for the everyday Indian education journey</h2>
            <p>Learning, school operations, family participation and governance are connected rather than split across separate tools.</p>
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
            <p>The preview uses active institution records and safe aggregate counts—not invented marketing numbers.</p>
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
            <p>Competition previews come from the public Competition API and follow the actual exam lifecycle.</p>
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
              <h2>Learning, school life and family participation—connected.</h2>
              <p>Explore the public module pages first, then sign in to your role dashboard for personal or operational data.</p>
            </div>
            <div className={styles.twoActions}>
              <Link className={styles.lightButton} href="/login">Login to your dashboard</Link>
              <Link className={styles.secondary} href="/register">Create an account</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>© 2026 VidyaSetu · Learning, school operations, family visibility, Competitions, Communities and accountable support</footer>
    </div>
  );
}
