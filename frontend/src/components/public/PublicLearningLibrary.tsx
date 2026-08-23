'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import {
  getPublicLearningAssessments,
  getPublicLearningOverview,
  getPublicLearningResources,
  getPublicLearningSources,
  type LearningCategory,
  type PublicLearningAssessment,
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
  const [assessments, setAssessments] = useState<PublicLearningAssessment[]>([]);
  const [sources, setSources] = useState<PublicLearningSource[]>([]);
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [selectedBoard, setSelectedBoard] = useState<string>('ALL');
  const [category, setCategory] = useState<LearningCategory | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const classParam = Number.parseInt(params.get('class') || '', 10);
    const boardParam = (params.get('board') || '').toUpperCase();
    if (Number.isInteger(classParam) && classParam >= 1 && classParam <= 12) setSelectedClass(classParam);
    if (boardParam) setSelectedBoard(boardParam);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.allSettled([getPublicLearningOverview(), getPublicLearningSources()]).then(([overviewResult, sourceResult]) => {
      if (!active) return;
      if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value.data.data);
      if (sourceResult.status === 'fulfilled') setSources(sourceResult.value.data.data || []);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.allSettled([
      getPublicLearningResources({
        class: selectedClass || undefined,
        category: category === 'ALL' ? undefined : category,
        board: selectedBoard === 'ALL' ? undefined : selectedBoard,
        limit: 60,
      }),
      getPublicLearningAssessments({
        class: selectedClass || undefined,
        board: selectedBoard === 'ALL' ? undefined : selectedBoard,
        limit: 24,
      }),
    ]).then(([resourceResult, assessmentResult]) => {
      if (!active) return;
      setResources(resourceResult.status === 'fulfilled' ? resourceResult.value.data.data || [] : []);
      setAssessments(assessmentResult.status === 'fulfilled' ? assessmentResult.value.data.data || [] : []);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedClass, selectedBoard, category]);

  const categories = useMemo(() => Array.from(new Set(overview?.categories?.map((item) => item.category) || [])), [overview]);
  const boardOptions = useMemo(() => (overview?.boards || []).filter((board) => board.code !== 'OTHER_STATE'), [overview]);
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
              Original lessons, open educational resources, videos, reading, structured practice, question papers,
              study skills, motivation, work ethic, social responsibility and life skills—built for Indian learners across boards.
            </p>
            <div className={styles.actions}>
              <a className={styles.primary} href="#browse">Browse free learning</a>
              <a className={styles.secondary} href="#practice">Try free practice</a>
              <Link className={styles.secondary} href="/login?role=student">Student login</Link>
            </div>
          </div>
          <aside className={styles.heroVisual}>
            <div className={styles.visualTitle}>A complete learning journey</div>
            <div className={styles.visualGrid}>
              <div className={styles.visualCard}><span>🎥</span><strong>Watch concept lessons</strong></div>
              <div className={styles.visualCard}><span>📖</span><strong>Read clear explanations</strong></div>
              <div className={styles.visualCard}><span>📝</span><strong>Practise and get feedback</strong></div>
              <div className={styles.visualCard}><span>🌱</span><strong>Build habits and confidence</strong></div>
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.sectionAlt} id="browse">
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>Browse learning by class and board</h2>
            <p>Public resources can be explored without login. Common resources work across boards; board-specific curricula can be added by academic year without changing the learner experience.</p>
          </div>
          <div className={styles.classGrid}>
            {(overview?.classes || Array.from({ length: 12 }, (_, index) => ({ className: index + 1, resourceCount: 0 }))).map((item) => (
              <button key={item.className} type="button" className={`${styles.classButton} ${selectedClass === item.className ? styles.classActive : ''}`} onClick={() => setSelectedClass((current) => current === item.className ? null : item.className)}>
                Class {item.className}<span className={styles.classCount}>{item.resourceCount} public</span>
              </button>
            ))}
          </div>

          <div className={styles.filterRow} aria-label="Board filter">
            <button className={`${styles.filter} ${selectedBoard === 'ALL' ? styles.filterActive : ''}`} onClick={() => setSelectedBoard('ALL')}>All boards</button>
            {boardOptions.map((board) => (
              <button key={board.code} className={`${styles.filter} ${selectedBoard === board.code ? styles.filterActive : ''}`} onClick={() => setSelectedBoard(board.code)}>{board.short_name || board.code}</button>
            ))}
          </div>

          <div className={styles.filterRow} aria-label="Learning category filter">
            <button className={`${styles.filter} ${category === 'ALL' ? styles.filterActive : ''}`} onClick={() => setCategory('ALL')}>All learning</button>
            {categories.map((item) => (
              <button key={item} className={`${styles.filter} ${category === item ? styles.filterActive : ''}`} onClick={() => setCategory(item)}>{CATEGORY_META[item]?.icon} {CATEGORY_META[item]?.label || item.replaceAll('_', ' ')}</button>
            ))}
          </div>

          {loading ? <div className={styles.empty}>Loading public learning resources…</div> : resources.length === 0 ? (
            <div className={styles.empty}>No public resources match this class/board/category yet. VidyaSetu shows real coverage rather than inventing a full catalogue.</div>
          ) : (
            <div className={styles.resourceGrid}>
              {resources.map((resource) => (
                <Link href={`/learn/resource/${resource.public_slug}`} className={styles.resourceCard} key={resource.id}>
                  <div className={styles.cardTop}><span className={styles.icon}>{resourceIcon(resource)}</span><span className={styles.badge}>{CATEGORY_META[resource.category]?.label || resource.category.replaceAll('_', ' ')}</span></div>
                  <h3>{resource.title}</h3>
                  <p>{resource.summary || 'Open this resource to continue learning.'}</p>
                  <div className={styles.meta}>{resource.class_min ? `Classes ${resource.class_min}${resource.class_max && resource.class_max !== resource.class_min ? `–${resource.class_max}` : ''}` : 'All learners'} · {resource.source_name}</div>
                  <div className={styles.pillRow}>{(resource.board_codes || []).slice(0, 3).map((board) => <span className={styles.pill} key={board}>{board}</span>)}<span className={styles.pill}>{resource.resource_type.replaceAll('_', ' ')}</span></div>
                  <span className={styles.read}>Read / explore →</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={styles.section} id="practice">
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>📝 Free practice & self-assessment</h2>
            <p>Practice is part of learning—not only competitions. Public practice lets a learner preview questions without an account; signing in enables scoring, explanations, history and personalised recommendations.</p>
          </div>
          {assessments.length === 0 ? <div className={styles.empty}>Public practice sets for this class and board are being added.</div> : (
            <div className={styles.resourceGrid}>
              {assessments.map((assessment) => (
                <Link href={`/learn/practice/${assessment.public_slug}`} className={styles.resourceCard} key={assessment.id}>
                  <div className={styles.cardTop}><span className={styles.icon}>🧠</span><span className={styles.badge}>{assessment.assessment_type.replaceAll('_', ' ')}</span></div>
                  <h3>{assessment.title}</h3>
                  <p>{assessment.summary || 'Open this VidyaSetu practice set.'}</p>
                  <div className={styles.meta}>{assessment.question_count} questions · {assessment.total_marks} marks{assessment.time_limit_mins ? ` · ${assessment.time_limit_mins} min` : ''}</div>
                  <div className={styles.pillRow}>{(assessment.board_codes || []).map((board) => <span className={styles.pill} key={board}>{board}</span>)}{assessment.subject_name && <span className={styles.pill}>{assessment.subject_name}</span>}</div>
                  <span className={styles.read}>Preview questions →</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={styles.sectionAlt}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>Academic learning and human development belong together</h2>
            <p>VidyaSetu teaches syllabus content while also helping learners build the habits and values needed to keep moving, work responsibly and participate positively in society.</p>
          </div>
          <div className={styles.resourceGrid}>
            {[
              ['📚','Academic mastery','Board-aware subjects, chapters, videos, reading, practice, quizzes and question papers.'],
              ['🎯','Learning how to learn','Focus, revision, planning, exam preparation, mistakes and effective study routines.'],
              ['🧭','Work ethic & responsibility','Reliability, preparation, integrity, finishing responsibilities and productive habits.'],
              ['🤝','Social responsibility','Civic behaviour, empathy, public responsibility, respectful communities and digital citizenship.'],
              ['🌱','Motivation & resilience','Practical encouragement that helps students restart, persist and learn from setbacks.'],
              ['🌤️','Well-being & life skills','Balanced learning, communication, decision-making, career curiosity and healthy routines.'],
            ].map(([icon, title, copy]) => <article className={styles.resourceCard} key={title}><div className={styles.icon}>{icon}</div><h3>{title}</h3><p>{copy}</p></article>)}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>Built for multiple Indian boards</h2>
            <p>The curriculum model is board-extensible. CBSE is one option, not the product boundary. State and national boards can carry their own academic-year curriculum while common academic and life-skills resources can serve learners across boards.</p>
          </div>
          <div className={styles.boardGrid}>
            {(overview?.boards || []).slice(0, 16).map((board) => <div className={styles.boardCard} key={board.code}><strong>{board.short_name || board.code}</strong><span>{board.name}{board.state ? ` · ${board.state}` : ''}</span></div>)}
          </div>
        </div>
      </section>

      <section className={styles.sectionAlt}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <h2>Content source strategy</h2>
            <p>VidyaSetu separates “free to access” from “safe to copy”. Every external resource carries source and licence evidence before it may be linked, adapted or hosted.</p>
          </div>
          <div className={styles.sourcePanel}>
            <div className={styles.sourceCard}><h3>✍️ {original?.name || 'VidyaSetu Original'}</h3><p>Our primary library: original lessons, explanations, practice, videos, question banks, motivation, study skills, work ethic, social responsibility and life-skills resources authored and reviewed for VidyaSetu.</p></div>
            <div className={`${styles.sourceCard} ${styles.light}`}><h3>🌐 {nroer?.name || 'NROER open resources'}</h3><p>Potential NROER material moves through a discovery → licence review → content review → approval intake workflow. Rehosting is not assumed and attribution is mandatory where required.</p></div>
          </div>
          <div className={styles.note}>Official resources with restrictive or uncertain rehosting terms are treated as external references rather than copied into VidyaSetu storage.</div>
        </div>
      </section>
    </div>
  );
}
