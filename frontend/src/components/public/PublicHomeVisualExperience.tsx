'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import ImageHero from '@/components/public/ImageHero';
import {
  getPublicCompetitions,
  getPublicLearningResources,
  getPublicSchools,
  type PublicCompetition,
  type PublicLearningResource,
  type PublicSchool,
} from '@/services/publicService';
import styles from './publicHomeVisual.module.css';

const MODULES = [
  { icon: '🎓', title: 'Students', copy: 'Learning, attendance, results, competitions and progress around one student identity.', href: '/for-students', tone: styles.blue },
  { icon: '🏫', title: 'Schools & Teachers', copy: 'Classes, academics, attendance, fees, exams and everyday school operations.', href: '/for-schools', tone: styles.green },
  { icon: '👨‍👩‍👧', title: 'Parents', copy: 'Stay connected to children, school updates, progress, messages and concerns.', href: '/for-parents', tone: styles.orange },
  { icon: '📚', title: 'Learning', copy: 'Lessons, reading, practice, question papers and skills for every learning stage.', href: '/learn', tone: styles.violet },
  { icon: '🏆', title: 'Competitions', copy: 'Discover academic challenges, register, participate and follow results.', href: '/competition', tone: styles.rose },
  { icon: '🤝', title: 'Communities', copy: 'Moderated spaces for students, families, teachers and schools to learn together.', href: '/communities', tone: styles.teal },
];

const WHY = [
  ['🛡️', 'Safe by design', 'Role-aware access keeps personal, school and family records behind authenticated workspaces.'],
  ['🔗', 'Connected, not fragmented', 'Learning, school operations and family participation share one education ecosystem.'],
  ['📈', 'Progress that travels', 'A student identity can connect learning progress with school-linked academic context.'],
  ['📱', 'Built for everyday access', 'Public discovery stays simple while authenticated tools work across modern devices.'],
  ['🇮🇳', 'Built for Indian education', 'Cross-board learning, school workflows and family participation are designed around Indian education realities.'],
];

function gradeText(resource: PublicLearningResource): string {
  if (resource.class_min && resource.class_max) return resource.class_min === resource.class_max ? `Class ${resource.class_min}` : `Classes ${resource.class_min}–${resource.class_max}`;
  return 'Multiple learning levels';
}

export default function PublicHomeVisualExperience() {
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

      <ImageHero
        image="https://images.pexels.com/photos/18012463/pexels-photo-18012463.jpeg?auto=compress&cs=tinysrgb&w=1800"
        imagePosition="68% center"
        eyebrow="India’s connected education ecosystem"
        title="Welcome to VidyaSetu — India’s Unified Education Platform"
        description="Learning, schools, families and opportunities — connected in one education ecosystem."
        theme="orange"
        actions={[
          { label: 'Explore learning', href: '/learn' },
          { label: 'Create account', href: '/register', variant: 'secondary' },
        ]}
      />

      <section className={styles.modulesSection}>
        <div className={styles.shell}>
          <div className={styles.centerHeading}>
            <span>ONE PLATFORM · MANY CONNECTIONS</span>
            <h2>Choose the part of VidyaSetu you need.</h2>
            <p>Each module has one clear role while staying connected to the same education journey.</p>
          </div>
          <div className={styles.moduleGrid}>
            {MODULES.map((module) => (
              <Link href={module.href} className={`${styles.moduleCard} ${module.tone}`} key={module.title}>
                <div className={styles.moduleIcon}>{module.icon}</div>
                <strong>{module.title}</strong>
                <p>{module.copy}</p>
                <span>Explore <b aria-hidden="true">→</b></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.discoverySection}>
        <div className={styles.shell}>
          <div className={styles.sectionIntro}>
            <span>LEARN NOW</span>
            <h2>Start with useful learning, not a long introduction.</h2>
            <p>Public Learning stays visible from the homepage so students and families can discover real resources before signing in.</p>
          </div>
          <div className={styles.discoveryGrid}>
            {learning.length > 0 ? learning.map((resource) => (
              <Link className={styles.discoveryCard} href={`/learn/resource/${resource.public_slug}`} key={resource.id}>
                <div className={styles.discoveryMeta}>{resource.subject_name || resource.subject_label || resource.category.replaceAll('_', ' ')}</div>
                <h3>{resource.title}</h3>
                <p>{resource.summary || 'Open this learning resource and continue exploring VidyaSetu.'}</p>
                <span>{gradeText(resource)} · Explore resource →</span>
              </Link>
            )) : (
              <div className={styles.discoveryEmpty}>Learning resources are loading. You can also open the complete Learning Library.</div>
            )}
          </div>
          <div className={styles.sectionAction}><Link href="/learn">Open the Learning Library →</Link></div>
        </div>
      </section>

      <section className={styles.whySection}>
        <div className={styles.shell}>
          <div className={styles.centerHeading}><span>WHY VIDYASETU</span><h2>Designed to make education easier to navigate.</h2></div>
          <div className={styles.whyGrid}>
            {WHY.map(([icon, title, copy]) => <article className={styles.whyCard} key={title}><div>{icon}</div><strong>{title}</strong><p>{copy}</p></article>)}
          </div>
        </div>
      </section>

      {(schools.length > 0 || competitions.length > 0) && (
        <section className={styles.liveSection}>
          <div className={styles.shell}>
            <div className={styles.liveGrid}>
              <div>
                <div className={styles.sectionIntro}><span>SCHOOLS</span><h2>Explore schools already connected.</h2></div>
                <div className={styles.stack}>
                  {schools.map((school) => <article className={styles.listCard} key={school.id}><strong>{school.name}</strong><span>{[school.city, school.state, school.board].filter(Boolean).join(' · ')}</span></article>)}
                </div>
                <Link className={styles.inlineLink} href="/for-schools#school-directory">Browse schools →</Link>
              </div>
              <div>
                <div className={styles.sectionIntro}><span>COMPETITIONS</span><h2>Find opportunities beyond classwork.</h2></div>
                <div className={styles.stack}>
                  {competitions.map((competition) => <article className={styles.listCard} key={competition.id}><strong>{competition.title}</strong><span>{competition.status?.replaceAll('_', ' ') || 'Published opportunity'}</span></article>)}
                </div>
                <Link className={styles.inlineLink} href="/competition">View competitions →</Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className={styles.finalCta}>
        <div className={styles.shell}>
          <div className={styles.finalCtaInner}>
            <div><span>YOUR VIDYASETU WORKSPACE</span><h2>Explore publicly. Sign in when the journey becomes personal.</h2><p>Learning can begin publicly; private academic, school and family records remain protected by role-aware authentication.</p></div>
            <div className={styles.ctaActions}><Link href="/login">Login</Link><Link href="/register">Create account</Link></div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>© 2026 VidyaSetu · Learning, schools, families, opportunities and safe education communities</footer>
    </div>
  );
}
