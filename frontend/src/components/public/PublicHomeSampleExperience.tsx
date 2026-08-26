'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BookOpen, Building2, GraduationCap, Link2, Trophy, Users } from 'lucide-react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import SubjectVisual from '@/components/public/SubjectVisual';
import {
  getPublicCompetitions,
  getPublicLearningResources,
  getPublicSchools,
  type PublicCompetition,
  type PublicLearningResource,
  type PublicSchool,
} from '@/services/publicService';
import styles from './publicHomeVisual.module.css';
import sample from './homeSample.module.css';

const HERO_BENEFITS = [
  { icon: GraduationCap, title: 'Learn Better', copy: 'Quality content and practice for every learner', tone: sample.benefitOrange },
  { icon: Building2, title: 'Run Schools Better', copy: 'Smart tools for academics, operations and growth', tone: sample.benefitGreen },
  { icon: Users, title: 'Stay Connected', copy: 'Real-time communication and progress tracking', tone: sample.benefitViolet },
];

const MODULES = [
  { title: 'Students', copy: 'Learn, practice and track your progress', href: '/for-students', tone: sample.blue, photo: sample.studentPhoto },
  { title: 'Schools', copy: 'Manage classes, teachers, attendance and more', href: '/for-schools', tone: sample.green, photo: sample.schoolPhoto },
  { title: 'Parents', copy: 'Monitor progress and stay connected with schools', href: '/for-parents', tone: sample.violet, photo: sample.parentPhoto },
  { title: 'Learning', copy: 'Access public resources for all grades', href: '/learn', tone: sample.orange, photo: sample.learningPhoto },
  { title: 'Competitions', copy: 'Participate, compete and excel', href: '/competition', tone: sample.rose, photo: sample.competitionPhoto },
  { title: 'Communities', copy: 'Connect, discuss and learn together', href: '/communities', tone: sample.teal, photo: sample.communityPhoto },
];

const HOME_STATS = [
  { icon: BookOpen, value: '10,000+', label: 'Learning Resources', note: 'Public content for all', tone: sample.statOrange },
  { icon: Users, value: '1M+', label: 'Students Learning', note: 'Across India', tone: sample.statGreen },
  { icon: Building2, value: '15K+', label: 'Schools Onboard', note: 'Growing every day', tone: sample.statViolet },
  { icon: Trophy, value: '50+', label: 'Competitions', note: 'Opportunities for all', tone: sample.statRose },
];

const JOURNEY = [
  { icon: GraduationCap, step: '01', title: 'A student learns', copy: 'Discover resources, practise by class and build a visible learning journey.' },
  { icon: Building2, step: '02', title: 'The school supports', copy: 'School academics and everyday operations stay connected to the learner.' },
  { icon: Users, step: '03', title: 'The family stays informed', copy: 'Parents can follow progress and school communication from one trusted space.' },
  { icon: Link2, step: '04', title: 'Growth continues beyond class', copy: 'Competitions and Communities extend participation, confidence and opportunity.' },
];

const TRUST = [
  ['🛡️', 'Safe by design', 'Role-aware access keeps personal, school and family records inside protected workspaces.'],
  ['🔗', 'Connected, not fragmented', 'Learning, school operations and family participation belong to the same education journey.'],
  ['🇮🇳', 'Built for Indian education', 'Cross-board learning and school workflows reflect Indian classrooms, families and institutions.'],
  ['📈', 'Progress with context', 'Learning activity can sit alongside school-linked academic context instead of living in another silo.'],
  ['📱', 'Made for everyday access', 'Public discovery is simple and the role-based experience works across modern devices.'],
];

const DISCOVERY_TONES = [styles.discoveryBlue, styles.discoveryGreen, styles.discoveryOrange];

function gradeText(resource: PublicLearningResource): string {
  if (resource.class_min && resource.class_max) return resource.class_min === resource.class_max ? `Class ${resource.class_min}` : `Classes ${resource.class_min}–${resource.class_max}`;
  return 'Multiple learning levels';
}

export default function PublicHomeSampleExperience() {
  const [learning, setLearning] = useState<PublicLearningResource[]>([]);
  const [schools, setSchools] = useState<PublicSchool[]>([]);
  const [competitions, setCompetitions] = useState<PublicCompetition[]>([]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      getPublicLearningResources({ featured: true, limit: 3 }),
      getPublicSchools(),
      getPublicCompetitions(),
    ]).then(([learningResult, schoolResult, competitionResult]) => {
      if (!active) return;
      if (learningResult.status === 'fulfilled') setLearning(learningResult.value.data.data || []);
      if (schoolResult.status === 'fulfilled') setSchools((schoolResult.value.data.data || []).slice(0, 3));
      if (competitionResult.status === 'fulfilled') setCompetitions((competitionResult.value.data.data || []).slice(0, 3));
    });
    return () => { active = false; };
  }, []);

  return (
    <div className={styles.page}>
      <GlobalTopbar />

      <section className={sample.hero} aria-labelledby="home-hero-title">
        <div className={sample.heroPhoto} aria-hidden="true">
          <Image src="/images/sample/home-hero.webp" alt="" fill priority fetchPriority="high" sizes="(min-width: 1100px) 62vw, 100vw" style={{ objectFit: 'cover', objectPosition: 'center' }} />
        </div>
        <div className={sample.heroFade} aria-hidden="true" />
        <div className={sample.heroShell}>
          <div className={sample.heroContent}>
            <div className={sample.eyebrow}>INDIA’S CONNECTED EDUCATION ECOSYSTEM</div>
            <h1 id="home-hero-title">One platform for learning,<br />schools and families.</h1>
            <p className={sample.description}>VidyaSetu connects students, schools, teachers and parents on one trusted platform to learn, manage, communicate and grow together.</p>

            <div className={sample.benefits} aria-label="VidyaSetu core benefits">
              {HERO_BENEFITS.map(({ icon: Icon, title, copy, tone }) => (
                <div className={sample.benefit} key={title}>
                  <span className={`${sample.benefitIcon} ${tone}`}><Icon size={22} strokeWidth={1.9} /></span>
                  <span><strong>{title}</strong><small>{copy}</small></span>
                </div>
              ))}
            </div>

            <div className={sample.actions}>
              <Link className={sample.primary} href="#platform-modules">Explore VidyaSetu <span aria-hidden="true">→</span></Link>
              <Link className={sample.secondary} href="/learn">Start Learning <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </div>
      </section>

      <section className={sample.modulesSection} id="platform-modules">
        <div className={sample.wideShell}>
          <div className={sample.moduleHeading}>
            <h2>Who is VidyaSetu for?</h2>
            <p>Built for everyone in the education ecosystem</p>
          </div>
          <div className={sample.moduleGrid}>
            {MODULES.map((module) => (
              <Link href={module.href} className={`${sample.moduleCard} ${module.tone}`} key={module.title}>
                <div className={`${sample.moduleMedia} ${module.photo}`} aria-hidden="true" />
                <div className={sample.moduleBody}>
                  <strong>{module.title}</strong>
                  <p>{module.copy}</p>
                  <span>Explore <b aria-hidden="true">→</b></span>
                </div>
              </Link>
            ))}
          </div>

          <div className={sample.statsStrip} aria-label="VidyaSetu platform scale">
            {HOME_STATS.map(({ icon: Icon, value, label, note, tone }) => (
              <div className={sample.stat} key={label}>
                <span className={`${sample.statIcon} ${tone}`}><Icon size={24} strokeWidth={1.9} /></span>
                <span className={sample.statCopy}><strong>{value}</strong><b>{label}</b><small>{note}</small></span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.discoverySection}>
        <div className={styles.shell}>
          <div className={styles.sectionIntro}>
            <span>PUBLIC LEARNING</span>
            <h2>Start learning before you even create an account.</h2>
            <p>Students and families can discover real VidyaSetu learning resources publicly, then sign in when they want progress, practice history and school-connected learning.</p>
          </div>
          <div className={styles.discoveryGrid}>
            {learning.length > 0 ? learning.map((resource, index) => (
              <Link className={`${styles.discoveryCard} ${DISCOVERY_TONES[index % DISCOVERY_TONES.length]}`} href={`/learn/resource/${resource.public_slug}`} key={resource.id}>
                <div className={`${styles.discoveryVisual} ${resource.thumbnail_url ? styles.discoveryVisualPhoto : ''}`}>
                  {resource.thumbnail_url ? <img className={styles.discoveryPhoto} src={resource.thumbnail_url} alt="" loading="lazy" /> : <SubjectVisual input={resource} compact />}
                </div>
                <div className={styles.discoveryBody}>
                  <div className={styles.discoveryMeta}>{resource.subject_name || resource.subject_label || resource.category.replaceAll('_', ' ')}</div>
                  <h3>{resource.title}</h3>
                  <p>{resource.summary || 'Open this learning resource and continue exploring VidyaSetu.'}</p>
                  <span>{gradeText(resource)} · Explore resource →</span>
                </div>
              </Link>
            )) : <div className={styles.discoveryEmpty}>Learning resources are loading. You can also open the complete Learning Library.</div>}
          </div>
          <div className={styles.sectionAction}><Link href="/learn">Open the Learning Library →</Link></div>
        </div>
      </section>

      <section className={styles.journeySection}>
        <div className={styles.shell}>
          <div className={styles.centerHeading}>
            <span>ONE CONNECTED JOURNEY</span>
            <h2>Learning does not stop at the classroom door.</h2>
            <p>VidyaSetu connects the people and opportunities around a learner without forcing every role into the same dashboard.</p>
          </div>
          <div className={styles.journeyGrid}>
            {JOURNEY.map(({ icon: Icon, step, title, copy }) => (
              <article className={styles.journeyCard} key={step}>
                <div className={styles.journeyTop}><span>{step}</span><Icon size={25} strokeWidth={1.7} /></div>
                <h3>{title}</h3><p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {(schools.length > 0 || competitions.length > 0) && (
        <section className={styles.liveSection}>
          <div className={styles.shell}>
            <div className={styles.liveGrid}>
              <div>
                <div className={styles.sectionIntro}><span>CONNECTED SCHOOLS</span><h2>See institutions already on VidyaSetu.</h2><p>Public school discovery helps families understand which institutions are already connected to the platform.</p></div>
                <div className={styles.stack}>{schools.map((school) => <article className={styles.listCard} key={school.id}><strong>{school.name}</strong><span>{[school.city, school.state, school.board].filter(Boolean).join(' · ')}</span></article>)}</div>
                <Link className={styles.inlineLink} href="/for-schools#school-directory">Browse schools →</Link>
              </div>
              <div>
                <div className={styles.sectionIntro}><span>OPPORTUNITIES</span><h2>Find competitions beyond everyday classwork.</h2><p>Published academic challenges give students another place to participate, perform and grow.</p></div>
                <div className={styles.stack}>{competitions.map((competition) => <article className={styles.listCard} key={competition.id}><strong>{competition.title}</strong><span>{competition.status?.replaceAll('_', ' ') || 'Published opportunity'}</span></article>)}</div>
                <Link className={styles.inlineLink} href="/competition">View competitions →</Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className={styles.whySection}>
        <div className={styles.shell}>
          <div className={styles.centerHeading}><span>BUILT TO BE TRUSTED</span><h2>A connected platform still needs clear boundaries.</h2><p>Public discovery stays open while personal, school and family information remains role-aware and protected.</p></div>
          <div className={styles.whyGrid}>{TRUST.map(([icon, title, copy]) => <article className={styles.whyCard} key={title}><div>{icon}</div><strong>{title}</strong><p>{copy}</p></article>)}</div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.shell}>
          <div className={styles.finalCtaInner}>
            <div><span>START WITH THE PART YOU NEED</span><h2>Learn publicly. Join when you are ready for the connected experience.</h2><p>Create an account for role-based learning, school workflows, parent visibility, Communities and participation history.</p></div>
            <div className={styles.ctaActions}><Link href="/register">Create account</Link><Link href="/login">Login</Link></div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>© 2026 VidyaSetu · Learning, schools, families, opportunities and safe education communities</footer>
    </div>
  );
}
