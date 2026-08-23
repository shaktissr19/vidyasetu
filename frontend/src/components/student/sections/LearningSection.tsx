'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getPublicLearningResources } from '@/services/publicService';
import type { StudentSectionProps } from '@/types/studentPortal';
import SubjectsSection from './SubjectsSection';
import styles from '../StudentPortal.module.css';

export default function LearningSection(props: StudentSectionProps) {
  const cls = Number(props.student?.className ?? props.student?.gradeLevel ?? 8) || 8;
  const growthQuery = useQuery({
    queryKey: ['student-growth-learning', cls],
    queryFn: () => getPublicLearningResources({ class: cls, limit: 4 }).then((response) => response.data.data || []),
    staleTime: 60_000,
  });

  const growth = (growthQuery.data || []).filter((item) => item.category !== 'ACADEMIC').slice(0, 4);

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <h1 className={styles.title}>📚 Learning Home</h1>
          <div className={styles.subtitle}>Class {props.student?.classLabel || cls} · syllabus learning, practice, growth and life skills</div>
        </div>
        <Link href="/learn" target="_blank" className={styles.secondary}>Explore public Learning Library ↗</Link>
      </div>

      <div className={styles.card} style={{ marginBottom: 18 }}>
        <div className={styles.cardTitle}>🌱 Beyond the syllabus</div>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          VidyaSetu also supports motivation, study skills, work ethic, social responsibility, digital citizenship, well-being and career awareness.
        </p>
        {growthQuery.isLoading ? (
          <div className={styles.loading}>Loading learning recommendations…</div>
        ) : growth.length === 0 ? (
          <div className={styles.empty}>Growth resources for your class are being added.</div>
        ) : (
          <div className={styles.contentGrid}>
            {growth.map((item) => (
              <div className={styles.contentItem} key={item.id}>
                <div className={styles.contentTop}><span className={styles.contentType}>{item.category.replaceAll('_', ' ')}</span></div>
                <div className={styles.contentTitle}>{item.title}</div>
                <div className={styles.contentMeta}>{item.summary}</div>
                <div className={styles.contentActions}>
                  <Link href={`/learn/resource/${item.public_slug}`} target="_blank" className={`${styles.miniBtn} ${styles.miniPrimary}`}>Read</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SubjectsSection {...props} />
    </>
  );
}
