'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import ImageHero from '@/components/public/ImageHero';
import {
  getPublicSchools,
  type PublicSchool,
} from '@/services/publicService';
import styles from './publicExperience.module.css';
import visualStyles from './publicModuleVisual.module.css';

type MetricKey = 'students' | 'schools' | 'teachers' | 'parents' | 'groups' | 'competitions';
type PublicRole = 'student' | 'parent' | 'school' | 'teacher' | 'admin';
type HeroTheme = 'orange' | 'blue' | 'green' | 'violet' | 'teal' | 'rose';

export interface ModuleCapability { icon: string; title: string; description: string; bullets: string[]; }
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
  heroImage: string;
  heroTheme?: HeroTheme;
  heroImagePosition?: string;
  secondaryLogin?: { role: PublicRole; label: string };
  schoolDirectory?: boolean;
}

const QUICK_TONES = [visualStyles.quickBlue, visualStyles.quickGreen, visualStyles.quickOrange, visualStyles.quickViolet, visualStyles.quickRose, visualStyles.quickTeal];

export default function PublicModulePage({ config }: { config: PublicModuleConfig }) {
  const [schools, setSchools] = useState<PublicSchool[]>([]);
  const [query, setQuery] = useState('');
  const [loadingSchools, setLoadingSchools] = useState(Boolean(config.schoolDirectory));

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
        image={config.heroImage}
        imagePosition={config.heroImagePosition}
        eyebrow={config.eyebrow}
        title={`${config.title} ${config.accentTitle}`}
        description={config.summary}
        theme={config.heroTheme || 'orange'}
        actions={[
          { label: config.loginTitle, href: loginHref },
          { label: 'Explore this module', href: '#module-capabilities', variant: 'secondary' },
        ]}
      />

      <section className={visualStyles.quickSection} aria-label={`${config.audience} highlights`}>
        <div className={styles.shell}>
          <div className={visualStyles.quickGrid}>
            {config.capabilities.slice(0, 6).map((capability, index) => (
              <a className={`${visualStyles.quickCard} ${QUICK_TONES[index % QUICK_TONES.length]}`} href="#module-capabilities" key={capability.title}>
                <div className={visualStyles.quickIcon}>{capability.icon}</div>
                <strong>{capability.title}</strong>
                <p>{capability.description}</p>
                <span>Explore <b aria-hidden="true">→</b></span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <div className={styles.loginRibbon}>
        <div>
          <strong>Already part of VidyaSetu?</strong>
          <div className={styles.muted}>{config.loginText}</div>
        </div>
        <div className={styles.twoActions}>
          <Link className={styles.primary} href={loginHref}>{config.loginTitle}</Link>
          {config.secondaryLogin && <Link className={styles.lightButton} href={`/login?role=${config.secondaryLogin.role}`}>{config.secondaryLogin.label}</Link>}
        </div>
      </div>

      <section className={styles.section} id="module-capabilities">
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>Everything {config.audience} need in one connected place</h2>
            <p>The hero introduces the module once. The sections below focus on what users can actually do after they sign in.</p>
          </div>
          <div className={styles.capGrid}>
            {config.capabilities.map((capability) => (
              <article className={styles.capCard} key={capability.title}>
                <div className={styles.capIcon}>{capability.icon}</div>
                <h3>{capability.title}</h3>
                <p>{capability.description}</p>
                <ul className={styles.bulletList}>{capability.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.sectionAlt}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>How the experience works</h2>
            <p>Public pages explain the platform. Personal records, school actions and family information remain protected inside the authenticated role workspace.</p>
          </div>
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
                    <div className={styles.schoolTop}>
                      <div>
                        <div className={styles.schoolName}>{school.name}</div>
                        <div className={styles.schoolMeta}>{[school.city, school.district, school.state].filter(Boolean).join(' · ')}</div>
                        <div className={styles.schoolMeta}>{school.board || 'Board not listed'} · Academic year {school.academicYear}</div>
                      </div>
                      {school.isUdiseLinked && <span className={styles.badge}>UDISE linked</span>}
                    </div>
                    <div className={styles.miniStats}>
                      <div className={styles.miniStat}><strong>{school.students}</strong><span>Students</span></div>
                      <div className={styles.miniStat}><strong>{school.teachers}</strong><span>Teachers</span></div>
                      <div className={styles.miniStat}><strong>{school.classes}</strong><span>Classes</span></div>
                    </div>
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
          <div className={styles.cta}>
            <div><h2>Explore publicly. Sign in for your own records and actions.</h2><p>Use the role dashboard to access personal learning data, school operations, family records, Communities and support workflows.</p></div>
            <div className={styles.twoActions}><Link className={styles.lightButton} href={loginHref}>{config.loginTitle}</Link><Link className={styles.secondary} href="/register">Create an account</Link></div>
          </div>
        </div>
      </section>
      <footer className={styles.footer}>© 2026 VidyaSetu · Learning, schools, families, Competitions, Communities and accountable support</footer>
    </div>
  );
}
