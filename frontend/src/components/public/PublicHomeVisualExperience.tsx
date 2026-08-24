'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Calculator,
  FileQuestion,
  FlaskConical,
  GraduationCap,
  Languages,
  Link2,
  MapPinned,
  MessageCircle,
  School,
  ShieldCheck,
  Smartphone,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
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

const HERO_SPRITE = '/images/vidyasetu-hero-sprite.jpg';

type HomeModule = {
  icon: LucideIcon;
  title: string;
  copy: string;
  href: string;
  tone: string;
  imagePosition: string;
};

const MODULES: HomeModule[] = [
  { icon: GraduationCap, title: 'Students', copy: 'Learning, attendance, results, competitions and progress around one student identity.', href: '/for-students', tone: styles.blue, imagePosition: '50% 0%' },
  { icon: School, title: 'Schools & Teachers', copy: 'Classes, academics, attendance, fees, exams and everyday school operations.', href: '/for-schools', tone: styles.green, imagePosition: '0% 50%' },
  { icon: Users, title: 'Parents', copy: 'Stay connected to children, school updates, progress, messages and concerns.', href: '/for-parents', tone: styles.orange, imagePosition: '100% 0%' },
  { icon: BookOpen, title: 'Learning', copy: 'Lessons, reading, practice, question papers and skills for every learning stage.', href: '/learn', tone: styles.violet, imagePosition: '50% 50%' },
  { icon: Trophy, title: 'Competitions', copy: 'Discover academic challenges, register, participate and follow results.', href: '/competition', tone: styles.rose, imagePosition: '100% 50%' },
  { icon: MessageCircle, title: 'Communities', copy: 'Moderated spaces for students, families, teachers and schools to learn together.', href: '/communities', tone: styles.teal, imagePosition: '0% 100%' },
];

const WHY: Array<{ icon: LucideIcon; title: string; copy: string }> = [
  { icon: ShieldCheck, title: 'Safe by design', copy: 'Role-aware access keeps personal, school and family records behind authenticated workspaces.' },
  { icon: Link2, title: 'Connected, not fragmented', copy: 'Learning, school operations and family participation share one education ecosystem.' },
  { icon: BarChart3, title: 'Progress that travels', copy: 'A student identity can connect learning progress with school-linked academic context.' },
  { icon: Smartphone, title: 'Built for everyday access', copy: 'Public discovery stays simple while authenticated tools work across modern devices.' },
  { icon: MapPinned, title: 'Built for Indian education', copy: 'Cross-board learning, school workflows and family participation are designed around Indian education realities.' },
];

const DISCOVERY_TONES = [styles.discoveryBlue, styles.discoveryGreen, styles.discoveryOrange];

function gradeText(resource: PublicLearningResource): string {
  if (resource.class_min && resource.class_max) return resource.class_min === resource.class_max ? `Class ${resource.class_min}` : `Classes ${resource.class_min}–${resource.class_max}`;
  return 'Multiple learning levels';
}

function resourceVisual(resource: PublicLearningResource): { icon: LucideIcon; label: string } {
  const subject = (resource.subject_name || resource.subject_label || resource.category || '').toLowerCase();
  const type = (resource.resource_type || '').toLowerCase();
  if (subject.includes('math')) return { icon: Calculator, label: 'Mathematics' };
  if (subject.includes('science')) return { icon: FlaskConical, label: 'Science' };
  if (subject.includes('english') || subject.includes('language')) return { icon: Languages, label: resource.subject_name || resource.subject_label || 'Language' };
  if (type.includes('question') || type.includes('paper') || type.includes('practice')) return { icon: FileQuestion, label: 'Practice' };
  return { icon: ArrowUpRight, label: resource.subject_name || resource.subject_label || resource.category.replaceAll('_', ' ') };
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
        image={HERO_SPRITE}
        imageSize="300% 300%"
        imagePosition="0% 0%"
        eyebrow="India’s connected education ecosystem"
        title="Welcome to VidyaSetu"
        description="India’s unified education platform for learning, schools and families."
        theme="orange"
        actions={[
          { label: 'Explore platform', href: '#platform-modules' },
          { label: 'Learn more', href: '/learn', variant: 'secondary' },
        ]}
      />

      <section className={styles.modulesSection} id="platform-modules">
        <div className={styles.shell}>
          <div className={styles.centerHeading}>
            <span>ONE PLATFORM · MANY CONNECTIONS</span>
            <h2>Choose the part of VidyaSetu you need.</h2>
            <p>Each module has one clear role while staying connected to the same education journey.</p>
          </div>
          <div className={styles.moduleGrid}>
            {MODULES.map((module) => {
              const ModuleIcon = module.icon;
              return (
                <Link href={module.href} className={`${styles.moduleCard} ${module.tone}`} key={module.title}>
                  <div
                    className={styles.moduleMedia}
                    style={{ backgroundImage: `url(${HERO_SPRITE})`, backgroundSize: '300% 300%', backgroundPosition: module.imagePosition }}
                    aria-hidden="true"
                  >
                    <span className={styles.moduleIcon}><ModuleIcon size={25} strokeWidth={2} /></span>
                  </div>
                  <div className={styles.moduleBody}>
                    <strong>{module.title}</strong>
                    <p>{module.copy}</p>
                    <span>Explore <b aria-hidden="true">→</b></span>
                  </div>
                </Link>
              );
            })}
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
            {learning.length > 0 ? learning.map((resource, index) => {
              const visual = resourceVisual(resource);
              const VisualIcon = visual.icon;
              return (
                <Link className={`${styles.discoveryCard} ${DISCOVERY_TONES[index % DISCOVERY_TONES.length]}`} href={`/learn/resource/${resource.public_slug}`} key={resource.id}>
                  <div className={styles.discoveryVisual}>
                    <span className={styles.discoveryGlyph}><VisualIcon size={34} strokeWidth={1.8} /></span>
                    <span className={styles.discoveryVisualLabel}>{visual.label}</span>
                  </div>
                  <div className={styles.discoveryBody}>
                    <div className={styles.discoveryMeta}>{resource.subject_name || resource.subject_label || resource.category.replaceAll('_', ' ')}</div>
                    <h3>{resource.title}</h3>
                    <p>{resource.summary || 'Open this learning resource and continue exploring VidyaSetu.'}</p>
                    <span>{gradeText(resource)} · Explore resource →</span>
                  </div>
                </Link>
              );
            }) : (
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
            {WHY.map(({ icon: WhyIcon, title, copy }) => <article className={styles.whyCard} key={title}><div className={styles.whyIcon}><WhyIcon size={25} strokeWidth={1.9} /></div><strong>{title}</strong><p>{copy}</p></article>)}
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
