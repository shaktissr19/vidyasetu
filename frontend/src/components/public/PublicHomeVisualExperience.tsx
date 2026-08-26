'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, type ComponentType } from 'react';
import {
  BookOpen,
  Building2,
  GraduationCap,
  Link2,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import ImageHero from '@/components/public/ImageHero';
import SubjectVisual from '@/components/public/SubjectVisual';
import { HERO_IMAGES, HERO_POSITIONS, MODULE_IMAGES } from '@/components/public/heroAssets';
import {
  getPublicCompetitions,
  getPublicLearningResources,
  getPublicSchools,
  type PublicCompetition,
  type PublicLearningResource,
  type PublicSchool,
} from '@/services/publicService';
import styles from './publicHomeVisual.module.css';

type IconType = ComponentType<{ size?: number; strokeWidth?: number }>;

const CORE_BENEFITS: Array<{ icon: IconType; title: string; copy: string; tone: string }> = [
  { icon: BookOpen, title: 'Learning in one place', copy: 'Lessons, practice, reading, question papers and life skills organised around the learner.', tone: styles.benefitBlue },
  { icon: Building2, title: 'Connected schools', copy: 'Bring academics, attendance, teachers and everyday school operations into one clearer workspace.', tone: styles.benefitGreen },
  { icon: Users, title: 'Parents stay informed', copy: 'Keep families closer to progress, school communication and the student journey.', tone: styles.benefitOrange },
  { icon: Trophy, title: 'Beyond the classroom', copy: 'Open access to competitions, communities and opportunities that help learners grow further.', tone: styles.benefitViolet },
];

const MODULES = [
  { title: 'Students', copy: 'Learn, practise, track progress and stay connected to school.', href: '/for-students', tone: styles.blue, image: MODULE_IMAGES.student, imagePosition: 'center' },
  { title: 'Schools & Teachers', copy: 'Manage academics, attendance, classrooms and daily operations.', href: '/for-schools', tone: styles.green, image: MODULE_IMAGES.school, imagePosition: 'center' },
  { title: 'Parents', copy: 'Follow progress, school updates, communication and concerns.', href: '/for-parents', tone: styles.orange, image: MODULE_IMAGES.parent, imagePosition: 'center' },
  { title: 'Learning', copy: 'Explore lessons, practice, reading, question papers and skills.', href: '/learn', tone: styles.violet, image: MODULE_IMAGES.learn, imagePosition: 'center' },
  { title: 'Competitions', copy: 'Discover academic opportunities, participate and follow results.', href: '/competition', tone: styles.rose, image: MODULE_IMAGES.competition, imagePosition: 'center' },
  { title: 'Communities', copy: 'Learn and discuss in moderated education-focused spaces.', href: '/communities', tone: styles.teal, image: MODULE_IMAGES.communities, imagePosition: 'center' },
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
        variant="home"
        image={HERO_IMAGES.home}
        imagePosition={HERO_POSITIONS.home}
        eyebrow="India’s connected education platform"
        title="One connected platform for learning, schools and families."
        description="VidyaSetu brings student learning, school operations, parent visibility, competitions and education communities into one trusted ecosystem."
        theme="orange"
        actions={[
          { label: 'Explore VidyaSetu', href: '#why-vidyasetu' },
          { label: 'Start learning', href: '/learn', variant: 'secondary' },
        ]}
      >
        <div className={styles.heroBenefits} aria-label="VidyaSetu benefits">
          <span>Learn & practise by class</span>
          <span>Run school academics & operations</span>
          <span>Keep families connected</span>
        </div>
      </ImageHero>

      <section className={styles.benefitsSection} id="why-vidyasetu">
        <div className={styles.shell}>
          <div className={styles.sectionIntroCompact}>
            <span>WHY VIDYASETU</span>
            <h2>Education works better when the pieces work together.</h2>
            <p>Instead of separate tools for learning, school work and family communication, VidyaSetu connects the parts of the journey that matter every day.</p>
          </div>
          <div className={styles.benefitGrid}>
            {CORE_BENEFITS.map(({ icon: Icon, title, copy, tone }) => (
              <article className={`${styles.benefitCard} ${tone}`} key={title}>
                <div className={styles.benefitIcon}><Icon size={25} strokeWidth={1.8} /></div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.modulesSection} id="platform-modules">
        <div className={styles.shell}>
          <div className={styles.centerHeading}>
            <span>WHO VIDYASETU IS FOR</span>
            <h2>One platform. A clear space for every role.</h2>
            <p>Students, schools, teachers and families use different tools while staying connected to the same education journey.</p>
          </div>
          <div className={styles.moduleGrid}>
            {MODULES.map((module) => (
              <Link href={module.href} className={`${styles.moduleCard} ${module.tone}`} key={module.title}>
                <div className={styles.moduleMedia} aria-hidden="true">
                  <Image src={module.image} alt="" fill sizes="(max-width: 600px) 100vw, (max-width: 980px) 50vw, 33vw" style={{ objectFit: 'cover', objectPosition: module.imagePosition }} />
                  <span className={styles.moduleImageLabel}>{module.title}</span>
                </div>
                <div className={styles.moduleBody}>
                  <strong>{module.title}</strong>
                  <p>{module.copy}</p>
                  <span>Explore <b aria-hidden="true">→</b></span>
                </div>
              </Link>
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
            )) : (
              <div className={styles.discoveryEmpty}>Learning resources are loading. You can also open the complete Learning Library.</div>
            )}
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
                <h3>{title}</h3>
                <p>{copy}</p>
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
                <div className={styles.stack}>
                  {schools.map((school) => <article className={styles.listCard} key={school.id}><strong>{school.name}</strong><span>{[school.city, school.state, school.board].filter(Boolean).join(' · ')}</span></article>)}
                </div>
                <Link className={styles.inlineLink} href="/for-schools#school-directory">Browse schools →</Link>
              </div>
              <div>
                <div className={styles.sectionIntro}><span>OPPORTUNITIES</span><h2>Find competitions beyond everyday classwork.</h2><p>Published academic challenges give students another place to participate, perform and grow.</p></div>
                <div className={styles.stack}>
                  {competitions.map((competition) => <article className={styles.listCard} key={competition.id}><strong>{competition.title}</strong><span>{competition.status?.replaceAll('_', ' ') || 'Published opportunity'}</span></article>)}
                </div>
                <Link className={styles.inlineLink} href="/competition">View competitions →</Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className={styles.whySection}>
        <div className={styles.shell}>
          <div className={styles.centerHeading}><span>BUILT TO BE TRUSTED</span><h2>A connected platform still needs clear boundaries.</h2><p>Public discovery stays open while personal, school and family information remains role-aware and protected.</p></div>
          <div className={styles.whyGrid}>
            {TRUST.map(([icon, title, copy]) => <article className={styles.whyCard} key={title}><div>{icon}</div><strong>{title}</strong><p>{copy}</p></article>)}
          </div>
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
