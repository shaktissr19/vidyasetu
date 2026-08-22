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
    kicker: 'VidyaSetu Platform',
    title: 'Learning, school operations and family visibility',
    accent: 'connected in one education platform',
    copy: 'VidyaSetu connects student learning, school administration, parent visibility, competitions and private moderated Groups while keeping personal records behind role-based authentication.',
    href: '/for-students',
    cta: 'Explore the platform',
    metric: 'students',
    metricLabel: 'active students in the current database',
    points: ['One identity across learning and school records', 'Real school and family workflows', 'Public discovery separated from private dashboards'],
  },
  {
    kicker: 'For Students',
    title: 'A student workspace for learning and',
    accent: 'school-connected progress',
    copy: 'Students can work with subjects, content, doubts, AI support, attendance, report cards, competitions, offline downloads, gamification and approved Groups from one account.',
    href: '/for-students',
    cta: 'See Student capabilities',
    metric: 'students',
    metricLabel: 'active students',
    points: ['Permanent Student ID and school-link workflow', 'Attendance, results and learning progress', 'Competitions, doubts, XP, badges and Groups'],
  },
  {
    kicker: 'For Schools & Teachers',
    title: 'Operate academics and administration from',
    accent: 'one school workspace',
    copy: 'Schools manage students, classes, teachers, attendance, fees, timetables, exams, results, announcements, enrollments and family connectivity without splitting daily work across disconnected tools.',
    href: '/for-schools',
    cta: 'See School capabilities',
    metric: 'schools',
    metricLabel: 'active schools',
    points: ['Student and teacher administration', 'Attendance, fees, timetable and exams', 'Announcements, enrollment and parent visibility'],
  },
  {
    kicker: 'For Parents',
    title: 'See the child journey with',
    accent: 'clear school-linked visibility',
    copy: 'Parents can switch between linked children and review performance, attendance, report cards, fees, teacher messages, notifications and moderated parent Groups.',
    href: '/for-parents',
    cta: 'See Parent capabilities',
    metric: 'parents',
    metricLabel: 'active parent accounts',
    points: ['Multiple linked children', 'Attendance, results and fee visibility', 'Teacher communication and Parent Groups'],
  },
  {
    kicker: 'Academic Competitions',
    title: 'Published challenges with',
    accent: 'real registration and result workflows',
    copy: 'VidyaSetu Competitions are backed by actual exam records and lifecycle states. Students can discover eligible challenges, register, attempt exams and view leaderboards or results.',
    href: '/competition',
    cta: 'View Competitions',
    metric: 'competitions',
    metricLabel: 'published competitions',
    points: ['Registration and live exam states', 'Student attempts and scoring', 'Leaderboards and completed results'],
  },
  {
    kicker: 'Private Collaboration',
    title: 'Education Groups with',
    accent: 'approval, consent and moderation',
    copy: 'Groups are not an open public community feed. Creation is platform-approved, membership is controlled, invitations require consent, and reports are reviewed through governance workflows.',
    href: '/groups-info',
    cta: 'Understand Groups',
    metric: 'groups',
    metricLabel: 'active Groups',
    points: ['Student, Parent, Teacher and mixed Groups', 'Private, school and class scope', 'Owner/moderator controls and reporting'],
  },
  {
    kicker: 'Platform Governance',
    title: 'Operate VidyaSetu with',
    accent: 'network-level visibility and control',
    copy: 'Platform Admin is distinct from School Admin. It covers analytics, schools, users, content, revenue, support, competitions, configuration and Group governance.',
    href: '/platform-admin',
    cta: 'See Platform Admin',
    metric: 'schools',
    metricLabel: 'active institutions under platform governance',
    points: ['Network analytics and school/user controls', 'Support, content and configuration', 'Competition and Group governance'],
  },
];

const AUDIENCES = [
  { icon: '🎓', title: 'Students', text: 'Learning, school records, attendance, report cards, doubts, competitions and progress.', href: '/for-students' },
  { icon: '🏫', title: 'Schools & Teachers', text: 'Student administration, attendance, fees, timetable, exams, results and communication.', href: '/for-schools' },
  { icon: '👨‍👩‍👧', title: 'Parents', text: 'Child performance, attendance, report cards, fees, teacher messages and Groups.', href: '/for-parents' },
  { icon: '🛡️', title: 'Platform Admin', text: 'Analytics, schools, users, support, configuration, competitions and governance.', href: '/platform-admin' },
];

const PLATFORM_AREAS = [
  ['📚', 'Learning & Content', 'Subjects, chapters, learning items, completion, doubts and AI-assisted study support.'],
  ['🏫', 'School Operations', 'Students, teachers, classes, attendance, fees, timetables, exams, results and announcements.'],
  ['👨‍👩‍👧', 'Family Visibility', 'Linked-child dashboards, attendance, performance, report cards, fees, messages and notifications.'],
  ['🏆', 'Competitions', 'Published academic challenges, registration, attempts, scoring, results and leaderboards.'],
  ['👥', 'Private Groups', 'Approval-based Groups with controlled membership, consent, posts, comments, moderation and reports.'],
  ['⚙️', 'Platform Governance', 'Analytics, school/user controls, content, revenue, support, configuration and Group governance.'],
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
          <div aria-live="polite">
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

          <aside className={styles.slidePanel}>
            <div className={styles.slideMetric}>{formatCount(overview, slide.metric)}</div>
            <div className={styles.slideMetricLabel}>{slide.metricLabel}</div>
            <div className={styles.slidePoints}>
              {slide.points.map((point) => <div className={styles.slidePoint} key={point}>✓ {point}</div>)}
            </div>
            <div className={styles.liveNote}><span className={styles.liveDot} /> Aggregate counts come from the VidyaSetu database</div>
          </aside>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>Explore VidyaSetu by who you are</h2>
            <p>Public pages explain what each module does. Dashboards remain protected and only show personal or operational records after role-based login.</p>
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
            <h2>One platform, six connected operating areas</h2>
            <p>These are the major functional domains currently represented in the application and backend APIs.</p>
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
            <h2>Real schools on the platform</h2>
            <p>The preview below uses active institution records and safe aggregate counts—not demo marketing numbers.</p>
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
            <p>This preview comes from the real public Competition API and follows actual exam lifecycle states.</p>
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
              <h2>Understand the platform before you sign in.</h2>
              <p>Explore the public module pages first, then login to the correct role dashboard when you need personal or operational data.</p>
            </div>
            <div className={styles.twoActions}>
              <Link className={styles.lightButton} href="/login">Login to your dashboard</Link>
              <Link className={styles.secondary} href="/register">Create an account</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>© 2026 VidyaSetu · Learning, school operations, family visibility, Competitions and private Groups</footer>
    </div>
  );
}
