'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import {
  getPublicLearningOverview,
  getPublicLearningResources,
  getPublicLearningSources,
  type LearningCategory,
  type PublicLearningOverview,
  type PublicLearningResource,
  type PublicLearningSource,
} from '@/services/publicService';
import styles from './publicLearning.module.css';

const CATEGORY_META: Record<LearningCategory, { label: string; icon: string }> = {
  ACADEMIC: { label: 'Academic Learning', icon: '📚' },
  MOTIVATION: { label: 'Motivation', icon: '🌱' },
  STUDY_SKILLS: { label: 'Study Skills', icon: '🎯' },
  WORK_ETHIC: { label: 'Work Ethic', icon: '🧭' },
  SOCIAL_RESPONSIBILITY: { label: 'Social Responsibility', icon: '🤝' },
  LIFE_SKILLS: { label: 'Life Skills', icon: '🛠️' },
  WELLBEING: { label: 'Well-being', icon: '🌤️' },
  CAREER_AWARENESS: { label: 'Career Awareness', icon: '🧑‍🚀' },
  DIGITAL_CITIZENSHIP: { label: 'Digital Citizenship', icon: '💻' },
};

function resourceIcon(resource: PublicLearningResource): string {
  if (resource.resource_type === 'VIDEO') return '🎥';
  if (resource.resource_type === 'AUDIO') return '🎧';
  if (resource.resource_type === 'PDF') return '📄';
  if (resource.resource_type === 'WORKSHEET') return '📝';
  if (resource.resource_type === 'QUESTION_PAPER') return '📋';
  if (resource.resource_type === 'QUIZ') return '✅';
  if (resource.resource_type === 'INTERACTIVE') return '🧩';
  if (resource.resource_type === 'EXTERNAL_LINK') return '🔗';
  return CATEGORY_META[resource.category]?.icon || '📘';
}

export default function PublicLearningLibrary() {
  const [overview, setOverview] = useState<PublicLearningOverview | null>(null);
  const [resources, setResources] = useState<PublicLearningResource[]>([]);
  const [sources, setSources] = useState<PublicLearningSource[]>([]);
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [category, setCategory] = useState<LearningCategory | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      getPublicLearningOverview(),
      getPublicLearningSources(),
    ]).then(([overviewResult, sourceResult]) => {
      if (!active) return;
      if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value.data.data);
      if (sourceResult.status === 'fulfilled') setSources(sourceResult.value.data.data || []);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getPublicLearningResources({
      class: selectedClass || undefined,
      category: category === 'ALL' ? undefined : category,
      limit: 60,
    })
      .then((response) => { if (active) setResources(response.data.data || []); })
      .catch(() => { if (active) setResources([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedClass, category]);

  const categories = useMemo(() => {
    const fromApi = overview?.categories?.map((item) => item.category) || [];
    return Array.from(new Set(fromApi));
  }, [overview]);

  const nroer = sources.find((source) => source.code === 'NROER');
  const original = sources.find((source) => source.code === 'VIDYASETU_ORIGINAL');

  return (
    <div className={styles.page}>
      <GlobalTopbar />

      <section className={styles.hero}>
        <div className={`${styles.shell} ${styles.heroGrid}`}>
          <div>
            <div className={styles.kicker}>VidyaSetu Learning · Classes 1–12 · Cross-board</div>
            <h1 className={styles.title}>Learn. Practise. Grow.<br /><span className={styles.accent}>Beyond just the textbook.</span></h1>
            <p className={styles.copy}>
              A growing public and student learning library for Indian school learners: original VidyaSetu lessons,
              open educational resources, videos, reading, practice, question papers, study skills, motivation,
              work ethic, social responsibility and life skills—designed to work across boards rather than around one board only.
            </p>
            <div className={styles.actions}>
              <a className={styles.primary} href="#browse">Browse free learning</a>
              <Link className={styles.secondary} href="/login?role=student">Student login</Link>
            </div>
          </div>
          <aside className={styles.heroVisual}>
            <div className={styles.visualTitle}>A complete learning journey</div>
            <div className={styles.visualGrid}>
              <div className={styles.visualCard}><span>🎥</span><strong>Watch concept lessons</strong></div>
              <div className={styles.visualCard}><span>📖</span><strong>Read clear explanations</strong></div>
              <div className={styles.visualCard}><span>📝</span><strong>Practise and test yourself</strong></div>
              <div className={styles.visualCard}><span>🌱</span><strong>Build habits and confidence</strong></div>
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.sectionAlt} id="browse">
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>Browse learning by class</h2>
            <p>Public resources can be explored without login. Signed-in students will later receive the full learning path automatically from their class, school and configured board.</p>
          </div>
          <div className={styles.classGrid}>
            {(overview?.classes || Array.from({ length: 12 }, (_, index) => ({ className: index + 1, resourceCount: 0 }))).map((item) => (
              <button
                key={item.className}
                type="button"
                className={`${styles.classButton} ${selectedClass === item.className ? styles.classActive : ''}`}
                onClick={() => setSelectedClass((current) => current === item.className ? null : item.className)}
              >
                Class {item.className}
                <span className={styles.classCount}>{item.resourceCount} public</span>
              </button>
            ))}
          </div>

          <div className={styles.filterRow}>
            <button className={`${styles.filter} ${category === 'ALL' ? styles.filterActive : ''}`} onClick={() => setCategory('ALL')}>All</button>
            {categories.map((item) => (
              <button key={item} className={`${styles.filter} ${category === item ? styles.filterActive : ''}`} onClick={() => setCategory(item)}>
                {CATEGORY_META[item]?.icon} {CATEGORY_META[item]?.label || item.replaceAll('_', ' ')}
              </button>
            ))}
          </div>

          {loading ? (
            <div className={styles.empty}>Loading public learning resources…</div>
          ) : resources.length === 0 ? (
            <div className={styles.empty}>No public resources match this filter yet. The catalogue is designed to expand class by class and board by board.</div>
          ) : (
            <div className={styles.resourceGrid}>
              {resources.map((resource) => (
                <Link href={`/learn/resource/${resource.public_slug}`} className={styles.resourceCard} key={resource.id}>
                  <div className={styles.cardTop}>
                    <span className={styles.icon}>{resourceIcon(resource)}</span>
                    <span className={styles.badge}>{CATEGORY_META[resource.category]?.label || resource.category.replaceAll('_', ' ')}</span>
                  </div>
                  <h3>{resource.title}</h3>
                  <p>{resource.summary || 'Open this resource to continue learning.'}</p>
                  <div className={styles.meta}>
                    {resource.class_min ? `Classes ${resource.class_min}${resource.class_max && resource.class_max !== resource.class_min ? `–${resource.class_max}` : ''}` : 'All learners'} · {resource.source_name}
                  </div>
                  <div className={styles.pillRow}>
                    {(resource.board_codes || []).slice(0, 3).map((board) => <span className={styles.pill} key={board}>{board}</span>)}
                    <span className={styles.pill}>{resource.resource_type.replaceAll('_', ' ')}</span>
                  </div>
                  <span className={styles.read}>Read / explore →</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>Academic learning and human development belong together</h2>
            <p>VidyaSetu will teach syllabus content, but it will also help learners build the habits and values needed to keep learning, work responsibly and participate positively in society.</p>
          </div>
          <div className={styles.resourceGrid}>
            {[
              ['📚','Academic mastery','Board-aware subjects, chapters, videos, reading, practice, quizzes and question papers.'],
              ['🎯','Learning how to learn','Focus, revision, planning, exam preparation, mistakes and effective study routines.'],
              ['🧭','Work ethic & responsibility','Reliability, preparation, integrity, finishing responsibilities and productive habits.'],
              ['🤝','Social responsibility','Civic behaviour, empathy, public responsibility, respectful communities and digital citizenship.'],
              ['🌱','Motivation & resilience','Practical encouragement that helps students restart, persist and learn from setbacks.'],
              ['🌤️','Well-being & life skills','Balanced learning, communication, decision-making, career curiosity and healthy routines.'],
            ].map(([icon, title, copy]) => (
              <article className={styles.resourceCard} key={title}>
                <div className={styles.icon}>{icon}</div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.sectionAlt}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>Built for multiple Indian boards</h2>
            <p>The curriculum model is board-extensible. CBSE is one option, not the product boundary. State and national boards can carry their own academic-year curriculum while common life-skills content remains cross-board.</p>
          </div>
          <div className={styles.boardGrid}>
            {(overview?.boards || []).slice(0, 16).map((board) => (
              <div className={styles.boardCard} key={board.code}>
                <strong>{board.short_name || board.code}</strong>
                <span>{board.name}{board.state ? ` · ${board.state}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>Content source strategy</h2>
            <p>We are separating “free to access” from “safe to copy”. Every external resource carries a source and licence record before VidyaSetu decides whether it may be linked, adapted or hosted.</p>
          </div>
          <div className={styles.sourcePanel}>
            <div className={styles.sourceCard}>
              <h3>✍️ {original?.name || 'VidyaSetu Original'}</h3>
              <p>Our primary library: original lessons, explanations, practice, videos, question banks, motivation, study skills, work ethic, social responsibility and life-skills resources authored and reviewed for VidyaSetu.</p>
            </div>
            <div className={`${styles.sourceCard} ${styles.light}`}>
              <h3>🌐 {nroer?.name || 'NROER open resources'}</h3>
              <p>External OER can enrich the library, but VidyaSetu stores per-resource licence and attribution. NROER import remains item-level verified; the platform does not assume that a source name alone grants permission to copy a file.</p>
            </div>
          </div>
          <div className={styles.note}>Official resources with restrictive or uncertain rehosting terms are treated as external references rather than copied into VidyaSetu storage.</div>
        </div>
      </section>
    </div>
  );
}
