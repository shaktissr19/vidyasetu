'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  Calculator,
  CirclePlay,
  FileQuestion,
  FileText,
  FlaskConical,
  Headphones,
  Languages,
  Lightbulb,
  NotebookPen,
  RefreshCw,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import { getPublicLearningResources, type LearningCategory, type PublicLearningResource } from '@/services/publicService';
import styles from './learningEditorial.module.css';

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

function iconFor(resource: PublicLearningResource): LucideIcon {
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
  if (resource.category === 'LIFE_SKILLS' || resource.category === 'WORK_ETHIC') return Wrench;
  return BookOpen;
}

function categoryLabel(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function gradeLabel(resource: PublicLearningResource): string {
  if (resource.class_min && resource.class_max) return resource.class_min === resource.class_max ? `Class ${resource.class_min}` : `Classes ${resource.class_min}–${resource.class_max}`;
  const codes = resource.grade_codes || [];
  if (codes.length === 1) return codes[0].startsWith('CLASS_') ? `Class ${codes[0].replace('CLASS_', '')}` : codes[0].replaceAll('_', ' ');
  if (codes.length > 1) return 'Multiple levels';
  return 'All levels';
}

export default function PublicLearningCatalogue() {
  const [ready, setReady] = useState(false);
  const [grade, setGrade] = useState<string | undefined>();
  const [board, setBoard] = useState<string | undefined>();
  const [category, setCategory] = useState<LearningCategory | undefined>();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gradeParam = (params.get('grade') || '').toUpperCase();
    const boardParam = (params.get('board') || '').toUpperCase();
    const categoryParam = (params.get('category') || '').toUpperCase() as LearningCategory;
    if (gradeParam) setGrade(gradeParam);
    if (boardParam) setBoard(boardParam);
    if (categoryParam) setCategory(categoryParam);
    setReady(true);
  }, []);

  const query = useQuery<PublicLearningResource[]>({
    queryKey: ['public-learning-full-catalogue', grade || 'ALL', board || 'ALL', category || 'ALL'],
    enabled: ready,
    queryFn: ({ signal }) => getPublicLearningResources({ grade, board, category, limit: 100 }, { signal }).then((response) => response.data.data || []),
    staleTime: 30 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const resources = query.data || [];
  const description = useMemo(() => {
    const parts = [grade ? grade.replace('CLASS_', 'Class ').replaceAll('_', ' ') : 'All levels', board || 'All boards', category ? categoryLabel(category) : 'All learning'];
    return parts.join(' · ');
  }, [board, category, grade]);

  return (
    <div className={styles.cataloguePage}>
      <GlobalTopbar />
      <section className={styles.catalogueHero}>
        <div className={styles.shell}>
          <Link href="/learn" className={styles.catalogueBack}><ArrowLeft size={16} /> Back to Learning</Link>
          <h1>All learning resources</h1>
          <p>Browse the complete public catalogue for your current Learning filters. The main Learn page stays focused by showing only a small preview.</p>
        </div>
      </section>
      <section className={styles.catalogueBody}>
        <div className={styles.shell}>
          <div className={styles.catalogueToolbar}><h2>{description}</h2><span>{query.isPending ? 'Loading…' : `${resources.length} resources shown`}</span></div>
          {query.isError ? (
            <div className={styles.errorState}><strong>Catalogue could not be loaded.</strong><button type="button" onClick={() => query.refetch()}><RefreshCw size={16} /> Try again</button></div>
          ) : query.isPending ? (
            <div className={styles.catalogueGrid}>{[0,1,2,3,4,5].map((item) => <div key={item} className={styles.skeletonCard}><span /><span /><span /></div>)}</div>
          ) : resources.length ? (
            <div className={styles.catalogueGrid}>
              {resources.map((resource) => {
                const Icon = iconFor(resource);
                const tone = CATEGORY_TONE[resource.category] || styles.blue;
                return (
                  <Link key={resource.id} className={`${styles.resourceCard} ${tone}`} href={`/learn/resource/${resource.public_slug}`}>
                    {resource.thumbnail_url && <div className={styles.resourceImage}><img src={resource.thumbnail_url} alt="" loading="lazy" /></div>}
                    <div className={styles.resourceBody}>
                      <div className={styles.resourceTopline}><span className={styles.resourceIconBadge}><Icon size={20} /></span><span className={styles.resourceEyebrow}>{resource.subject_name || resource.subject_label || categoryLabel(resource.category)}</span></div>
                      <h3>{resource.title}</h3>
                      <p>{resource.summary || 'Open this resource to continue learning.'}</p>
                      <div className={styles.resourceFacts}><span>{gradeLabel(resource)}</span><span>{resource.resource_type.replaceAll('_', ' ').toLowerCase()}</span>{(resource.board_codes || []).includes('COMMON') && <span>Cross-board</span>}</div>
                      <div className={styles.resourceLink}>Explore resource <ArrowRight size={17} /></div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : <div className={styles.emptyState}><BookOpen size={28} /><strong>No public resource matches these filters yet.</strong><Link href="/learn">Return to Learning</Link></div>}
        </div>
      </section>
    </div>
  );
}
