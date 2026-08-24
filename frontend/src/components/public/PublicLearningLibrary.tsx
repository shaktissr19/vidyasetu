'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  Calculator,
  CirclePlay,
  CloudSun,
  Compass,
  FileQuestion,
  FileText,
  FlaskConical,
  GraduationCap,
  HandHeart,
  Headphones,
  Languages,
  Laptop2,
  Lightbulb,
  NotebookPen,
  RefreshCw,
  Target,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import ImageHero from '@/components/public/ImageHero';
import {
  getPublicLearningAssessments,
  getPublicLearningOverview,
  getPublicLearningResources,
  type LearningCategory,
  type PublicLearningAssessment,
  type PublicLearningGrade,
  type PublicLearningOverview,
  type PublicLearningResource,
} from '@/services/publicService';
import styles from './learningEditorial.module.css';

interface CategoryMeta {
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  tone: string;
}

const CATEGORY_META: Record<LearningCategory, CategoryMeta> = {
  ACADEMIC: { label: 'Academic Learning', shortLabel: 'Academic', icon: BookOpen, tone: styles.blue },
  MOTIVATION: { label: 'Motivation', shortLabel: 'Motivation', icon: TrendingUp, tone: styles.green },
  STUDY_SKILLS: { label: 'Study Skills', shortLabel: 'Study Skills', icon: Target, tone: styles.violet },
  WORK_ETHIC: { label: 'Work Ethic', shortLabel: 'Work Ethic', icon: Compass, tone: styles.gold },
  SOCIAL_RESPONSIBILITY: { label: 'Social Responsibility', shortLabel: 'Social Responsibility', icon: HandHeart, tone: styles.teal },
  LIFE_SKILLS: { label: 'Life Skills', shortLabel: 'Life Skills', icon: Wrench, tone: styles.lilac },
  WELLBEING: { label: 'Well-being', shortLabel: 'Well-being', icon: CloudSun, tone: styles.sky },
  CAREER_AWARENESS: { label: 'Career Awareness', shortLabel: 'Career', icon: BriefcaseBusiness, tone: styles.rose },
  DIGITAL_CITIZENSHIP: { label: 'Digital Citizenship', shortLabel: 'Digital Citizenship', icon: Laptop2, tone: styles.indigo },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_META) as LearningCategory[];
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
const GRADE_SORT = new Map<string, number>(FALLBACK_GRADES.map((grade) => [grade.code, grade.sortOrder]));
const INITIAL_RESOURCE_LIMIT = 6;
const MAX_HOME_RESOURCE_LIMIT = 24;

const DEVELOPMENT_PILLARS: Array<{
  category: LearningCategory;
  eyebrow: string;
  title: string;
  copy: string;
  icon: LucideIcon;
  tone: string;
}> = [
  { category: 'ACADEMIC', eyebrow: 'ACADEMIC MASTERY', title: 'Build strong concepts, not just answers', copy: 'Board-aware lessons, reading, video, practice and question papers organised around the learner’s stage.', icon: BookOpen, tone: styles.blue },
  { category: 'STUDY_SKILLS', eyebrow: 'LEARNING HOW TO LEARN', title: 'Turn effort into a repeatable study habit', copy: 'Focus, revision, planning, exam preparation and practical routines that make everyday learning easier.', icon: Target, tone: styles.violet },
  { category: 'WORK_ETHIC', eyebrow: 'WORK ETHIC', title: 'Show up prepared and finish what matters', copy: 'Reliability, preparation, integrity and productive habits for school today and responsibilities later in life.', icon: Compass, tone: styles.gold },
  { category: 'SOCIAL_RESPONSIBILITY', eyebrow: 'SOCIAL RESPONSIBILITY', title: 'Grow into a thoughtful member of the community', copy: 'Respect, contribution, digital citizenship and everyday choices that make classrooms and communities better.', icon: HandHeart, tone: styles.teal },
  { category: 'MOTIVATION', eyebrow: 'MOTIVATION & RESILIENCE', title: 'Keep moving when progress feels slow', copy: 'Confidence, consistency, learning from mistakes and realistic goal-setting without empty motivational slogans.', icon: TrendingUp, tone: styles.green },
  { category: 'WELLBEING', eyebrow: 'WELL-BEING', title: 'Make room for balance as well as achievement', copy: 'Age-appropriate guidance around routines, emotional balance and sustainable learning habits.', icon: CloudSun, tone: styles.sky },
];

function gradeLabel(code: string): string {
  if (code === 'PRE_NURSERY') return 'Pre-Nursery';
  if (code === 'NURSERY') return 'Nursery';
  if (code === 'LKG' || code === 'UKG') return code;
  if (code.startsWith('CLASS_')) return `Class ${code.replace('CLASS_', '')}`;
  return code.replaceAll('_', ' ');
}

function resourceIcon(resource: PublicLearningResource): LucideIcon {
  const subject = `${resource.subject_name || ''} ${resource.subject_label || ''}`.toLowerCase();
  if (subject.includes('math')) return Calculator;
  if (subject.includes('science')) return FlaskConical;
  if (subject.includes('english') || subject.includes('language')) return Languages;
  if (resource.resource_type === 'VIDEO') return CirclePlay;
  if (resource.resource_type === 'AUDIO') return Headphones;
  if (resource.resource_type === 'PDF') return FileText;
  if (resource.resource_type === 'WORKSHEET') return NotebookPen;
  if (resource.resource_type === 'QUESTION_PAPER') return FileQuestion;
  if (resource.resource_type === 'QUIZ') return Brain;
  if (resource.resource_type === 'INTERACTIVE') return Lightbulb;
  return CATEGORY_META[resource.category]?.icon || BookOpen;
}

function resourceTypeLabel(resourceType: PublicLearningResource['resource_type']): string {
  if (resourceType === 'QUESTION_PAPER') return 'Question paper';
  if (resourceType === 'EXTERNAL_LINK') return 'External resource';
  return resourceType.charAt(0) + resourceType.slice(1).toLowerCase().replaceAll('_', ' ');
}

function resourceGradeText(resource: PublicLearningResource, selectedGrade: string | null): string {
  if (resource.class_min && resource.class_max) {
    return resource.class_min === resource.class_max ? `Class ${resource.class_min}` : `Classes ${resource.class_min}–${resource.class_max}`;
  }
  const gradeCodes = [...(resource.grade_codes || [])].filter(Boolean).sort((a, b) => (GRADE_SORT.get(a) || 999) - (GRADE_SORT.get(b) || 999));
  if (selectedGrade && gradeCodes.includes(selectedGrade)) return gradeLabel(selectedGrade);
  if (gradeCodes.length === 0) return 'All learning levels';
  if (gradeCodes.length === 1) return gradeLabel(gradeCodes[0]);
  if (gradeCodes.length === 2) return `${gradeLabel(gradeCodes[0])} · ${gradeLabel(gradeCodes[1])}`;
  return `${gradeLabel(gradeCodes[0])} – ${gradeLabel(gradeCodes[gradeCodes.length - 1])}`;
}

function durationLabel(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function scrollToResources(): void {
  window.setTimeout(() => document.getElementById('resources')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

function ResourceCard({ resource, selectedGrade }: { resource: PublicLearningResource; selectedGrade: string | null }) {
  const meta = CATEGORY_META[resource.category] || CATEGORY_META.ACADEMIC;
  const Icon = resourceIcon(resource);
  const duration = durationLabel(resource.duration_secs);
  return (
    <Link className={`${styles.resourceCard} ${meta.tone}`} href={`/learn/resource/${resource.public_slug}`}>
      {resource.thumbnail_url && (
        <div className={styles.resourceImage}>
          <img src={resource.thumbnail_url} alt="" loading="lazy" />
        </div>
      )}
      <div className={styles.resourceBody}>
        <div className={styles.resourceTopline}>
          <span className={styles.resourceIconBadge}><Icon size={20} strokeWidth={1.8} /></span>
          <span className={styles.resourceEyebrow}>{resource.subject_name || resource.subject_label || meta.shortLabel}</span>
        </div>
        <h3>{resource.title}</h3>
        <p>{resource.summary || 'Open this resource to learn, practise and continue your learning journey.'}</p>
        <div className={styles.resourceFacts}>
          <span>{resourceGradeText(resource, selectedGrade)}</span>
          <span>{resourceTypeLabel(resource.resource_type)}</span>
          {duration && <span>{duration}</span>}
          {(resource.board_codes || []).includes('COMMON') && <span>Cross-board</span>}
        </div>
        <div className={styles.resourceLink}>Explore resource <ArrowRight size={17} /></div>
      </div>
    </Link>
  );
}

export default function PublicLearningLibrary() {
  const [filtersReady, setFiltersReady] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<StageFilter>('ALL');
  const [selectedBoard, setSelectedBoard] = useState('ALL');
  const [category, setCategory] = useState<LearningCategory | 'ALL'>('ALL');
  const [resourceLimit, setResourceLimit] = useState(INITIAL_RESOURCE_LIMIT);

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

  useEffect(() => {
    if (!filtersReady) return;
    const params = new URLSearchParams();
    if (selectedGrade) params.set('grade', selectedGrade);
    if (selectedBoard !== 'ALL') params.set('board', selectedBoard);
    if (category !== 'ALL') params.set('category', category);
    window.history.replaceState({}, '', params.toString() ? `/learn?${params.toString()}` : '/learn');
  }, [category, filtersReady, selectedBoard, selectedGrade]);

  useEffect(() => {
    setResourceLimit(INITIAL_RESOURCE_LIMIT);
  }, [selectedGrade, selectedBoard, category]);

  const overviewQuery = useQuery<PublicLearningOverview>({
    queryKey: ['public-learning-overview'],
    queryFn: ({ signal }) => getPublicLearningOverview({ signal }).then((response) => response.data.data),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const overview = overviewQuery.data || null;
  const gradeOptions = useMemo(() => overview?.grades?.length ? overview.grades : FALLBACK_GRADES, [overview]);
  const visibleGrades = useMemo(() => selectedStage === 'ALL' ? gradeOptions : gradeOptions.filter((grade) => grade.stage === selectedStage), [gradeOptions, selectedStage]);
  const selectedGradeMeta = useMemo(() => gradeOptions.find((grade) => grade.code === selectedGrade) || null, [gradeOptions, selectedGrade]);
  const boardOptions = useMemo(() => (overview?.boards || []).filter((board) => board.code !== 'OTHER_STATE'), [overview]);

  useEffect(() => {
    if (selectedGradeMeta && selectedStage !== 'ALL' && selectedGradeMeta.stage !== selectedStage) setSelectedGrade(null);
  }, [selectedGradeMeta, selectedStage]);

  const resourcesQuery = useQuery<PublicLearningResource[]>({
    queryKey: ['public-learning-resources', selectedGrade || 'ALL', selectedBoard, category, resourceLimit],
    enabled: filtersReady,
    queryFn: ({ signal }) => getPublicLearningResources({
      grade: selectedGrade || undefined,
      category: category === 'ALL' ? undefined : category,
      board: selectedBoard === 'ALL' ? undefined : selectedBoard,
      limit: resourceLimit,
    }, { signal }).then((response) => response.data.data || []),
    staleTime: 20 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

  const assessmentClass = selectedGradeMeta?.classNumber || null;
  const assessmentsQuery = useQuery<PublicLearningAssessment[]>({
    queryKey: ['public-learning-assessments', assessmentClass, selectedBoard],
    enabled: filtersReady && Boolean(assessmentClass),
    queryFn: ({ signal }) => getPublicLearningAssessments({ class: assessmentClass || undefined, board: selectedBoard === 'ALL' ? undefined : selectedBoard, limit: 6 }, { signal }).then((response) => response.data.data || []),
    staleTime: 30 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const resources = resourcesQuery.data || [];
  const assessments = assessmentsQuery.data || [];
  const activeGradeLabel = selectedGradeMeta?.shortName || 'All levels';
  const activeCategoryLabel = category === 'ALL' ? 'All learning' : CATEGORY_META[category].label;
  const activeBoardLabel = selectedBoard === 'ALL' ? 'All boards' : boardOptions.find((board) => board.code === selectedBoard)?.short_name || selectedBoard;
  const canLoadMore = resources.length === resourceLimit && resourceLimit < MAX_HOME_RESOURCE_LIMIT;
  const libraryParams = new URLSearchParams();
  if (selectedGrade) libraryParams.set('grade', selectedGrade);
  if (selectedBoard !== 'ALL') libraryParams.set('board', selectedBoard);
  if (category !== 'ALL') libraryParams.set('category', category);
  const libraryHref = `/learn/library${libraryParams.toString() ? `?${libraryParams.toString()}` : ''}`;

  function chooseGrade(grade: PublicLearningGrade): void {
    setSelectedGrade(grade.code);
    setSelectedStage(grade.stage);
    scrollToResources();
  }

  function chooseCategory(next: LearningCategory | 'ALL'): void {
    setCategory(next);
    scrollToResources();
  }

  function clearFilters(): void {
    setSelectedGrade(null);
    setSelectedStage('ALL');
    setSelectedBoard('ALL');
    setCategory('ALL');
  }

  return (
    <div className={styles.page}>
      <GlobalTopbar />

      <ImageHero
        image="https://images.pexels.com/photos/6482219/pexels-photo-6482219.jpeg?auto=compress&cs=tinysrgb&w=1800"
        imagePosition="68% center"
        eyebrow="Learning · Pre-Nursery to Class 12 · Cross-board"
        title="Learn with clarity. Practise with purpose."
        description="Lessons, reading, video, worksheets, question papers and life skills — organised around the learner’s stage."
        theme="blue"
        actions={[
          { label: 'Explore learning', href: '#browse' },
          { label: 'Practice by class', href: '#practice', variant: 'secondary' },
        ]}
      />

      <section className={styles.browseSection} id="browse">
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <div className={styles.eyebrow}>FIND THE RIGHT LEARNING PATH</div>
            <h2>Browse by learning level</h2>
            <p>Choose a stage or grade first. Narrow by board only when the curriculum needs to be more specific.</p>
          </div>

          <div className={styles.stageTabs}>
            {STAGE_META.map((stage) => <button key={stage.code} type="button" className={selectedStage === stage.code ? styles.stageActive : styles.stageButton} onClick={() => setSelectedStage(stage.code)}>{stage.label}</button>)}
          </div>

          <div className={styles.gradeGrid}>
            {visibleGrades.map((grade) => <button key={grade.code} type="button" className={`${styles.gradeButton} ${STAGE_TONE[grade.stage]} ${selectedGrade === grade.code ? styles.gradeActive : ''}`} onClick={() => chooseGrade(grade)}><span>{grade.shortName}</span></button>)}
          </div>

          <div className={styles.filterRow}>
            <label><span>BOARD</span><select value={selectedBoard} onChange={(event) => setSelectedBoard(event.target.value)}><option value="ALL">All boards</option>{boardOptions.map((board) => <option key={board.code} value={board.code}>{board.short_name || board.name}</option>)}</select></label>
            <div className={styles.filterSummary}><span>Showing</span><strong>{activeGradeLabel}</strong><em>{activeBoardLabel}</em><em>{activeCategoryLabel}</em></div>
            {(selectedGrade || selectedBoard !== 'ALL' || category !== 'ALL') && <button type="button" className={styles.clearButton} onClick={clearFilters}>Clear filters</button>}
          </div>

          <div className={styles.categorySection}>
            <div className={styles.categoryHeading}><div><span>LEARNING TYPE</span><h3>Explore more than the syllabus</h3></div><p>Academic learning stays central, with visible pathways for study habits, confidence, responsibility and life skills.</p></div>
            <div className={styles.categoryGrid}>
              <button type="button" className={`${styles.categoryCard} ${styles.neutral} ${category === 'ALL' ? styles.categoryActive : ''}`} onClick={() => chooseCategory('ALL')}><BookOpen /><strong>All learning</strong><span>Explore everything</span></button>
              {ALL_CATEGORIES.map((item) => { const meta = CATEGORY_META[item]; const Icon = meta.icon; return <button key={item} type="button" className={`${styles.categoryCard} ${meta.tone} ${category === item ? styles.categoryActive : ''}`} onClick={() => chooseCategory(item)}><Icon /><strong>{meta.shortLabel}</strong><span>Explore this path</span></button>; })}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.resourcesSection} id="resources">
        <div className={styles.shell}>
          <div className={styles.resultsHeading}>
            <div><div className={styles.eyebrow}>LEARNING RESOURCES</div><h2>{selectedGradeMeta ? `${selectedGradeMeta.shortName} learning` : 'Explore learning'}</h2><p>{category === 'ALL' ? 'A focused preview of academic learning and personal growth resources.' : `A focused preview of ${CATEGORY_META[category].label.toLowerCase()} resources.`}</p></div>
            {resourcesQuery.isFetching && resources.length > 0 && <span className={styles.updating}>Updating…</span>}
          </div>

          {resourcesQuery.isError ? (
            <div className={styles.errorState}><strong>Learning resources could not be loaded.</strong><span>You do not need to refresh the whole page.</span><button type="button" onClick={() => resourcesQuery.refetch()}><RefreshCw size={16} /> Try again</button></div>
          ) : resourcesQuery.isPending && resources.length === 0 ? (
            <div className={styles.resourceGrid}>{[0, 1, 2].map((item) => <div key={item} className={styles.skeletonCard}><span /><span /><span /></div>)}</div>
          ) : resources.length ? (
            <>
              <div className={styles.resourceGrid}>{resources.map((resource) => <ResourceCard key={resource.id} resource={resource} selectedGrade={selectedGrade} />)}</div>
              <div className={styles.resourceActions}>
                {canLoadMore && <button type="button" className={styles.loadMoreButton} onClick={() => setResourceLimit((value) => Math.min(value + 6, MAX_HOME_RESOURCE_LIMIT))}>Load 6 more</button>}
                <Link className={styles.viewAllButton} href={libraryHref}>View all learning <ArrowRight size={17} /></Link>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}><BookOpen size={28} /><strong>No resource matches this combination yet.</strong><span>Try another learning type or board, or clear the filters.</span><button type="button" onClick={clearFilters}>Show all learning</button></div>
          )}
        </div>
      </section>

      <section className={styles.practiceSection} id="practice">
        <div className={styles.shell}>
          <div className={styles.sectionHeading}><div className={styles.eyebrow}>PRACTISE AND CHECK UNDERSTANDING</div><h2>{assessmentClass ? `Practice for Class ${assessmentClass}` : 'Practice when the learner is ready'}</h2><p>Short practice sets and question papers help students check what they understand before moving ahead.</p></div>
          {assessmentClass ? assessmentsQuery.isError ? (
            <div className={styles.errorState}><strong>Practice could not be loaded.</strong><button type="button" onClick={() => assessmentsQuery.refetch()}><RefreshCw size={16} /> Try again</button></div>
          ) : assessments.length ? (
            <div className={styles.practiceGrid}>{assessments.slice(0, 6).map((assessment) => <Link key={assessment.id} href={`/learn/practice/${assessment.public_slug}`} className={styles.practiceCard}><FileQuestion size={26} /><span>{assessment.assessment_type.replaceAll('_', ' ')}</span><h3>{assessment.title}</h3><p>{assessment.summary || 'A focused practice set for this learning level.'}</p><div>{assessment.question_count} questions {assessment.time_limit_mins ? `· ${assessment.time_limit_mins} min` : ''}</div><strong>Start practice <ArrowRight size={16} /></strong></Link>)}</div>
          ) : <div className={styles.practicePrompt}>More practice for this class can be added through the Learning Studio as the catalogue grows.</div> : <div className={styles.practicePrompt}><GraduationCap size={24} /> Choose a school class above to see practice sets for that level.</div>}
        </div>
      </section>

      <section className={styles.developmentSection}>
        <div className={styles.shell}>
          <div className={styles.developmentHeading}><div className={styles.eyebrow}>BEYOND MARKS</div><h2>Learning for school. Skills for life.</h2><p>Academic progress matters, and so do curiosity, habits, values, resilience and confidence at every stage of development.</p></div>
          <div className={styles.pillarGrid}>
            {DEVELOPMENT_PILLARS.map((pillar) => { const Icon = pillar.icon; return <button key={pillar.category} type="button" className={`${styles.pillarCard} ${pillar.tone}`} onClick={() => chooseCategory(pillar.category)}><div className={styles.pillarIcon}><Icon size={28} strokeWidth={1.75} /></div><span>{pillar.eyebrow}</span><h3>{pillar.title}</h3><p>{pillar.copy}</p><strong>Explore this area <ArrowRight size={16} /></strong></button>; })}
          </div>
        </div>
      </section>

      <section className={styles.finalCta}><div className={styles.shell}><div className={styles.ctaInner}><div><span>LEARNING CONTINUES AFTER SIGN-IN</span><h2>Save progress. Keep practising. Return where you left off.</h2><p>Student accounts add class-aware recommendations, bookmarks, progress, assessment history and school-connected learning.</p></div><div className={styles.ctaActions}><Link className={styles.primaryAction} href="/login?role=student">Student login</Link><Link className={styles.secondaryLight} href="/?auth=register">Create account</Link></div></div></div></section>
    </div>
  );
}
