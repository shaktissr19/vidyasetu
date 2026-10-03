'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import { getPublicLearningResource, type PublicLearningResource } from '@/services/publicService';
import styles from './publicLearning.module.css';

function renderBody(body?: string | null): ReactNode[] {
  if (!body) return [];
  return body.split('\n').reduce<ReactNode[]>((nodes, raw, index) => {
    const line = raw.trim();
    if (!line) return nodes;
    if (line.startsWith('## ')) {
      nodes.push(<h2 key={`h-${index}`}>{line.slice(3)}</h2>);
    } else if (line.startsWith('# ')) {
      nodes.push(<h2 key={`h-${index}`}>{line.slice(2)}</h2>);
    } else {
      nodes.push(<p key={`p-${index}`}>{line}</p>);
    }
    return nodes;
  }, []);
}

export default function PublicLearningResourcePage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const [resource, setResource] = useState<PublicLearningResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) return;
    let active = true;
    setLoading(true);
    getPublicLearningResource(slug)
      .then((response) => { if (active) setResource(response.data.data); })
      .catch(() => { if (active) setError('This learning resource could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  if (loading) {
    return <div className={styles.page}><GlobalTopbar /><div className={styles.article}>Loading learning resource…</div></div>;
  }

  if (!resource || error) {
    return (
      <div className={styles.page}>
        <GlobalTopbar />
        <div className={styles.article}>
          <h1>Resource unavailable</h1>
          <p>{error || 'This resource is not publicly available.'}</p>
          <Link className={styles.primary} href="/learn">Back to Learning Library</Link>
        </div>
      </div>
    );
  }

  const mediaUrl = resource.content_url || null;
  const embedUrl = resource.delivery_mode === 'OFFICIAL_EMBED'
    ? (resource.external_url || resource.source_url || null)
    : null;
  const isExternal = !mediaUrl && !embedUrl && (resource.external_url || resource.source_url);
  const textBody = renderBody(resource.body_markdown);

  return (
    <div className={styles.page}>
      <GlobalTopbar />
      <section className={styles.resourceHero}>
        <div className={styles.resourceShell}>
          <div className={styles.kicker}>{resource.category.replaceAll('_', ' ')} · {resource.source_name}</div>
          <h1 className={styles.resourceTitle}>{resource.title}</h1>
          {resource.summary && <p className={styles.resourceSummary}>{resource.summary}</p>}
          <div className={styles.pillRow}>
            {resource.class_min && <span className={styles.pill}>Classes {resource.class_min}{resource.class_max && resource.class_max !== resource.class_min ? `–${resource.class_max}` : ''}</span>}
            {(resource.board_codes || []).map((board) => <span className={styles.pill} key={board}>{board}</span>)}
            <span className={styles.pill}>{resource.resource_type.replaceAll('_', ' ')}</span>
          </div>
        </div>
      </section>

      <article className={styles.article}>
        {embedUrl && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', borderRadius: 14, background: '#0F172A' }}>
              <iframe
                title={`${resource.title} official player`}
                src={embedUrl}
                style={{ width: '100%', height: '100%', border: 0 }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
            <p className={styles.muted}>This is the provider’s official player. VidyaSetu does not copy or proxy the remote stream.</p>
          </div>
        )}
        {mediaUrl && resource.resource_type === 'VIDEO' && <video controls preload="metadata" style={{ width: '100%', borderRadius: 14, marginBottom: 24 }} src={mediaUrl} />}
        {mediaUrl && resource.resource_type === 'AUDIO' && <audio controls preload="metadata" style={{ width: '100%', marginBottom: 24 }} src={mediaUrl} />}
        {mediaUrl && resource.resource_type === 'IMAGE' && <img src={mediaUrl} alt={resource.title} style={{ width: '100%', maxHeight: 620, objectFit: 'contain', borderRadius: 14, marginBottom: 24, background: '#F8FAFC' }} />}
        {mediaUrl && ['PDF','WORKSHEET','QUESTION_PAPER'].includes(resource.resource_type) && (
          <div style={{ marginBottom: 24 }}>
            <object data={mediaUrl} type="application/pdf" width="100%" height="720" style={{ borderRadius: 14, border: '1px solid #E2E8F0' }}>
              <a className={styles.primary} href={mediaUrl} target="_blank" rel="noopener noreferrer">Open document ↗</a>
            </object>
          </div>
        )}
        {textBody.length > 0 ? textBody : (
          <>
            <h2>Learning resource</h2>
            <p>{resource.summary || 'Use the source link below to open this learning resource.'}</p>
          </>
        )}

        {isExternal && (
          <p><a className={styles.primary} href={resource.external_url || resource.source_url || '#'} target="_blank" rel="noopener noreferrer">Open original resource ↗</a></p>
        )}

        <div className={styles.sourceBox}>
          <strong>Source & licence</strong><br />
          Source: {resource.source_name} ({resource.source_code})<br />
          Licence: {resource.licence.replaceAll('_', ' ')}
          {resource.attribution_text ? <><br />Attribution: {resource.attribution_text}</> : null}
          {resource.source_url ? <><br />Original source URL is retained in VidyaSetu's content record.</> : null}
        </div>

        <div className={styles.cta}>
          <div>
            <strong>Continue with personalised learning</strong>
            <p>Student accounts connect class, school, board, progress, practice and offline learning.</p>
          </div>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/login?role=student">Student login</Link>
            <Link className={styles.secondary} href="/learn">More public learning</Link>
          </div>
        </div>
      </article>
    </div>
  );
}
