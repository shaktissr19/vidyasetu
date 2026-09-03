'use client';

import { useQuery } from '@tanstack/react-query';
import { getStudentLearningHome, type StudentLearningHome } from '@/services/studentService';
import styles from '../StudentPortal.module.css';

interface ConceptMasteryItem {
  conceptId: string;
  code: string;
  name: string;
  nameHi?: string | null;
  nodeType: string;
  subjectCode: string;
  subjectName?: string | null;
  chapterCode?: string | null;
  chapterTitle?: string | null;
  state: 'NOT_STARTED' | 'LEARNING' | 'PRACTISING' | 'NEEDS_REVIEW' | 'MASTERED';
  exposurePct: number;
  resourceCompletionPct: number;
  practiceBestPct?: number | null;
  masteryPct?: number | null;
  practiceAttempts: number;
  masteryAttempts: number;
  needsReview: boolean;
}

type LearningHomeWithConceptMastery = StudentLearningHome & {
  conceptMastery?: ConceptMasteryItem[];
};

const STATE_LABELS: Record<ConceptMasteryItem['state'], string> = {
  NOT_STARTED: 'Not started',
  LEARNING: 'Learning',
  PRACTISING: 'Practising',
  NEEDS_REVIEW: 'Needs review',
  MASTERED: 'Mastered',
};

function evidenceSummary(item: ConceptMasteryItem): string {
  if (item.masteryPct != null) return `Mastery ${Math.round(item.masteryPct)}%`;
  if (item.practiceBestPct != null) return `Practice best ${Math.round(item.practiceBestPct)}%`;
  return `Resource progress ${Math.round(item.resourceCompletionPct)}%`;
}

export default function ConceptMasteryPanel() {
  const homeQuery = useQuery<LearningHomeWithConceptMastery>({
    queryKey: ['student-learning-home'],
    queryFn: async () => (await getStudentLearningHome()).data.data as LearningHomeWithConceptMastery,
    staleTime: 30_000,
  });

  const items = homeQuery.data?.conceptMastery || [];
  if (homeQuery.isLoading || homeQuery.isError || items.length === 0) return null;

  const mastered = items.filter((item) => item.state === 'MASTERED').length;
  const review = items.filter((item) => item.needsReview).length;

  return (
    <div className={styles.card} style={{ marginTop: 18, marginBottom: 18 }}>
      <div className={styles.cardTitle}>🎯 Concept mastery</div>
      <p style={{ color: 'var(--muted)', marginTop: 4 }}>
        Progress is tracked by the concept you are learning—not separately by language, article, video or quiz. {mastered} mastered{review ? ` · ${review} need review` : ''}.
      </p>
      <div className={styles.contentGrid}>
        {items.slice(0, 8).map((item) => (
          <div className={styles.contentItem} key={item.conceptId}>
            <div className={styles.contentTop}>
              <span className={styles.contentType}>{item.subjectName || item.subjectCode}</span>
              <span className={item.state === 'MASTERED' ? styles.done : styles.contentType}>{STATE_LABELS[item.state]}</span>
            </div>
            <div className={styles.contentTitle}>{item.name}</div>
            {item.chapterTitle ? <div className={styles.contentMeta}>{item.chapterTitle}</div> : null}
            <div style={{ height: 7, borderRadius: 999, background: 'rgba(13,27,62,.08)', overflow: 'hidden', marginTop: 10 }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.max(4, Math.min(100, item.masteryPct ?? item.practiceBestPct ?? item.resourceCompletionPct ?? 0))}%`,
                  background: 'currentColor',
                  opacity: .7,
                }}
              />
            </div>
            <div className={styles.contentMeta} style={{ marginTop: 7 }}>
              {evidenceSummary(item)} · {item.practiceAttempts} practice attempt{item.practiceAttempts === 1 ? '' : 's'}{item.masteryAttempts ? ` · ${item.masteryAttempts} mastery attempt${item.masteryAttempts === 1 ? '' : 's'}` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
