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

const CATEGORY_META: Record<LearningCategory, { label: string; icon: string; tone: string }> = {
  ACADEMIC: { label: 'Academic Learning', icon: '📚', tone: styles.toneAcademic },
  MOTIVATION: { label: 'Motivation', icon: '🌱', tone: styles.toneMotivation },
  STUDY_SKILLS: { label: 'Study Skills', icon: '🎯', tone: styles.toneStudy },
  WORK_ETHIC: { label: 'Work Ethic', icon: '🧭', tone: styles.toneWork },
  SOCIAL_RESPONSIBILITY: { label: 'Social Responsibility', icon: '🤝', tone: styles.toneSocial },
  LIFE_SKILLS: { label: 'Life Skills', icon: '🛠️', tone: styles.toneLife },
  WELLBEING: { label: 'Well-being', icon: '🌤️', tone: styles.toneWellbeing },
  CAREER_AWARENESS: { label: 'Career Awareness', icon: '🧑‍🚀', tone: styles.toneCareer },
  DIGITAL_CITIZENSHIP: { label: 'Digital Citizenship', icon: '💻', tone: styles.toneDigital },
};

type StageFilter = PublicLearningGrade['stage'] | 'ALL';

const STAGE_META: Array<{ code: StageFilter; label: string }> = [
  { code: 'ALL', label: 'All levels' },
  { code: 'EARLY_YEARS', label: 'Early years' },
  { code: 'FOUNDATIONAL', label: 'Foundational' },
  { code: 'PRIMARY', label: 'Primary' },
  { code: 'MIDDLE', label: 'Middle school' },
  { code: 'SECONDARY', label: 'Secondary' },
  { code: 'SENIOR_SECONDARY', label: 'Senior secondary' },
];

const STAGE_TONE: Record<PublicLearningGrade['stage'], string> = {
  EARLY_YEARS: styles.gradeEarly,
  FOUNDATIONAL: styles.gradeFoundational,
  PRIMARY: styles.gradePrimary,
  MIDDLE: styles.gradeMiddle,
  SECONDARY: styles.gradeSecondary,
  SENIOR_SECONDARY: styles.gradeSenior,
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
const ALL_CATEGORIES = Object.keys(CATEGORY_META) as LearningCategory[];

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function getOverviewWithRetry(): Promise<PublicLearningOverview> {
  const delays = [0, 650, 1700];
  let lastError: unknown;
  for (const delay of delays) {
    if (delay) await wait(delay);
    try {
      const response = await getPublicLearningOverview();
      return response.data.data;
    } catch (error: unknown) {
      lastError = error;
    }
  }
  throw lastError;
}

export default function PublicLearningLibrary() {
  const [overview, setOverview] = useState<PublicLearningOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(false);
  const [resources, setResources] = useState<PublicLearningResource[]>([]);
  const [resourceError, setResourceError] = useState(false);
  const [assessments, setAssessments] = useState<PublicLearningAssessment[]>([]);
  const [sources, setSources] = useState<PublicLearningSource[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<StageFilter>('ALL');
  const [selectedBoard, setSelectedBoard] = useState('ALL');
  const [category, setCategory] = useState<LearningCategory | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gradeParam = (params.get('grade') || '').toUpperCase();
    const classParam = Number.parseInt(params.get('class') || '', 10);
    const boardParam = (params.get('board') || '').toUpperCase();
    const categoryParam = (params.get('category') || '').toUpperCase() as LearningCategory;
    if (gradeParam) setSelectedGrade(gradeParam);
    else if (Number.isInteger(classParam) && classParam >= 1 && classParam <= 12) setSelectedGrade(`CLASS_${classParam}`);
    if (boardParam) setSelectedBoard(boardParam);
    if (ALL_CATEGORIES.includes(categoryParam)) setCategory(categoryParam);
  }, []);

  useEffect(() => {
    let active = true;

    const refreshOverview = async (foreground: boolean) => {
      if (foreground) setOverviewLoading(true);
      try {
        const freshOverview = await getOverviewWithRetry();
        if (!active) return;
        setOverview(freshOverview);
        setOverviewError(false);
      } catch {
        if (active) setOverviewError(true);
      } finally {
        if (active) setOverviewLoading(false);
      }
    };

    void refreshOverview(true);
    getPublicLearningSources()
      .then((response) => { if (active) setSources(response.data.data || []); })
      .catch(() => undefined);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshOverview(false);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const gradeOptions = useMemo(() => overview?.grades?.length ? overview.grades : FALLBACK_GRADES, [overview]);
  const visibleGrades = useMemo(
    () => selectedStage === 'ALL' ? gradeOptions : gradeOptions.filter((grade) => grade.stage === selectedStage),
    [gradeOptions, selectedStage],
  );
  const selectedGradeMeta = useMemo(() => gradeOptions.find((grade) => grade.code === selectedGrade) || null, [gradeOptions, selectedGrade]);

  useEffect(() => {
    if (selectedGradeMeta && selectedStage !== 'ALL' && selectedGradeMeta.stage !== selectedStage) {
      setSelectedGrade(null);
    }
  }, [selectedGradeMeta, selectedStage]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setResourceError(false);
    const earlyYears = Boolean(selectedGrade && !selectedGradeMeta?.classNumber);
    const resourceRequest = getPublicLearningResources({
      grade: selectedGrade || undefined,
      category: category === 'ALL' ? undefined : category,
      board: selectedBoard === 'ALL' ? undefined : selectedBoard,
      limit: 60,
    });
    const assessmentRequest = earlyYears
      ? Promise.resolve(null)
      : getPublicLearningAssessments({
          class: selectedGradeMeta?.classNumber || undefined,
          board: selectedBoard === 'ALL' ? undefined : selectedBoard,
          limit: 24,
        });

    Promise.allSettled([resourceRequest, assessmentRequest])
      .then(([resourceResult, assessmentResult]) => {
        if (!active) return;
        if (resourceResult.status === 'fulfilled') {
          setResources(resourceResult.value.data.data || []);
        } else {
          setResources([]);
          setResourceError(true);
        }
        if (earlyYears) setAssessments([]);
        else if (assessmentResult.status === 'fulfilled' && assessmentResult.value) setAssessments(assessmentResult.value.data.data || []);
        else setAssessments([]);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedGrade, selectedGradeMeta?.classNumber, selectedBoard, category]);

  const boardOptions = useMemo(() => (overview?.boards || []).filter((board) => board.code !== 'OTHER_STATE'), [overview]);
  const nroer = sources.find((source) => source.code === 'NROER');
  const original = sources.find((source) => source.code === 'VIDYASETU_ORIGINAL');
  const countsReady = Boolean(overview);
  const activeFilterCount = Number(Boolean(selectedGrade)) + Number(selectedBoard !== 'ALL') + Number(category !== 'ALL');
  const activeGradeLabel = selectedGradeMeta?.shortName || 'All levels';
  const activeBoardLabel = selectedBoard === 'ALL' ? 'All boards' : boardOptions.find((board) => board.code === selectedBoard)?.short_name || selectedBoard;
  const activeCategoryLabel = category === 'ALL' ? 'All learning' : CATEGORY_META[category].label;

  function clearFilters(): void {
    setSelectedGrade(null);
    setSelectedStage('ALL');
    setSelectedBoard('ALL');
    setCategory('ALL');
  }

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

      <section className={styles.statsStrip} aria-label="Learning catalogue summary">
        <div className={`${styles.shell} ${styles.statsGrid}`}>
          <div className={styles.statCard}><span>📚</span><div><strong>{overview ? overview.totalResources : '—'}</strong><small>Public resources</small></div></div>
          <div className={styles.statCard}><span>🎒</span><div><strong>{overview?.grades?.length || 16}</strong><small>Learning levels</small></div></div>
          <div className={styles.statCard}><span>🏫</span><div><strong>{overview?.boards?.length || '—'}</strong><small>Board options</small></div></div>
          <div className={styles.statCard}><span>🌐</span><div><strong>{overview ? overview.openResources : '—'}</strong><small>Open-resource references</small></div></div>
        </div>
      </section>

      <section className={styles.sectionAlt} id="browse">
        <div className={styles.shell}>
          <div className={styles.browsePanel}>
            <div className={styles.browseTop}>
              <div className={styles.sectionHeader}>
                <div className={styles.eyebrow}>Find the right learning path</div>
                <h2>Browse by learning level</h2>
                <p>Pick a stage and grade first. Then narrow by board or learning type only when you need to.</p>
              </div>
              <div className={`${styles.coverageState} ${overviewError && !overview ? styles.coverageError : ''}`}>
                <span className={overviewLoading ? styles.liveDot : styles.liveDotReady} />
                {overviewLoading && !overview ? 'Updating live coverage…' : overviewError && !overview ? 'Coverage will retry automatically' : 'Live catalogue coverage'}
              </div>
            </div>

            <div className={styles.stageTabs} aria-label="Learning stage filter">
              {STAGE_META.map((stage) => (
                <button
                  key={stage.code}
                  type="button"
                  className={`${styles.stageTab} ${selectedStage === stage.code ? styles.stageTabActive : ''}`}
                  onClick={() => setSelectedStage(stage.code)}
                >
                  {stage.label}
                </button>
              ))}
            </div>

            <div className={styles.classGrid}>
              {visibleGrades.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  className={`${styles.classButton} ${STAGE_TONE[item.stage]} ${selectedGrade === item.code ? styles.classActive : ''}`}
                  onClick={() => setSelectedGrade((current) => current === item.code ? null : item.code)}
                >
                  <span className={styles.className}>{item.shortName}</span>
                  <span className={styles.classCount}>
                    {countsReady ? `${item.resourceCount} public` : overviewLoading ? 'loading…' : 'count unavailable'}
                  </span>
                </button>
              ))}
            </div>

            <div className={styles.filterBar}>
              <label className={styles.publicField}>
                <span>Board</span>
                <select value={selectedBoard} onChange={(event) => setSelectedBoard(event.target.value)}>
                  <option value="ALL">All boards</option>
                  {boardOptions.map((board) => <option key={board.code} value={board.code}>{board.short_name || board.code} — {board.name}</option>)}
                </select>
              </label>
              <label className={styles.publicField}>
                <span>Learning type</span>
                <select value={category} onChange={(event) => setCategory(event.target.value as LearningCategory | 'ALL')}>
                  <option value="ALL">All learning</option>
                  {ALL_CATEGORIES.map((item) => <option key={item} value={item}>{CATEGORY_META[item].label}</option>)}
                </select>
              </label>
              <div className={styles.filterSummary}>
                <span className={styles.summaryLabel}>Showing</span>
                <strong>{activeGradeLabel}</strong>
                <span>· {activeBoardLabel} · {activeCategoryLabel}</span>
              </div>
              {activeFilterCount > 0 && <button type="button" className={styles.clearButton} onClick={clearFilters}>Clear filters</button>}
            </div>
          </div>

          <div className={styles.resultsHeader}>
            <div>
              <div className={styles.eyebrow}>Learning resources</div>
              <h2>{selectedGradeMeta ? `${selectedGradeMeta.shortName} learning` : 'Explore public learning'}</h2>
            </div>
            <div className={styles.resultCount}>{loading ? 'Loading…' : `Showing ${resources.length} resource${resources.length === 1 ? '' : 's'}`}</div>
          </div>

          {loading ? (
            <div className={styles.loadingGrid}>{[1,2,3].map((item) => <div className={styles.loadingCard} key={item}><span /><span /><span /><span /></div>)}</div>
          ) : resourceError ? (
            <div className={styles.empty}><strong>Learning resources could not be loaded.</strong><br />The page will retry on your next visit or tab refresh.</div>
          ) : resources.length === 0 ? (
            <div className={styles.empty}>No public resources match these filters yet. Try another grade, board or learning type.</div>
          ) : (
            <div className={styles.resourceGrid}>{resources.map((resource) => {
              const categoryMeta = CATEGORY_META[resource.category] || CATEGORY_META.ACADEMIC;
              return (
                <Link href={`/learn/resource/${resource.public_slug}`} className={`${styles.resourceCard} ${categoryMeta.tone}`} key={resource.id}>
                  <div className={styles.cardTop}>
                    <span className={styles.iconBubble}>{resourceIcon(resource)}</span>
                    <span className={styles.badge}>{categoryMeta.label}</span>
                  </div>
                  <h3>{resource.title}</h3>
                  <p>{resource.summary || 'Open this resource to continue learning.'}</p>
                  <div className={styles.cardFooter}>
                    <div className={styles.meta}>{resource.grade_codes?.length ? resource.grade_codes.slice(0, 3).map(gradeLabel).join(' · ') : resource.class_min ? `Classes ${resource.class_min}${resource.class_max && resource.class_max !== resource.class_min ? `–${resource.class_max}` : ''}` : 'All learners'} · {resource.source_name}</div>
                    <div className={styles.pillRow}>{(resource.board_codes || []).slice(0, 3).map((board) => <span className={styles.pill} key={board}>{board}</span>)}{resource.subject_name && <span className={styles.pill}>{resource.subject_name}</span>}<span className={styles.pill}>{resource.resource_type.replaceAll('_', ' ')}</span></div>
                    <span className={styles.read}>Open resource <span>→</span></span>
                  </div>
                </Link>
              );
            })}</div>
          )}
        </div>
      </section>

      <section className={`${styles.section} ${styles.practiceSection}`} id="practice"><div className={styles.shell}>
        <div className={styles.resultsHeader}>
          <div><div className={styles.eyebrow}>Practise with feedback</div><h2>Free practice & self-assessment</h2><p>Short, structured practice for school classes. Early-years learning stays activity-led rather than exam-led.</p></div>
          <span className={styles.practiceIcon}>📝</span>
        </div>
        {selectedGrade && !selectedGradeMeta?.classNumber ? <div className={styles.empty}>For {selectedGradeMeta?.shortName || 'early-years learners'}, VidyaSetu prioritises playful activities and age-appropriate resources instead of formal scored tests.</div> : assessments.length === 0 ? <div className={styles.empty}>Public practice sets for this level and board are being added.</div> : (
          <div className={styles.resourceGrid}>{assessments.map((assessment) => (
            <Link href={`/learn/practice/${assessment.public_slug}`} className={`${styles.resourceCard} ${styles.tonePractice}`} key={assessment.id}>
              <div className={styles.cardTop}><span className={styles.iconBubble}>🧠</span><span className={styles.badge}>{assessment.assessment_type.replaceAll('_', ' ')}</span></div>
              <h3>{assessment.title}</h3><p>{assessment.summary || 'Open this VidyaSetu practice set.'}</p>
              <div className={styles.cardFooter}><div className={styles.meta}>{assessment.question_count} questions · {assessment.total_marks} marks{assessment.time_limit_mins ? ` · ${assessment.time_limit_mins} min` : ''}</div>
              <div className={styles.pillRow}>{(assessment.board_codes || []).map((board) => <span className={styles.pill} key={board}>{board}</span>)}{assessment.subject_name && <span className={styles.pill}>{assessment.subject_name}</span>}</div>
              <span className={styles.read}>Preview questions <span>→</span></span></div>
            </Link>
          ))}</div>
        )}
      </div></section>

      <section className={styles.sectionAlt}><div className={styles.shell}>
        <div className={styles.sectionHeader}><div className={styles.eyebrow}>Beyond marks</div><h2>Academic learning and human development belong together</h2><p>VidyaSetu supports syllabus learning while helping children and young people build curiosity, habits, values and confidence appropriate to their stage of development.</p></div>
        <div className={styles.featureGrid}>{[
          ['🧸','Early-years foundations','Language, number sense, colours, shapes, stories, movement, creativity and everyday-world discovery.', styles.featurePeach],
          ['📚','Academic mastery','Board-aware subjects, chapters, videos, reading, practice, quizzes and question papers.', styles.featureBlue],
          ['🎯','Learning how to learn','Focus, revision, planning, exam preparation, mistakes and effective study routines.', styles.featureLavender],
          ['🧭','Work ethic & responsibility','Reliability, preparation, integrity, finishing responsibilities and productive habits.', styles.featureAmber],
          ['🤝','Social responsibility','Empathy, civic behaviour, respectful communities, public responsibility and digital citizenship.', styles.featureGreen],
          ['🌱','Motivation & resilience','Practical encouragement that helps learners restart, persist and learn from setbacks.', styles.featureMint],
        ].map(([icon, title, copy, tone]) => <article className={`${styles.featureCard} ${tone}`} key={title}><div className={styles.featureIcon}>{icon}</div><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </div></section>

      <section className={styles.section}><div className={styles.shell}>
        <div className={styles.sectionHeader}><div className={styles.eyebrow}>Cross-board by design</div><h2>Built for multiple Indian boards</h2><p>The curriculum model is board-extensible. CBSE is one option, not the product boundary. State and national boards can carry their own curriculum while COMMON resources serve learners across boards.</p></div>
        <div className={styles.boardGrid}>{(overview?.boards || []).slice(0, 16).map((board) => <div className={styles.boardCard} key={board.code}><strong>{board.short_name || board.code}</strong><span>{board.name}{board.state ? ` · ${board.state}` : ''}</span></div>)}</div>
      </div></section>

      <section className={styles.sectionAlt}><div className={styles.shell}>
        <div className={styles.sectionHeader}><div className={styles.eyebrow}>Trusted content operations</div><h2>Content source strategy</h2><p>VidyaSetu separates “free to access” from “safe to copy”. Every external resource carries source and licence evidence before it may be linked, adapted or hosted.</p></div>
        <div className={styles.sourcePanel}>
          <div className={styles.sourceCard}><h3>✍️ {original?.name || 'VidyaSetu Original'}</h3><p>Our primary library: original early-learning activities, lessons, explanations, practice, videos, question banks, motivation, study skills, work ethic, social responsibility and life-skills resources authored and reviewed for VidyaSetu.</p></div>
          <div className={`${styles.sourceCard} ${styles.light}`}><h3>🌐 {nroer?.name || 'NROER open resources'}</h3><p>Potential NROER material moves through discovery → licence review → content review → approval. Rehosting is never assumed and attribution is mandatory where required.</p></div>
        </div>
        <div className={styles.note}>Official resources with restrictive or uncertain rehosting terms are treated as external references rather than copied into VidyaSetu storage.</div>
      </div></section>
    </div>
  );
}
