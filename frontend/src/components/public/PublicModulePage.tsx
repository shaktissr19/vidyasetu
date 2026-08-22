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

export interface ModuleCapability {
  icon: string;
  title: string;
  description: string;
  bullets: string[];
}

export interface ModuleStep {
  title: string;
  description: string;
}

export interface ModuleProof {
  icon: string;
  title: string;
  description: string;
}

export interface ModuleMetric {
  key: MetricKey;
  label: string;
}

export interface PublicModuleConfig {
  eyebrow: string;
  title: string;
  accentTitle: string;
  summary: string;
  audience: string;
  loginRole: 'student' | 'parent' | 'school' | 'teacher' | 'admin';
  metrics: ModuleMetric[];
  capabilities: ModuleCapability[];
  steps: ModuleStep[];
  proofTitle: string;
  proofIntro: string;
  proofs: ModuleProof[];
  loginTitle: string;
  loginText: string;
  secondaryLogin?: { role: 'student' | 'parent' | 'school' | 'teacher' | 'admin'; label: string };
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

  useEffect(() => {
    let active = true;
    getPublicOverview()
      .then((response) => { if (active) setOverview(response.data.data); })
      .catch(() => { if (active) setOverview(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!config.schoolDirectory) return;
    let active = true;
    setLoadingSchools(true);
    getPublicSchools()
      .then((response) => { if (active) setSchools(response.data.data || []); })
      .catch(() => { if (active) setSchools([]); })
      .finally(() => { if (active) setLoadingSchools(false); });
    return () => { active = false; };
  }, [config.schoolDirectory]);

  const filteredSchools = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return schools;
    return schools.filter((school) => [
      school.name,
      school.nameHi,
      school.board,
      school.city,
      school.district,
      school.state,
    ].some((value) => value?.toLowerCase().includes(search)));
  }, [query, schools]);

  const loginHref = `/login?role=${config.loginRole}`;

  return (
    <div className={styles.page}>
      <GlobalTopbar />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div>
            <div className={styles.eyebrow}>{config.eyebrow}</div>
            <h1 className={styles.heroTitle}>
              {config.title}<br /><span className={styles.accent}>{config.accentTitle}</span>
            </h1>
            <p className={styles.heroCopy}>{config.summary}</p>
            <div className={styles.heroActions}>
              <Link className={styles.primary} href={loginHref}>Login to your dashboard</Link>
              <Link className={styles.secondary} href="/">Explore VidyaSetu Home</Link>
            </div>
          </div>

          <div>
            <div className={styles.statGrid}>
              {config.metrics.map((metric) => (
                <div className={styles.statCard} key={metric.key}>
                  <div className={styles.statValue}>{metricValue(overview, metric.key)}</div>
                  <div className={styles.statLabel}>{metric.label}</div>
                </div>
              ))}
            </div>
            <div className={styles.liveNote}>
              <span className={styles.liveDot} /> Live aggregate counts from the VidyaSetu database
            </div>
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
          {config.secondaryLogin && (
            <Link className={styles.lightButton} href={`/login?role=${config.secondaryLogin.role}`}>
              {config.secondaryLogin.label}
            </Link>
          )}
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>What VidyaSetu does for {config.audience}</h2>
            <p>These are functional areas backed by the current VidyaSetu application—not placeholder marketing cards.</p>
          </div>
          <div className={styles.capGrid}>
            {config.capabilities.map((capability) => (
              <article className={styles.capCard} key={capability.title}>
                <div className={styles.capIcon}>{capability.icon}</div>
                <h3>{capability.title}</h3>
                <p>{capability.description}</p>
                <ul className={styles.bulletList}>
                  {capability.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.sectionAlt}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>How the experience works end to end</h2>
            <p>Public pages explain the capability. Personal records and operational actions remain protected inside the authenticated dashboard.</p>
          </div>
          <div className={styles.steps}>
            {config.steps.map((step) => (
              <article className={styles.step} key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>{config.proofTitle}</h2>
            <p>{config.proofIntro}</p>
          </div>
          <div className={styles.proofGrid}>
            {config.proofs.map((proof) => (
              <article className={styles.proof} key={proof.title}>
                <span>{proof.icon}</span>
                <div>
                  <strong>{proof.title}</strong>
                  <p>{proof.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {config.schoolDirectory && (
        <section className={styles.sectionAlt} id="school-directory">
          <div className={styles.shell}>
            <div className={styles.sectionHeader}>
              <h2>Schools currently on VidyaSetu</h2>
              <p>This directory uses active school records from the production data model and only exposes safe institution-level information.</p>
            </div>
            <div className={styles.directoryTools}>
              <input
                className={styles.search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by school, board, district or state"
                aria-label="Search VidyaSetu schools"
              />
            </div>

            {loadingSchools ? (
              <div className={styles.empty}>Loading active schools…</div>
            ) : filteredSchools.length === 0 ? (
              <div className={styles.empty}>No active school matches this search.</div>
            ) : (
              <div className={styles.schoolGrid}>
                {filteredSchools.map((school) => (
                  <article className={styles.schoolCard} key={school.id}>
                    <div className={styles.schoolTop}>
                      <div>
                        <div className={styles.schoolName}>{school.name}</div>
                        <div className={styles.schoolMeta}>
                          {[school.city, school.district, school.state].filter(Boolean).join(' · ')}
                        </div>
                        <div className={styles.schoolMeta}>
                          {school.board || 'Board not listed'} · Academic year {school.academicYear}
                        </div>
                      </div>
                      {school.isUdiseLinked && <span className={styles.badge}>UDISE linked</span>}
                    </div>
                    <div className={styles.miniStats}>
                      <div className={styles.miniStat}><strong>{school.students}</strong><span>Students</span></div>
                      <div className={styles.miniStat}><strong>{school.teachers}</strong><span>Teachers</span></div>
                      <div className={styles.miniStat}><strong>{school.classes}</strong><span>Classes</span></div>
                    </div>
                    {school.website && (
                      <a className={styles.smallLink} href={school.website} target="_blank" rel="noreferrer">Visit school website</a>
                    )}
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
            <div>
              <h2>Public information first. Personal details after login.</h2>
              <p>Sign in to access records, actions, messages and dashboard-specific information for your role.</p>
            </div>
            <div className={styles.twoActions}>
              <Link className={styles.lightButton} href={loginHref}>{config.loginTitle}</Link>
              <Link className={styles.secondary} href="/register">Create an account</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>© 2026 VidyaSetu · Connected learning, school operations and family visibility</footer>
    </div>
  );
}
