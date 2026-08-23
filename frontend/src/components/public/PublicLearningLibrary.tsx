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
  type PublicLearningGrade,
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

const EARLY_GRADES: PublicLearningGrade[] = [
  { code: 'PRE_NURSERY', name: 'Pre-Nursery', shortName: 'Pre-Nursery', stage: 'EARLY_YEARS', classNumber: null, sortOrder: 1, resourceCount: 0 },
  { code: 'NURSERY', name: 'Nursery', shortName: 'Nursery', stage: 'EARLY_YEARS', classNumber: null, sortOrder: 2, resourceCount: 0 },
  { code: 'LKG', name: 'Lower Kindergarten', shortName: 'LKG', stage: 'FOUNDATIONAL', classNumber: null, sortOrder: 3, resourceCount: 0 },
  { code: 'UKG', name: 'Upper Kindergarten', shortName: 'UKG', stage: 'FOUNDATIONAL', classNumber: null, sortOrder: 4, resourceCount: 0 },
];

const SCHOOL_GRADES: PublicLearningGrade[] = Array.from({ length: 12 }, (_, index): PublicLearningGrade => {
  const classNumber = index + 1;
  const stage: PublicLearningGrade['stage'] = classNumber <= 2
    ? 'FOUNDATIONAL'
    : classNumber <= 5
      ? 'PRIMARY'
      : classNumber <= 8
        ? 'MIDDLE'
        : classNumber <= 10
          ? 'SECONDARY'
          : 'SENIOR_SECONDARY';
  return {
    code: `CLASS_${classNumber}`,
    name: `Class ${classNumber}`,
    shortName: `Class ${classNumber}`,
    stage,
    classNumber,
    sortOrder: classNumber + 4,
    resourceCount: 0,
  };
});

const FALLBACK_GRADES: PublicLearningGrade[] = [...EARLY_GRADES, ...SCHOOL_GRADES];

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

function gradeLabel(code: string): string {
  if (code === 'PRE_NURSERY') return 'Pre-Nursery';
  if (code === 'NURSERY') return 'Nursery';
  if (code === 'LKG' || code === 'UKG') return code;
  if (code.startsWith('CLASS_')) return `Class ${code.replace('CLASS_', '')}`;
  return code.replaceAll('_', ' ');
}

export default function PublicLearningLibrary() {
  const [overview, setOverview] = useState<PublicLearningOverview | null>(null);
  const [resources, setResources] = useState<PublicLearningResource[]>([]);
  const [assessments, setAssessments] = useState<PublicLearningAssessment[]>([]);
  const [sources, setSources] = useState<PublicLearningSource[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedBoard, setSelectedBoard] = useState('ALL');
  const [category, setCategory] = useState<LearningCategory | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gradeParam = (params.get('grade') || '').toUpperCase();
    const classParam = Number.parseInt(params.get('class') || '', 10);
    const boardParam = (params.get('board') || '').toUpperCase();
    if (gradeParam) setSelectedGrade(gradeParam);
    else if (Number.isInteger(classParam) && classParam >= 1 && classParam <= 12) setSelectedGrade(`CLASS_${classParam}`);
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

  const gradeOptions = useMemo(() => overview?.grades?.length ? overview.grades : FALLBACK_GRADES, [overview]);
  const selectedGradeMeta = useMemo(() => gradeOptions.find((grade) => grade.code === selectedGrade) || null, [gradeOptions, selectedGrade]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.allSettled([
      getPublicLearningResources({
        grade: selectedGrade || undefined,
        category: category === 'ALL' ? undefined : category,
        board: selectedBoard === 'ALL' ? undefined : selectedBoard,
        limit: 60,
      }),
      getPublicLearningAssessments({
        class: selectedGradeMeta?.classNumber || undefined,
        board: selectedBoard === 'ALL' ? undefined : selectedBoard,
        limit: 24,
      }),
    ]).then(([resourceResult, assessmentResult]) => {
      if (!active) return;
      setResources(resourceResult.status === 'fulfilled' ? resourceResult.value.data.data || [] : []);
      const earlyYears = Boolean(selectedGrade && !selectedGradeMeta?.classNumber);
      setAssessments(earlyYears ? [] : assessmentResult.status === 'fulfilled' ? assessmentResult.value.data.data || [] : []);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedGrade, selectedGradeMeta?.classNumber, selectedBoard, category]);

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
            <div className={styles.kicker}>VidyaSetu Learning · Pre-Nursery to Class 12 · Cross-board</div>
            <h1 className={styles.title}>Learn. Practise. Grow.<br /><span className={styles.accent}>From first learning steps to Class 12.</span></h1>
            <p className={styles.copy}>Age-appropriate early learning, original lessons, open educational resources, videos, reading, structured practice, question papers, study skills, motivation, work ethic, social responsibility and life skills—built for Indian learners across boards.</p>
            <div className={styles.actions}>
              <a className={styles.primary} href="#browse">Browse free learning</a>
              <a className={styles.secondary} href="#practice">Try free practice</a>
              <Link className={styles.secondary} href="/login?role=student">Student login</Link>
            </div>
          </div>
          <aside className={styles.heroVisual}>
            <div className={styles.visualTitle}>One learning journey, every stage</div>
            <div className={styles.visualGrid}>
              <div className={styles.visualCard}><span>🧸</span><strong>Early-years discovery</strong></div>
              <div className={styles.visualCard}><span>📖</span><strong>Clear concept learning</strong></div>
              <div className={styles.visualCard}><span>📝</span><strong>Practice and feedback</strong></div>
              <div className={styles.visualCard}><span>🌱</span><strong>Habits, values and confidence</strong></div>
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.sectionAlt} id="browse">
        <div className={styles.shell}>
          <div className={styles.sectionHeader}><h2>Browse learning by grade and board</h2><p>Choose an early-years level or Class 1–12. COMMON resources can serve learners across boards, while board-specific curriculum resources can be mapped independently.</p></div>
          <div className={styles.classGrid}>
            {gradeOptions.map((item) => (
              <button key={item.code} type="button" className={`${styles.classButton} ${selectedGrade === item.code ? styles.classActive : ''}`} onClick={() => setSelectedGrade((current) => current === item.code ? null : item.code)}>
                {item.shortName}<span className={styles.classCount}>{item.resourceCount} public</span>
              </button>
            ))}
          </div>
          <div className={styles.filterRow} aria-label="Board filter">
            <button className={`${styles.filter} ${selectedBoard === 'ALL' ? styles.filterActive : ''}`} onClick={() => setSelectedBoard('ALL')}>All boards</button>
            {boardOptions.map((board) => <button key={board.code} className={`${styles.filter} ${selectedBoard === board.code ? styles.filterActive : ''}`} onClick={() => setSelectedBoard(board.code)}>{board.short_name || board.code}</button>)}
          </div>
          <div className={styles.filterRow} aria-label="Learning category filter">
            <button className={`${styles.filter} ${category === 'ALL' ? styles.filterActive : ''}`} onClick={() => setCategory('ALL')}>All learning</button>
            {categories.map((item) => <button key={item} className={`${styles.filter} ${category === item ? styles.filterActive : ''}`} onClick={() => setCategory(item)}>{CATEGORY_META[item]?.icon} {CATEGORY_META[item]?.label || item.replaceAll('_', ' ')}</button>)}
          </div>
          {loading ? <div className={styles.empty}>Loading public learning resources…</div> : resources.length === 0 ? <div className={styles.empty}>No public resources match this grade/board/category yet. VidyaSetu shows real coverage rather than inventing a catalogue.</div> : (
            <div className={styles.resourceGrid}>{resources.map((resource) => (
              <Link href={`/learn/resource/${resource.public_slug}`} className={styles.resourceCard} key={resource.id}>
                <div className={styles.cardTop}><span className={styles.icon}>{resourceIcon(resource)}</span><span className={styles.badge}>{CATEGORY_META[resource.category]?.label || resource.category.replaceAll('_', ' ')}</span></div>
                <h3>{resource.title}</h3><p>{resource.summary || 'Open this resource to continue learning.'}</p>
                <div className={styles.meta}>{resource.grade_codes?.length ? resource.grade_codes.slice(0, 3).map(gradeLabel).join(' · ') : resource.class_min ? `Classes ${resource.class_min}${resource.class_max && resource.class_max !== resource.class_min ? `–${resource.class_max}` : ''}` : 'All learners'} · {resource.source_name}</div>
                <div className={styles.pillRow}>{(resource.board_codes || []).slice(0, 3).map((board) => <span className={styles.pill} key={board}>{board}</span>)}{resource.subject_name && <span className={styles.pill}>{resource.subject_name}</span>}<span className={styles.pill}>{resource.resource_type.replaceAll('_', ' ')}</span></div>
                <span className={styles.read}>Read / explore →</span>
              </Link>
            ))}</div>
          )}
        </div>
      </section>

      <section className={styles.section} id="practice"><div className={styles.shell}>
        <div className={styles.sectionHeader}><h2>📝 Free practice & self-assessment</h2><p>Structured scored assessments are available for school classes. Early-years learning uses activities, stories, audio, video and worksheets without forcing exam-style testing on young learners.</p></div>
        {selectedGrade && !selectedGradeMeta?.classNumber ? <div className={styles.empty}>For {selectedGradeMeta?.shortName || 'early-years learners'}, VidyaSetu prioritises playful activities and age-appropriate resources instead of formal scored tests.</div> : assessments.length === 0 ? <div className={styles.empty}>Public practice sets for this grade and board are being added.</div> : (
          <div className={styles.resourceGrid}>{assessments.map((assessment) => (
            <Link href={`/learn/practice/${assessment.public_slug}`} className={styles.resourceCard} key={assessment.id}>
              <div className={styles.cardTop}><span className={styles.icon}>🧠</span><span className={styles.badge}>{assessment.assessment_type.replaceAll('_', ' ')}</span></div>
              <h3>{assessment.title}</h3><p>{assessment.summary || 'Open this VidyaSetu practice set.'}</p>
              <div className={styles.meta}>{assessment.question_count} questions · {assessment.total_marks} marks{assessment.time_limit_mins ? ` · ${assessment.time_limit_mins} min` : ''}</div>
              <div className={styles.pillRow}>{(assessment.board_codes || []).map((board) => <span className={styles.pill} key={board}>{board}</span>)}{assessment.subject_name && <span className={styles.pill}>{assessment.subject_name}</span>}</div>
              <span className={styles.read}>Preview questions →</span>
            </Link>
          ))}</div>
        )}
      </div></section>

      <section className={styles.sectionAlt}><div className={styles.shell}>
        <div className={styles.sectionHeader}><h2>Academic learning and human development belong together</h2><p>VidyaSetu supports syllabus learning while helping children and young people build curiosity, habits, values and confidence appropriate to their stage of development.</p></div>
        <div className={styles.resourceGrid}>{[
          ['🧸','Early-years foundations','Language, number sense, colours, shapes, stories, movement, creativity and everyday-world discovery.'],
          ['📚','Academic mastery','Board-aware subjects, chapters, videos, reading, practice, quizzes and question papers.'],
          ['🎯','Learning how to learn','Focus, revision, planning, exam preparation, mistakes and effective study routines.'],
          ['🧭','Work ethic & responsibility','Reliability, preparation, integrity, finishing responsibilities and productive habits.'],
          ['🤝','Social responsibility','Empathy, civic behaviour, respectful communities, public responsibility and digital citizenship.'],
          ['🌱','Motivation & resilience','Practical encouragement that helps learners restart, persist and learn from setbacks.'],
        ].map(([icon, title, copy]) => <article className={styles.resourceCard} key={title}><div className={styles.icon}>{icon}</div><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </div></section>

      <section className={styles.section}><div className={styles.shell}>
        <div className={styles.sectionHeader}><h2>Built for multiple Indian boards</h2><p>The curriculum model is board-extensible. CBSE is one option, not the product boundary. State and national boards can carry their own curriculum while COMMON resources serve learners across boards.</p></div>
        <div className={styles.boardGrid}>{(overview?.boards || []).slice(0, 16).map((board) => <div className={styles.boardCard} key={board.code}><strong>{board.short_name || board.code}</strong><span>{board.name}{board.state ? ` · ${board.state}` : ''}</span></div>)}</div>
      </div></section>

      <section className={styles.sectionAlt}><div className={styles.shell}>
        <div className={styles.sectionHeader}><h2>Content source strategy</h2><p>VidyaSetu separates “free to access” from “safe to copy”. Every external resource carries source and licence evidence before it may be linked, adapted or hosted.</p></div>
        <div className={styles.sourcePanel}>
          <div className={styles.sourceCard}><h3>✍️ {original?.name || 'VidyaSetu Original'}</h3><p>Our primary library: original early-learning activities, lessons, explanations, practice, videos, question banks, motivation, study skills, work ethic, social responsibility and life-skills resources authored and reviewed for VidyaSetu.</p></div>
          <div className={`${styles.sourceCard} ${styles.light}`}><h3>🌐 {nroer?.name || 'NROER open resources'}</h3><p>Potential NROER material moves through discovery → licence review → content review → approval. Rehosting is never assumed and attribution is mandatory where required.</p></div>
        </div>
        <div className={styles.note}>Official resources with restrictive or uncertain rehosting terms are treated as external references rather than copied into VidyaSetu storage.</div>
      </div></section>
    </div>
  );
}
