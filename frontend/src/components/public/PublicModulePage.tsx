'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import {
  getPublicOverview,
  getPublicSchools,
  type PublicOverview,
  type PublicSchool,
} from '@/services/publicService';
import styles from './publicExperience.module.css';

type MetricKey = 'students' | 'schools' | 'teachers' | 'parents' | 'groups' | 'competitions';
type PublicRole = 'student' | 'parent' | 'school' | 'teacher' | 'admin';

const HERO_PALETTES: Record<PublicRole, { eyebrowBg: string; eyebrowBorder: string; eyebrowText: string; stats: string[] }> = {
  student: { eyebrowBg: 'rgba(70,154,255,.16)', eyebrowBorder: 'rgba(115,183,255,.42)', eyebrowText: '#b9dcff', stats: ['rgba(50,129,219,.26)','rgba(69,177,173,.24)','rgba(117,92,208,.24)','rgba(230,150,45,.22)'] },
  parent: { eyebrowBg: 'rgba(255,129,72,.15)', eyebrowBorder: 'rgba(255,151,101,.46)', eyebrowText: '#ffc19b', stats: ['rgba(200,102,156,.24)','rgba(65,153,209,.24)','rgba(72,174,139,.23)','rgba(228,156,54,.22)'] },
  school: { eyebrowBg: 'rgba(53,178,137,.15)', eyebrowBorder: 'rgba(93,203,165,.42)', eyebrowText: '#a9edd4', stats: ['rgba(55,154,128,.24)','rgba(54,121,203,.24)','rgba(218,143,45,.22)','rgba(126,95,201,.23)'] },
  teacher: { eyebrowBg: 'rgba(82,186,207,.15)', eyebrowBorder: 'rgba(113,211,226,.42)', eyebrowText: '#b8eef5', stats: ['rgba(51,156,186,.24)','rgba(115,91,205,.23)','rgba(63,164,125,.23)','rgba(229,143,56,.22)'] },
  admin: { eyebrowBg: 'rgba(126,108,218,.16)', eyebrowBorder: 'rgba(153,137,237,.44)', eyebrowText: '#d3caff', stats: ['rgba(91,79,192,.25)','rgba(50,137,204,.24)','rgba(70,164,130,.23)','rgba(222,139,54,.22)'] },
};

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
  secondaryLogin?: { role: PublicRole; label: string };
  schoolDirectory?: boolean;
}

function metricValue(overview: PublicOverview | null, key: MetricKey): string {
  if (!overview) return '—';
  return new Intl.NumberFormat('en-IN').format(overview[key]);
}

export default function PublicModulePage({ config }: { config: PublicModuleConfig }) {
  const [overview, setOverview] = useState<PublicOverview | null>(null);
  const [schools, setSchools] = useState<PublicSchool[]>([]);
  const [query, setQuery] = useState('');
  const [loadingSchools, setLoadingSchools] = useState(Boolean(config.schoolDirectory));
  const palette = HERO_PALETTES[config.loginRole];

  useEffect(() => {
    let active = true;
    getPublicOverview().then((response) => { if (active) setOverview(response.data.data); }).catch(() => { if (active) setOverview(null); });
    return () => { active = false; };
  }, []);

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
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div>
            <div className={styles.eyebrow} style={{ background: palette.eyebrowBg, borderColor: palette.eyebrowBorder, color: palette.eyebrowText }}>{config.eyebrow}</div>
            <h1 className={styles.heroTitle}>{config.title}<br /><span className={styles.accent}>{config.accentTitle}</span></h1>
            <p className={styles.heroCopy}>{config.summary}</p>
            <div className={styles.heroActions}><Link className={styles.primary} href={loginHref}>Login to your dashboard</Link><Link className={styles.secondary} href="/">Explore VidyaSetu Home</Link></div>
          </div>
          <div>
            <div className={styles.statGrid}>
              {config.metrics.map((metric, index) => <div className={styles.statCard} key={metric.key} style={{ background: palette.stats[index % palette.stats.length] }}><div className={styles.statValue}>{metricValue(overview, metric.key)}</div><div className={styles.statLabel}>{metric.label}</div></div>)}
            </div>
            <div className={styles.liveNote}><span className={styles.liveDot} /> Live aggregate counts from VidyaSetu</div>
          </div>
        </div>
      </section>

      <div className={styles.loginRibbon}><div><strong>Already part of VidyaSetu?</strong><div className={styles.muted}>{config.loginText}</div></div><div className={styles.twoActions}><Link className={styles.primary} href={loginHref}>{config.loginTitle}</Link>{config.secondaryLogin && <Link className={styles.lightButton} href={`/login?role=${config.secondaryLogin.role}`}>{config.secondaryLogin.label}</Link>}</div></div>

      <section className={styles.section}><div className={styles.shell}><div className={styles.sectionHeader}><h2>How VidyaSetu helps {config.audience}</h2><p>Explore the practical capabilities that connect learning, school operations and family participation across the platform.</p></div><div className={styles.capGrid}>{config.capabilities.map((capability) => <article className={styles.capCard} key={capability.title}><div className={styles.capIcon}>{capability.icon}</div><h3>{capability.title}</h3><p>{capability.description}</p><ul className={styles.bulletList}>{capability.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul></article>)}</div></div></section>

      <section className={styles.sectionAlt}><div className={styles.shell}><div className={styles.sectionHeader}><h2>How the experience works</h2><p>Public pages explain the platform. Personal records, school actions and family information remain protected inside the authenticated role workspace.</p></div><div className={styles.steps}>{config.steps.map((step) => <article className={styles.step} key={step.title}><h3>{step.title}</h3><p>{step.description}</p></article>)}</div></div></section>

      <section className={styles.section}><div className={styles.shell}><div className={styles.sectionHeader}><h2>{config.proofTitle}</h2><p>{config.proofIntro}</p></div><div className={styles.proofGrid}>{config.proofs.map((proof) => <article className={styles.proof} key={proof.title}><span>{proof.icon}</span><div><strong>{proof.title}</strong><p>{proof.description}</p></div></article>)}</div></div></section>

      {config.schoolDirectory && <section className={styles.sectionAlt} id="school-directory"><div className={styles.shell}><div className={styles.sectionHeader}><h2>Schools currently on VidyaSetu</h2><p>Browse active institution records by school name, board, district or state. Only safe institution-level information is shown publicly.</p></div><div className={styles.directoryTools}><input className={styles.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by school, board, district or state" aria-label="Search VidyaSetu schools" /></div>{loadingSchools ? <div className={styles.empty}>Loading active schools…</div> : filteredSchools.length === 0 ? <div className={styles.empty}>No active school matches this search.</div> : <div className={styles.schoolGrid}>{filteredSchools.map((school) => <article className={styles.schoolCard} key={school.id}><div className={styles.schoolTop}><div><div className={styles.schoolName}>{school.name}</div><div className={styles.schoolMeta}>{[school.city, school.district, school.state].filter(Boolean).join(' · ')}</div><div className={styles.schoolMeta}>{school.board || 'Board not listed'} · Academic year {school.academicYear}</div></div>{school.isUdiseLinked && <span className={styles.badge}>UDISE linked</span>}</div><div className={styles.miniStats}><div className={styles.miniStat}><strong>{school.students}</strong><span>Students</span></div><div className={styles.miniStat}><strong>{school.teachers}</strong><span>Teachers</span></div><div className={styles.miniStat}><strong>{school.classes}</strong><span>Classes</span></div></div>{school.website && <a className={styles.smallLink} href={school.website} target="_blank" rel="noreferrer">Visit school website</a>}</article>)}</div>}</div></section>}

      <section className={styles.section}><div className={styles.shell}><div className={styles.cta}><div><h2>Explore publicly. Sign in for your own records and actions.</h2><p>Use the role dashboard to access personal learning data, school operations, family records, Communities and support workflows.</p></div><div className={styles.twoActions}><Link className={styles.lightButton} href={loginHref}>{config.loginTitle}</Link><Link className={styles.secondary} href="/register">Create an account</Link></div></div></div></section>
      <footer className={styles.footer}>© 2026 VidyaSetu · Learning, schools, families, Competitions, Communities and accountable support</footer>
    </div>
  );
}
