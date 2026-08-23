'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  CheckCircle2,
  CirclePlay,
  CloudSun,
  Compass,
  ExternalLink,
  FileQuestion,
  FileText,
  GraduationCap,
  HandHeart,
  Headphones,
  Laptop2,
  Lightbulb,
  NotebookPen,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
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

interface CategoryMeta {
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  tone: string;
  tabTone: string;
}

const CATEGORY_META: Record<LearningCategory, CategoryMeta> = {
  ACADEMIC: {
    label: 'Academic Learning',
    shortLabel: 'Academic',
    icon: BookOpen,
    tone: styles.toneAcademic,
    tabTone: styles.categoryAcademic,
  },
  MOTIVATION: {
    label: 'Motivation',
    shortLabel: 'Motivation',
    icon: Sparkles,
    tone: styles.toneMotivation,
    tabTone: styles.categoryMotivation,
  },
  STUDY_SKILLS: {
    label: 'Study Skills',
    shortLabel: 'Study Skills',
    icon: Target,
    tone: styles.toneStudy,
    tabTone: styles.categoryStudy,
  },
  WORK_ETHIC: {
    label: 'Work Ethic',
    shortLabel: 'Work Ethic',
    icon: Compass,
    tone: styles.toneWork,
    tabTone: styles.categoryWork,
  },
  SOCIAL_RESPONSIBILITY: {
    label: 'Social Responsibility',
    shortLabel: 'Social Responsibility',
    icon: HandHeart,
    tone: styles.toneSocial,
    tabTone: styles.categorySocial,
  },
  LIFE_SKILLS: {
    label: 'Life Skills',
    shortLabel: 'Life Skills',
    icon: Wrench,
    tone: styles.toneLife,
    tabTone: styles.categoryLife,
  },
  WELLBEING: {
    label: 'Well-being',
    shortLabel: 'Well-being',
    icon: CloudSun,
    tone: styles.toneWellbeing,
    tabTone: styles.categoryWellbeing,
  },
  CAREER_AWARENESS: {
    label: 'Career Awareness',
    shortLabel: 'Career',
    icon: BriefcaseBusiness,
    tone: styles.toneCareer,
    tabTone: styles.categoryCareer,
  },
  DIGITAL_CITIZENSHIP: {
    label: 'Digital Citizenship',
    shortLabel: 'Digital Citizenship',
    icon: Laptop2,
    tone: styles.toneDigital,
    tabTone: styles.categoryDigital,
  },
};

type StageFilter = PublicLearningGrade['stage'] | 'ALL';

const STAGE_META: Array<{ code: StageFilter; label: string }> = [
  { code: 'ALL', label: 'All levels' },
  { code: 'EARLY_YEARS', label: 'Early years' },
  { code: 'FOUNDATIONAL', label: 'Foundational' },
  { code: 'PRIMARY', label: 'Primary' },
  { code: 'MIDDLE', label: 'Middle School' },
  { code: 'SECONDARY', label: 'Secondary' },
  { code: 'SENIOR_SECONDARY', label: 'Senior Secondary' },
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

const GRADE_SORT = new Map<string, number>(FALLBACK_GRADES.map((grade) => [grade.code, grade.sortOrder]));

function gradeLabel(code: string): string {
  if (code === 'PRE_NURSERY') return 'Pre-Nursery';
  if (code === 'NURSERY') return 'Nursery';
  if (code === 'LKG' || code === 'UKG') return code;
  if (code.startsWith('CLASS_')) return `Class ${code.replace('CLASS_', '')}`;
  return code.replaceAll('_', ' ');
}

function resourceIcon(resource: PublicLearningResource): LucideIcon {
  if (resource.resource_type === 'VIDEO') return CirclePlay;
  if (resource.resource_type === 'AUDIO') return Headphones;
  if (resource.resource_type === 'PDF') return FileText;
  if (resource.resource_type === 'WORKSHEET') return NotebookPen;
  if (resource.resource_type === 'QUESTION_PAPER') return FileQuestion;
  if (resource.resource_type === 'QUIZ') return Brain;
  if (resource.resource_type === 'INTERACTIVE') return Lightbulb;
  if (resource.resource_type === 'EXTERNAL_LINK') return ExternalLink;
  return CATEGORY_META[resource.category]?.icon || BookOpen;
}

function resourceTypeLabel(resourceType: PublicLearningResource['resource_type']): string {
  if (resourceType === 'QUESTION_PAPER') return 'Question paper';
  if (resourceType === 'EXTERNAL_LINK') return 'External resource';
  return resourceType.charAt(0) + resourceType.slice(1).toLowerCase().replaceAll('_', ' ');
}

function resourceGradeText(resource: PublicLearningResource, selectedGrade: string | null): string {
  if (resource.class_min && resource.class_max) {
    return resource.class_min === resource.class_max
      ? `Class ${resource.class_min}`
      : `Classes ${resource.class_min}–${resource.class_max}`;
  }

  const gradeCodes = [...(resource.grade_codes || [])]
    .filter(Boolean)
    .sort((a, b) => (GRADE_SORT.get(a) || 999) - (GRADE_SORT.get(b) || 999));

  if (selectedGrade && gradeCodes.includes(selectedGrade)) return gradeLabel(selectedGrade);
  if (gradeCodes.length === 0) return 'All learning levels';
  if (gradeCodes.length === 1) return gradeLabel(gradeCodes[0]);
  if (gradeCodes.length === 2) return `${gradeLabel(gradeCodes[0])} · ${gradeLabel(gradeCodes[1])}`;
  return `${gradeLabel(gradeCodes[0])} – ${gradeLabel(gradeCodes[gradeCodes.length - 1])}`;
}

function durationLabel(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
}

export default function PublicLearningLibrary() {
  const [filtersReady, setFiltersReady] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<StageFilter>('ALL');
  const [selectedBoard, setSelectedBoard] = useState('ALL');
  const [category, setCategory] = useState<LearningCategory | 'ALL'>('ALL');

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
    setFiltersReady(true);
  }, []);

  const overviewQuery = useQuery<PublicLearningOverview>({
    queryKey: ['public-learning-overview'],
    queryFn: ({ signal }) => getPublicLearningOverview({ signal }).then((response) => response.data.data),
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const sourcesQuery = useQuery<PublicLearningSource[]>({
    queryKey: ['public-learning-sources'],
    queryFn: ({ signal }) => getPublicLearningSources({ signal }).then((response) => response.data.data || []),
    staleTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const overview = overviewQuery.data || null;
  const gradeOptions = useMemo(() => overview?.grades?.length ? overview.grades : FALLBACK_GRADES, [overview]);
  const visibleGrades = useMemo(
    () => selectedStage === 'ALL' ? gradeOptions : gradeOptions.filter((grade) => grade.stage === selectedStage),
    [gradeOptions, selectedStage],
  );
  const selectedGradeMeta = useMemo(
    () => gradeOptions.find((grade) => grade.code === selectedGrade) || null,
    [gradeOptions, selectedGrade],
  );

  useEffect(() => {
    if (selectedGradeMeta && selectedStage !== 'ALL' && selectedGradeMeta.stage !== selectedStage) {
      setSelectedGrade(null);
    }
  }, [selectedGradeMeta, selectedStage]);

  const resourcesQuery = useQuery<PublicLearningResource[]>({
    queryKey: ['public-learning-resources', selectedGrade || 'ALL', selectedBoard, category],
    enabled: filtersReady,
    queryFn: ({ signal }) => getPublicLearningResources({
      grade: selectedGrade || undefined,
      category: category === 'ALL' ? undefined : category,
      board: selectedBoard === 'ALL' ? undefined : selectedBoard,
      limit: 60,
    }, { signal }).then((response) => response.data.data || []),
    staleTime: 15 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const assessmentClass = selectedGradeMeta?.classNumber || null;
  const assessmentsQuery = useQuery<PublicLearningAssessment[]>({
    queryKey: ['public-learning-assessments', assessmentClass, selectedBoard],
    enabled: filtersReady && Boolean(assessmentClass),
    queryFn: ({ signal }) => getPublicLearningAssessments({
      class: assessmentClass || undefined,
      board: selectedBoard === 'ALL' ? undefined : selectedBoard,
      limit: 24,
    }, { signal }).then((response) => response.data.data || []),
    staleTime: 30 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const resources = resourcesQuery.data || [];
  const assessments = assessmentsQuery.data || [];
  const sources = sourcesQuery.data || [];
  const boardOptions = useMemo(
    () => (overview?.boards || []).filter((board) => board.code !== 'OTHER_STATE'),
    [overview],
  );
  const categoryCounts = useMemo(
    () => new Map((overview?.categories || []).map((item) => [item.category, Number(item.count || 0)])),
    [overview],
  );
  const nroer = sources.find((source) => source.code === 'NROER');
  const original = sources.find((source) => source.code === 'VIDYASETU_ORIGINAL');

  const countsReady = overviewQuery.isSuccess && Boolean(overview);
  const activeFilterCount = Number(Boolean(selectedGrade)) + Number(selectedBoard !== 'ALL') + Number(category !== 'ALL');
  const activeGradeLabel = selectedGradeMeta?.shortName || 'All levels';
  const activeBoardLabel = selectedBoard === 'ALL'
    ? 'All boards'
    : boardOptions.find((board) => board.code === selectedBoard)?.short_name || selectedBoard;
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
            <h1 className={styles.title}>Learn with clarity.<br /><span className={styles.accent}>Practise with purpose. Grow for life.</span></h1>
            <p className={styles.copy}>One learning space for academic concepts, videos, reading, worksheets, question papers, practice, motivation, study skills, work ethic, social responsibility and life skills—built for Indian learners across boards.</p>
            <div className={styles.actions}>
              <a className={styles.primary} href="#browse">Explore free learning</a>
              <a className={styles.secondary} href="#practice">Practice by class</a>
              <Link className={styles.secondary} href="/login?role=student">Student login</Link>
            </div>
          </div>
          <aside className={styles.heroVisual}>
            <div className={styles.visualTitle}>A complete learning journey</div>
            <div className={styles.visualGrid}>
              <div className={styles.visualCard}><BookOpen size={25} /><strong>Concept learning</strong><small>Lessons, reading and video</small></div>
              <div className={styles.visualCard}><NotebookPen size={25} /><strong>Practice & papers</strong><small>Worksheets and question sets</small></div>
              <div className={styles.visualCard}><Target size={25} /><strong>Study better</strong><small>Focus, revision and routines</small></div>
              <div className={styles.visualCard}><Sparkles size={25} /><strong>Grow beyond marks</strong><small>Confidence, values and life skills</small></div>
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.statsStrip} aria-label="Learning catalogue summary">
        <div className={`${styles.shell} ${styles.statsGrid}`}>
          <div className={styles.statCard}><BookOpen size={21} /><div><strong>{overview ? overview.totalResources : '—'}</strong><small>Public resources</small></div></div>
          <div className={styles.statCard}><GraduationCap size={21} /><div><strong>{overview?.grades?.length || 16}</strong><small>Learning levels</small></div></div>
          <div className={styles.statCard}><CheckCircle2 size={21} /><div><strong>{overview?.originalResources ?? '—'}</strong><small>VidyaSetu originals</small></div></div>
          <div className={styles.statCard}><ExternalLink size={21} /><div><strong>{overview?.openResources ?? '—'}</strong><small>Open-resource references</small></div></div>
        </div>
      </section>

      <section className={styles.sectionAlt} id="browse">
        <div className={styles.shell}>
          <div className={styles.browsePanel}>
            <div className={styles.browseTop}>
              <div className={styles.sectionHeader}>
                <div className={styles.eyebrow}>Find the right learning path</div>
                <h2>Browse by learning level</h2>
                <p>Choose a stage and grade, then refine only when needed. Your grade stays the primary context.</p>
              </div>
              <div className={`${styles.coverageState} ${overviewQuery.isError ? styles.coverageError : ''}`}>
                <span className={overviewQuery.isPending ? styles.liveDot : overviewQuery.isError ? styles.liveDotError : styles.liveDotReady} />
                {overviewQuery.isPending ? 'Checking catalogue coverage' : overviewQuery.isError ? 'Coverage unavailable — retry below' : 'Live catalogue coverage'}
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
                    {countsReady ? `${item.resourceCount} public` : <span className={styles.countSkeleton} aria-label="Coverage loading" />}
                  </span>
                </button>
              ))}
            </div>

            {overviewQuery.isError && (
              <div className={styles.coverageRetry}>
                <span>Catalogue counts could not be refreshed. Learning resources are still available.</span>
                <button type="button" onClick={() => overviewQuery.refetch()}><RefreshCw size={14} /> Retry counts</button>
              </div>
            )}

            <div className={styles.boardFilterRow}>
              <label className={styles.publicField}>
                <span>Board</span>
                <select value={selectedBoard} onChange={(event) => setSelectedBoard(event.target.value)}>
                  <option value="ALL">All boards</option>
                  {boardOptions.map((board) => (
                    <option key={board.code} value={board.code}>{board.short_name || board.code} — {board.name}</option>
                  ))}
                </select>
              </label>
              <div className={styles.filterSummary}>
                <span className={styles.summaryLabel}>Showing</span>
                <strong>{activeGradeLabel}</strong>
                <span>{activeBoardLabel}</span>
                <span>{activeCategoryLabel}</span>
              </div>
              {activeFilterCount > 0 && <button type="button" className={styles.clearButton} onClick={clearFilters}>Clear filters</button>}
            </div>

            <div className={styles.learningTypeSection}>
              <div className={styles.filterSectionHeading}>
                <div>
                  <span>Learning type</span>
                  <strong>Explore more than the syllabus</strong>
                </div>
                <small>Choose one type or keep the full library visible.</small>
              </div>
              <div className={styles.categoryTabs} aria-label="Learning type filter">
                <button
                  type="button"
                  className={`${styles.categoryTab} ${styles.categoryAll} ${category === 'ALL' ? styles.categoryTabActive : ''}`}
                  onClick={() => setCategory('ALL')}
                >
                  <span className={styles.categoryIcon}><BookOpen size={17} /></span>
                  <span><strong>All learning</strong><small>{overview?.totalResources ?? '—'} resources</small></span>
                </button>
                {ALL_CATEGORIES.map((item) => {
                  const meta = CATEGORY_META[item];
                  const Icon = meta.icon;
                  return (
                    <button
                      type="button"
                      key={item}
                      className={`${styles.categoryTab} ${meta.tabTone} ${category === item ? styles.categoryTabActive : ''}`}
                      onClick={() => setCategory(item)}
                    >
                      <span className={styles.categoryIcon}><Icon size={17} /></span>
                      <span><strong>{meta.shortLabel}</strong><small>{countsReady ? `${categoryCounts.get(item) || 0} resources` : 'Browse category'}</small></span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className={styles.resultsHeader}>
            <div>
              <div className={styles.eyebrow}>Learning resources</div>
              <h2>{selectedGradeMeta ? `${selectedGradeMeta.shortName} learning` : 'Explore public learning'}</h2>
              <p>{category === 'ALL' ? 'Academic learning and personal growth resources in one library.' : `Showing ${CATEGORY_META[category].label.toLowerCase()} resources for the current filters.`}</p>
            </div>
            <div className={styles.resultCount}>
              {resourcesQuery.isPending ? 'Finding resources…' : resourcesQuery.isError ? 'Could not load' : `${resources.length} resource${resources.length === 1 ? '' : 's'}`}
            </div>
          </div>

          {resourcesQuery.isPending ? (
            <div className={styles.loadingGrid}>{[1, 2, 3].map((item) => <div className={styles.loadingCard} key={item}><span /><span /><span /><span /></div>)}</div>
          ) : resourcesQuery.isError ? (
            <div className={styles.empty}>
              <strong>Learning resources could not be loaded.</strong>
              <p>Your selected filters are safe. Retry without refreshing the whole page.</p>
              <button type="button" className={styles.retryButton} onClick={() => resourcesQuery.refetch()}><RefreshCw size={15} /> Retry resources</button>
            </div>
          ) : resources.length === 0 ? (
            <div className={styles.empty}>No public resources match these filters yet. Try another grade, board or learning type.</div>
          ) : (
            <div className={styles.resourceGrid}>{resources.map((resource) => {
              const categoryMeta = CATEGORY_META[resource.category] || CATEGORY_META.ACADEMIC;
              const ResourceIcon = resourceIcon(resource);
              const duration = durationLabel(resource.duration_secs);
              const subject = resource.subject_name || resource.subject_label || categoryMeta.label;
              const gradeText = resourceGradeText(resource, selectedGrade);
              return (
                <Link href={`/learn/resource/${resource.public_slug}`} className={`${styles.resourceCard} ${categoryMeta.tone}`} key={resource.id}>
                  <div className={styles.resourceMedia}>
                    <span className={styles.resourceIconWrap}><ResourceIcon size={25} strokeWidth={2.05} /></span>
                    <div className={styles.resourceBadges}>
                      {resource.is_featured_public && <span className={styles.featuredBadge}>Featured</span>}
                      <span className={styles.badge}>{categoryMeta.shortLabel}</span>
                    </div>
                  </div>

                  <div className={styles.resourceBody}>
                    <div className={styles.resourceEyebrow}>{subject}{resource.topic_label ? ` · ${resource.topic_label}` : ''}</div>
                    <h3>{resource.title}</h3>
                    <p>{resource.summary || 'Open this resource to continue learning.'}</p>

                    <div className={styles.resourceFacts}>
                      <span><GraduationCap size={14} /> {gradeText}</span>
                      <span><FileText size={14} /> {resourceTypeLabel(resource.resource_type)}</span>
                      {duration && <span><CirclePlay size={14} /> {duration}</span>}
                    </div>

                    <div className={styles.pillRow}>
                      {(resource.board_codes || []).slice(0, 2).map((board) => <span className={styles.pill} key={board}>{board === 'COMMON' ? 'Cross-board' : board}</span>)}
                      {resource.is_offline_ready && <span className={styles.pill}>Offline ready</span>}
                    </div>
                  </div>

                  <div className={styles.resourceFooter}>
                    <span className={styles.sourceTrust}><ShieldCheck size={14} /> {resource.source_name}</span>
                    <span className={styles.cardCta}>Open resource <ArrowRight size={16} /></span>
                  </div>
                </Link>
              );
            })}</div>
          )}
        </div>
      </section>

      <section className={`${styles.section} ${styles.practiceSection}`} id="practice">
        <div className={styles.shell}>
          <div className={styles.resultsHeader}>
            <div>
              <div className={styles.eyebrow}>Practise with feedback</div>
              <h2>Free practice & self-assessment</h2>
              <p>Select a school class above to load its practice sets. Early-years learning stays activity-led rather than exam-led.</p>
            </div>
            <span className={styles.practiceIcon}><Brain size={29} /></span>
          </div>

          {!selectedGrade ? (
            <div className={styles.empty}>Choose Class 1–12 above to see matching public practice. This keeps the first page load light and focused.</div>
          ) : !selectedGradeMeta?.classNumber ? (
            <div className={styles.empty}>For {selectedGradeMeta?.shortName || 'early-years learners'}, VidyaSetu prioritises playful activities, stories, audio, video and worksheets instead of formal scored tests.</div>
          ) : assessmentsQuery.isPending ? (
            <div className={styles.loadingGrid}>{[1, 2, 3].map((item) => <div className={styles.loadingCard} key={item}><span /><span /><span /><span /></div>)}</div>
          ) : assessmentsQuery.isError ? (
            <div className={styles.empty}><strong>Practice sets could not be loaded.</strong><p>Learning resources above remain available.</p></div>
          ) : assessments.length === 0 ? (
            <div className={styles.empty}>Public practice sets for {selectedGradeMeta.shortName} are being added.</div>
          ) : (
            <div className={styles.resourceGrid}>{assessments.map((assessment) => (
              <Link href={`/learn/practice/${assessment.public_slug}`} className={`${styles.resourceCard} ${styles.tonePractice}`} key={assessment.id}>
                <div className={styles.resourceMedia}>
                  <span className={styles.resourceIconWrap}><Brain size={25} /></span>
                  <div className={styles.resourceBadges}><span className={styles.badge}>{assessment.assessment_type.replaceAll('_', ' ')}</span></div>
                </div>
                <div className={styles.resourceBody}>
                  <div className={styles.resourceEyebrow}>{assessment.subject_name || 'Practice set'}</div>
                  <h3>{assessment.title}</h3>
                  <p>{assessment.summary || 'Open this VidyaSetu practice set.'}</p>
                  <div className={styles.resourceFacts}>
                    <span><FileQuestion size={14} /> {assessment.question_count} questions</span>
                    <span><CheckCircle2 size={14} /> {assessment.total_marks} marks</span>
                    {assessment.time_limit_mins && <span><CirclePlay size={14} /> {assessment.time_limit_mins} min</span>}
                  </div>
                  <div className={styles.pillRow}>{(assessment.board_codes || []).slice(0, 3).map((board) => <span className={styles.pill} key={board}>{board === 'COMMON' ? 'Cross-board' : board}</span>)}</div>
                </div>
                <div className={styles.resourceFooter}><span className={styles.sourceTrust}><ShieldCheck size={14} /> VidyaSetu Practice</span><span className={styles.cardCta}>Preview <ArrowRight size={16} /></span></div>
              </Link>
            ))}</div>
          )}
        </div>
      </section>

      <section className={styles.sectionAlt}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <div className={styles.eyebrow}>Beyond marks</div>
            <h2>Academic learning and human development belong together</h2>
            <p>VidyaSetu supports syllabus learning while helping children and young people build curiosity, habits, values and confidence appropriate to their stage of development.</p>
          </div>
          <div className={styles.featureGrid}>{[
            [BookOpen, 'Academic mastery', 'Board-aware subjects, concepts, reading, video, practice and question papers.', styles.featureBlue],
            [Target, 'Learning how to learn', 'Focus, revision, planning, exam preparation, mistakes and effective study routines.', styles.featureLavender],
            [Compass, 'Work ethic & responsibility', 'Reliability, preparation, integrity, finishing responsibilities and productive habits.', styles.featureAmber],
            [HandHeart, 'Social responsibility', 'Empathy, civic behaviour, respectful communities and responsible digital participation.', styles.featureGreen],
            [Sparkles, 'Motivation & resilience', 'Practical encouragement that helps learners restart, persist and learn from setbacks.', styles.featureMint],
            [CloudSun, 'Well-being & balance', 'Sustainable learning habits that respect sleep, movement, recovery and healthy routines.', styles.featurePeach],
          ].map(([Icon, title, copy, tone]) => {
            const FeatureIcon = Icon as LucideIcon;
            return <article className={`${styles.featureCard} ${tone}`} key={String(title)}><div className={styles.featureIcon}><FeatureIcon size={22} /></div><h3>{String(title)}</h3><p>{String(copy)}</p></article>;
          })}</div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <div className={styles.eyebrow}>Cross-board by design</div>
            <h2>Built for multiple Indian boards</h2>
            <p>CBSE is one option, not the product boundary. State and national boards can carry their own curriculum while COMMON resources serve learners across boards.</p>
          </div>
          <div className={styles.boardGrid}>{(overview?.boards || []).slice(0, 16).map((board) => <div className={styles.boardCard} key={board.code}><strong>{board.short_name || board.code}</strong><span>{board.name}{board.state ? ` · ${board.state}` : ''}</span></div>)}</div>
        </div>
      </section>

      <section className={styles.sectionAlt}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <div className={styles.eyebrow}>Trusted content operations</div>
            <h2>A content library with source and licence discipline</h2>
            <p>VidyaSetu separates “free to access” from “safe to copy”. External content carries source and licence evidence before it may be linked, adapted or hosted.</p>
          </div>
          <div className={styles.sourcePanel}>
            <div className={styles.sourceCard}><BookOpen size={26} /><h3>{original?.name || 'VidyaSetu Original'}</h3><p>Our primary library: original lessons, explanations, practice, question banks, motivation, study skills, work ethic, social responsibility and life-skills resources authored and reviewed for VidyaSetu.</p></div>
            <div className={`${styles.sourceCard} ${styles.light}`}><ExternalLink size={26} /><h3>{nroer?.name || 'NROER open resources'}</h3><p>Potential NROER material moves through discovery → licence review → content review → approval. Rehosting is never assumed and attribution is mandatory where required.</p></div>
          </div>
          <div className={styles.note}>Official resources with restrictive or uncertain rehosting terms are treated as external references rather than copied into VidyaSetu storage.</div>
        </div>
      </section>
    </div>
  );
}
