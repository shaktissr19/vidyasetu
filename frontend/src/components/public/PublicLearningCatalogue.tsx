'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BookOpen, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
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
                {(overviewQuery.data?.grades || []).map((item) => <option key={item.code} value={item.code}>{item.shortName || item.name}</option>)}
              </select>
              <select aria-label="Board" value={board} onChange={(event) => setBoard(event.target.value)} style={FILTER_STYLE}>
                <option value="">All boards</option>
                {(overviewQuery.data?.boards || []).filter((item) => item.code !== 'OTHER_STATE').map((item) => <option key={item.code} value={item.code}>{item.short_name || item.name}</option>)}
              </select>
              <select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value)} style={FILTER_STYLE}>
                <option value="">All learning categories</option>
                {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select aria-label="Subject" value={subject} onChange={(event) => { setSubject(event.target.value); setConcept(''); }} style={FILTER_STYLE}>
                <option value="">All subjects</option>
                {(options?.subjects || []).map((item) => <option key={`${item.code}-${item.name}`} value={item.code || item.name}>{item.name}</option>)}
              </select>
              <select aria-label="Concept" value={concept} onChange={(event) => setConcept(event.target.value)} style={FILTER_STYLE}>
                <option value="">All concepts</option>
                {concepts.map((item) => <option key={item.code} value={item.code}>{language === 'hi' && item.nameHi ? item.nameHi : item.name}{item.chapterTitle ? ` · ${item.chapterTitle}` : ''}</option>)}
              </select>
              <select aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value as 'en' | 'hi')} style={FILTER_STYLE}>
                <option value="en">English</option><option value="hi">हिन्दी</option>
              </select>
              <select aria-label="Resource type" value={resourceType} onChange={(event) => setResourceType(event.target.value)} style={FILTER_STYLE}>
                <option value="">All resource types</option>
                {(options?.resourceTypes || []).map((item) => <option key={item} value={item}>{typeLabel(item)}</option>)}
              </select>
              <select aria-label="Learning stage" value={journeyStage} onChange={(event) => setJourneyStage(event.target.value)} style={FILTER_STYLE}>
                <option value="">All learning stages</option>
                {(options?.journeyStages || []).map((item) => <option key={item} value={item}>{stageLabel(item)}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.catalogueToolbar}>
            <h2>{language === 'hi' ? 'आपके लिए सीखने की सामग्री' : 'Learning resources'}</h2>
            <span>{query.isFetching && !query.isPending ? 'Refreshing…' : query.isPending ? 'Loading…' : `${resources.length} resources`}</span>
          </div>

          {query.isError ? (
            <div className={styles.errorState}><strong>Catalogue could not be loaded.</strong><button type="button" onClick={() => query.refetch()}><RefreshCw size={16} /> Try again</button></div>
          ) : query.isPending ? (
            <div className={styles.catalogueGrid}>{[0,1,2,3,4,5].map((item) => <div key={item} className={styles.skeletonCard}><span /><span /><span /></div>)}</div>
          ) : resources.length ? (
            <div className={styles.catalogueGrid}>
              {resources.map((resource) => {
                const tone = CATEGORY_TONE[resource.category] || styles.blue;
                return (
                  <Link key={resource.id} className={`${styles.resourceCard} ${tone}`} href={`/learn/resource/${resource.public_slug}`}>
                    {resource.thumbnail_url ? <div className={styles.resourceImage}><img src={resource.thumbnail_url} alt="" loading="lazy" /></div> : <SubjectVisual input={resource} selectedGrade={grade || undefined} />}
                    <div className={styles.resourceBody}>
                      <div className={styles.resourceTopline}><span className={styles.resourceEyebrow}>{resource.subject_name || resource.subject_label || categoryLabel(resource.category)}</span></div>
                      <h3>{displayTitle(resource, language)}</h3>
                      <p>{displaySummary(resource, language)}</p>
                      <div className={styles.resourceFacts}>
                        <span>{gradeLabel(resource)}</span>
                        <span>{typeLabel(resource.resource_type)}</span>
                        {(resource.journey_stages || []).slice(0, 2).map((stage) => <span key={stage}>{stageLabel(stage)}</span>)}
                        {(resource.board_codes || []).includes('COMMON') && <span>Cross-board</span>}
                        {resource.is_offline_ready && <span>Offline-ready</span>}
                      </div>
                      {(resource.concept_names || []).length > 0 && <div style={{ fontSize: 11, color: '#66798a', marginTop: 8 }}>Concept: {(resource.concept_names || []).slice(0, 2).join(' · ')}</div>}
                      <div className={styles.resourceLink}>{language === 'hi' ? 'सीखना शुरू करें' : 'Explore resource'} <ArrowRight size={17} /></div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}><BookOpen size={28} /><strong>{language === 'hi' ? 'इन फ़िल्टरों से कोई प्रकाशित सामग्री नहीं मिली।' : 'No published learning resource matches these filters yet.'}</strong>{hasFilters ? <button type="button" onClick={clearFilters} style={{ border: 0, background: 'transparent', color: '#34658e', fontWeight: 800, cursor: 'pointer' }}>Clear filters</button> : <Link href="/learn">Return to Learning</Link>}</div>
          )}
        </div>
      </section>
    </div>
  );
}
