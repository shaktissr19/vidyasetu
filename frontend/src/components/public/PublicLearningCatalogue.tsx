'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import SubjectVisual from '@/components/public/SubjectVisual';
import { getPublicLearningOverview, type LearningCategory, type PublicLearningOverview } from '@/services/publicService';
import {
  getPublicLearningCatalogue,
  getPublicLearningFilterOptions,
  type PublicLearningCatalogueResource,
} from '@/services/publicLearningCatalogueService';
import styles from './learningEditorial.module.css';

const CATEGORIES: Array<{ value: LearningCategory; label: string }> = [
  { value: 'ACADEMIC', label: 'Academic Learning' },
  { value: 'MOTIVATION', label: 'Motivation' },
  { value: 'STUDY_SKILLS', label: 'Study Skills' },
  { value: 'WORK_ETHIC', label: 'Work Ethic' },
  { value: 'SOCIAL_RESPONSIBILITY', label: 'Social Responsibility' },
  { value: 'LIFE_SKILLS', label: 'Life Skills' },
  { value: 'WELLBEING', label: 'Well-being' },
  { value: 'CAREER_AWARENESS', label: 'Career Awareness' },
  { value: 'DIGITAL_CITIZENSHIP', label: 'Digital Citizenship' },
];

const CATEGORY_TONE: Record<LearningCategory, string> = {
  ACADEMIC: styles.blue,
  MOTIVATION: styles.green,
  STUDY_SKILLS: styles.violet,
  WORK_ETHIC: styles.gold,
  SOCIAL_RESPONSIBILITY: styles.teal,
  LIFE_SKILLS: styles.lilac,
  WELLBEING: styles.sky,
  CAREER_AWARENESS: styles.rose,
  DIGITAL_CITIZENSHIP: styles.indigo,
};

const FILTER_STYLE = {
  width: '100%',
  padding: '10px 11px',
  borderRadius: 10,
  border: '1px solid #d8e0e8',
  background: '#fff',
  color: '#14243a',
  fontSize: 13,
} as const;

function categoryLabel(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function gradeLabel(resource: PublicLearningCatalogueResource): string {
  if (resource.class_min && resource.class_max) return resource.class_min === resource.class_max ? `Class ${resource.class_min}` : `Classes ${resource.class_min}–${resource.class_max}`;
  const codes = resource.grade_codes || [];
  if (codes.length === 1) return codes[0].startsWith('CLASS_') ? `Class ${codes[0].replace('CLASS_', '')}` : codes[0].replaceAll('_', ' ');
  if (codes.length > 1) return 'Multiple levels';
  return 'All levels';
}

function stageLabel(value: string): string {
  const labels: Record<string, string> = {
    SEE: 'See / Explore', UNDERSTAND: 'Understand', DO: 'Do / Guided activity', PRACTISE: 'Practise', APPLY: 'Apply', REVISE: 'Revise',
  };
  return labels[value] || categoryLabel(value);
}

function typeLabel(value: string): string {
  return value === 'QUESTION_PAPER' ? 'Question paper' : value === 'EXTERNAL_LINK' ? 'External resource' : categoryLabel(value);
}

function displayTitle(resource: PublicLearningCatalogueResource, language: string): string {
  return language === 'hi' && resource.title_hi?.trim() ? resource.title_hi : resource.title;
}

function displaySummary(resource: PublicLearningCatalogueResource, language: string): string {
  if (language === 'hi' && resource.summary_hi?.trim()) return resource.summary_hi;
  return resource.summary || 'Open this resource to continue learning.';
}

export default function PublicLearningCatalogue() {
  const [ready, setReady] = useState(false);
  const [grade, setGrade] = useState('');
  const [board, setBoard] = useState('');
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [concept, setConcept] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [journeyStage, setJourneyStage] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setGrade((params.get('grade') || '').toUpperCase());
    setBoard((params.get('board') || '').toUpperCase());
    setCategory((params.get('category') || '').toUpperCase());
    setSubject(params.get('subject') || '');
    setConcept(params.get('concept') || '');
    setResourceType((params.get('type') || '').toUpperCase());
    setLanguage(params.get('lang') === 'hi' ? 'hi' : 'en');
    setJourneyStage((params.get('stage') || '').toUpperCase());
    const initialSearch = params.get('q') || '';
    setSearchInput(initialSearch);
    setSearch(initialSearch);
    setReady(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams();
    if (grade) params.set('grade', grade);
    if (board) params.set('board', board);
    if (category) params.set('category', category);
    if (subject) params.set('subject', subject);
    if (concept) params.set('concept', concept);
    if (resourceType) params.set('type', resourceType);
    if (language !== 'en') params.set('lang', language);
    if (journeyStage) params.set('stage', journeyStage);
    if (search) params.set('q', search);
    window.history.replaceState({}, '', params.toString() ? `/learn/library?${params.toString()}` : '/learn/library');
  }, [board, category, concept, grade, journeyStage, language, ready, resourceType, search, subject]);

  const overviewQuery = useQuery<PublicLearningOverview>({
    queryKey: ['public-learning-overview-catalogue'],
    queryFn: ({ signal }) => getPublicLearningOverview({ signal }).then((response) => response.data.data),
    staleTime: 60_000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const optionsQuery = useQuery({
    queryKey: ['public-learning-filter-options'],
    queryFn: ({ signal }) => getPublicLearningFilterOptions(signal).then((response) => response.data.data),
    staleTime: 60_000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const query = useQuery<PublicLearningCatalogueResource[]>({
    queryKey: ['public-learning-full-catalogue-v2', grade, board, category, subject, concept, resourceType, language, journeyStage, search],
    enabled: ready,
    queryFn: ({ signal }) => getPublicLearningCatalogue({
      grade: grade || undefined,
      board: board || undefined,
      category: category || undefined,
      subject: subject || undefined,
      concept: concept || undefined,
      type: resourceType || undefined,
      lang: language,
      stage: journeyStage || undefined,
      q: search || undefined,
      limit: 200,
    }, signal).then((response) => response.data.data || []),
    staleTime: 20_000,
    retry: 2,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const options = optionsQuery.data;
  const resources = query.data || [];
  const concepts = useMemo(() => (options?.concepts || []).filter((item) => !subject || item.subjectCode === subject || item.subjectCode?.toUpperCase() === subject.toUpperCase()), [options?.concepts, subject]);
  const hasFilters = Boolean(grade || board || category || subject || concept || resourceType || journeyStage || search || language === 'hi');

  useEffect(() => {
    if (concept && !concepts.some((item) => item.code === concept)) setConcept('');
  }, [concept, concepts]);

  function clearFilters(): void {
    setGrade(''); setBoard(''); setCategory(''); setSubject(''); setConcept(''); setResourceType(''); setLanguage('en'); setJourneyStage(''); setSearchInput(''); setSearch('');
  }

  return (
    <div className={styles.cataloguePage}>
      <GlobalTopbar />
      <section className={styles.catalogueHero}>
        <div className={styles.shell}>
          <Link href="/learn" className={styles.catalogueBack}><ArrowLeft size={16} /> Back to Learning</Link>
          <h1>{language === 'hi' ? 'डिजिटल लर्निंग लाइब्रेरी' : 'Digital Learning Library'}</h1>
          <p>{language === 'hi' ? 'कक्षा, बोर्ड, विषय, अवधारणा और सीखने के चरण के अनुसार केवल समीक्षा-स्वीकृत सामग्री खोजें।' : 'Find governed, review-approved learning by class, board, subject, concept, language, resource type and learning stage.'}</p>
        </div>
      </section>

      <section className={styles.catalogueBody}>
        <div className={styles.shell}>
          <div style={{ border: '1px solid #e0e6ec', borderRadius: 16, padding: 16, background: '#f8fafc', marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 13, flexWrap: 'wrap' }}>
              <strong style={{ display: 'flex', gap: 7, alignItems: 'center', color: '#18324e' }}><SlidersHorizontal size={17} /> Find the right learning resource</strong>
              {hasFilters && <button type="button" onClick={clearFilters} style={{ border: 0, background: 'transparent', color: '#34658e', display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer', fontWeight: 700 }}><X size={15} /> Clear filters</button>}
            </div>

            <div style={{ position: 'relative', marginBottom: 11 }}>
              <Search size={17} style={{ position: 'absolute', left: 12, top: 12, color: '#6d8295' }} />
              <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search lessons, topics or concepts / पाठ, विषय या अवधारणा खोजें" style={{ ...FILTER_STYLE, paddingLeft: 38 }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 9 }}>
              <select aria-label="Grade" value={grade} onChange={(event) => setGrade(event.target.value)} style={FILTER_STYLE}>
                <option value="">All classes / levels</option>
                {(overviewQv�������k�w��` z-index: 1;
  border: 1px solid #dce4ec;
  background: rgba(250,252,254,.96);
  border-radius: 18px;
  padding: 18px;
  box-shadow: 0 9px 23px rgba(13,27,62,.05);
}

.journeyTop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #315f92;
  margin-bottom: 13px;
}

.journeyTop span {
  display: grid;
  place-items: center;
  width: 33px;
  height: 33px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #cedbe8;
  font-size: 10px;
  font-weight: 900;
  color: #ff6b00;
}

.journeyCard h3 {
  margin: 0;
  font-family: 'Baloo 2', cursive;
  font-size: 19px;
  line-height: 1.1;
  color: #112c57;
}

.journeyCard p {
  margin: 7px 0 0;
  color: #64718a;
  font-size: 13px;
  line-height: 1.5;
}

.liveSection { padding: 62px 0; background:#f4f7fb; }
.liveGrid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:50px; }
.stack { display:grid; gap:10px; }
.listCard { display:flex; justify-content:space-between; align-items:center; gap:18px; background:#fff; border:1px solid #dfe7f0; border-radius:13px; padding:14px 16px; }
.listCard strong { font-size:13.5px; }
.listCard span { font-size:11.5px; color:#657089; text-align:right; }
.inlineLink { display:inline-flex; margin-top:15px; font-size:13px; }

.whySection { padding:60px 0; background:var(--page-bg, #F3F6FA); }
.whyGrid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:13px; }
.whyCard { padding:19px 17px; border-radius:17px; border:1px solid #d9e2eb; background:#f5f8fc; box-shadow:0 8px 20px rgba(13,27,62,.045); }
.whyCard:nth-child(2){background:#eff8f0}.whyCard:nth-child(3){background:#fff4eb}.whyCard:nth-child(4){background:#f4effd}.whyCard:nth-child(5){background:#eaf7f9}
.whyCard>div{font-size:24px;margin-bottom:9px}.whyCard strong{font-family:'Baloo 2',cursive;font-size:17px}.whyCard p{font-size:12.5px;line-height:1.5;color:#657089;margin:5px 0 0}

.finalCta { padding:54px 0; background:#f6f9fc; }
.finalCtaInner { background:linear-gradient(120deg,#10264f,#224e83); border-radius:24px; padding:34px 38px; color:#fff; display:flex; justify-content:space-between; align-items:center; gap:30px; }
.finalCtaInner h2 { color:#fff; font-size:32px; max-width:760px; }
.finalCtaInner p { color:rgba(255,255,255,.76); max-width:760px; line-height:1.55; font-size:14px; }
.ctaActions { display:flex; gap:10px; flex-shrink:0; }
.ctaActions a { padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:850; }
.ctaActions a:first-child { background:#FF8A3D; color:#14213D; }
.finalCtaInner span { color:#FFC299; }
.ctaActions a:last-child { background:#fff; color:#10264f; }
.footer { text-align:center; padding:24px; color:#6b7488; font-size:12px; background:#f8fafc; }

@media(max-width:1050px) {
  .benefitGrid { grid-template-columns:repeat(2,1fr); }
  .moduleGrid { grid-template-columns:repeat(2,1fr); }
  .journeyGrid { grid-template-columns:repeat(2,1fr); }
  .journeyGrid::before { display:none; }
  .whyGrid { grid-template-columns:repeat(3,1fr); }
}

@media(max-width:820px) {
  .shell { padding:0 22px; }
  .discoveryGrid,.liveGrid { grid-template-columns:1fr; }
  .liveGrid { gap:38px; }
  .whyGrid { grid-template-columns:repeat(2,1fr); }
  .finalCtaInner { flex-direction:column; align-items:flex-start; }
  .ctaActions { width:100%; }
  .ctaActions a { flex:1; text-align:center; }
}

@media(max-width:600px) {
  .heroBenefits { gap:6px; }
  .heroBenefits span { font-size:10.5px; min-height:28px; }
  .benefitsSection,.modulesSection,.discoverySection,.journeySection,.liveSection,.whySection { padding:46px 0; }
  .benefitGrid,.moduleGrid,.journeyGrid,.whyGrid { grid-template-columns:1fr; gap:14px; }
  .moduleMedia { height:170px; flex-basis:170px; }
  .moduleBody { min-height:auto; padding:18px; }
  .finalCtaInner { padding:27px 21px; }
  .finalCtaInner h2 { font-size:27px; }
  .listCard { align-items:flex-start; flex-direction:column; }
  .listCard span { text-align:left; }
}

/* Public Home cards need a clear surface against the neutral page canvas. */
.page { background: #edf2f8; }
.discoveryCard { border-color: color-mix(in srgb, var(--discovery-accent) 30%, #c6d3e2); box-shadow: 0 14px 33px rgba(13,27,62,.11); }
.discoveryBody { background: #fff; }
.discoveryCard p,.journeyCard p,.listCard span,.whyCard p { color: #4c5b73; }
.journeyCard,.listCard { border-color: #c9d5e2; background: #fff; }
.listCard { box-shadow: 0 5px 14px rgba(13,27,62,.045); }
.whyCard { border-color: #c9d5e2; box-shadow: 0 8px 20px rgba(13,27,62,.06); }
.whyCard strong { color: #14213d; }
