'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSubjects, getChapters, getContentItems, downloadOffline } from '@/services/contentService';
import { getOfflineDownloads, removeOfflineDownload, type StudentOfflineDownloadsData } from '@/services/studentService';
import { apiErrorText } from '@/utils/errors';
import type { ContentChapter, ContentItem, ContentSubject, OfflineDownload } from '@/types/api';
import type { StudentSectionProps } from '@/types/studentPortal';
import styles from '../StudentPortal.module.css';

const CACHE = 'vidyasetu-learning-v1';

interface PortalContentItem extends ContentItem {
  is_offline_ready?: boolean;
}

interface CatalogItem extends PortalContentItem {
  subject: ContentSubject;
  chapter: ContentChapter;
}

interface PortalOfflineDownload extends OfflineDownload {
  subject_name?: string | null;
  chapter_number?: string | number | null;
  chapter_title?: string | null;
  type?: string | null;
  file_size_kb?: string | number | null;
  downloaded_at?: string | null;
}

async function loadCatalog(cls: string | number, lang: string): Promise<CatalogItem[]> {
  const subjects = (await getSubjects(cls)).data.data || [];
  const output: CatalogItem[] = [];
  for (const subject of subjects) {
    const chapters = (await getChapters(subject.id, cls)).data.data || [];
    for (const chapter of chapters) {
      const items = (await getContentItems(chapter.id, lang)).data.data as PortalContentItem[];
      items.filter(item => item.is_offline_ready && item.type !== 'QUIZ').forEach(item => output.push({ ...item, subject, chapter }));
    }
  }
  return output;
}

async function putBrowserCache(url: string): Promise<boolean> {
  if (!('caches' in window)) return false;
  const absolute = url.startsWith('/') ? `${window.location.origin}${url}` : url;
  const response = await fetch(absolute, { credentials: 'include' });
  if (!response.ok) throw new Error(`Could not fetch content (${response.status})`);
  const cache = await caches.open(CACHE);
  await cache.put(absolute, response.clone());
  return true;
}

async function removeBrowserCache(url?: string | null): Promise<void> {
  if (!url || !('caches' in window)) return;
  const absolute = url.startsWith('/') ? `${window.location.origin}${url}` : url;
  const cache = await caches.open(CACHE);
  await cache.delete(absolute);
}

async function openFromBrowserCache(url?: string | null): Promise<boolean> {
  if (!url || !('caches' in window)) return false;
  const absolute = url.startsWith('/') ? `${window.location.origin}${url}` : url;
  const cache = await caches.open(CACHE);
  const response = await cache.match(absolute);
  if (!response) return false;
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return true;
}

export default function OfflineSection({ student, notify }: StudentSectionProps) {
  const qc = useQueryClient();
  const cls = student?.className || '8';
  const lang = student?.language || 'hi';

  const downloadsQuery = useQuery<StudentOfflineDownloadsData>({
    queryKey: ['offline-downloads'],
    queryFn: async () => (await getOfflineDownloads()).data.data,
  });
  const catalogQuery = useQuery<CatalogItem[]>({
    queryKey: ['offline-catalog', cls, lang],
    queryFn: () => loadCatalog(cls, lang),
    staleTime: 60_000,
  });

  const downloadItems = (downloadsQuery.data?.items || []) as PortalOfflineDownload[];
  const downloadedById = useMemo<Record<string, PortalOfflineDownload>>(() => Object.fromEntries(
    downloadItems.map(item => [item.content_item_id, item])
  ), [downloadItems]);

  const downloadMutation = useMutation({
    mutationFn: async (item: CatalogItem) => {
      const payload = (await downloadOffline(item.id)).data.data;
      if (!payload.url) throw new Error('Offline download URL unavailable');
      await putBrowserCache(payload.url);
      return item;
    },
    onSuccess: async item => {
      notify(`📥 ${item.title} is now cached for offline study.`);
      await qc.invalidateQueries({ queryKey: ['offline-downloads'] });
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error, 'Offline request failed')}`),
  });

  const removeMutation = useMutation({
    mutationFn: async (item: PortalOfflineDownload) => {
      await removeOfflineDownload(item.content_item_id);
      await removeBrowserCache(item.file_url);
      return item;
    },
    onSuccess: async () => {
      notify('Removed from Offline Mode.');
      await qc.invalidateQueries({ queryKey: ['offline-downloads'] });
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error, 'Offline request failed')}`),
  });

  async function openOffline(item: PortalOfflineDownload): Promise<void> {
    try {
      const ok = await openFromBrowserCache(item.file_url);
      if (!ok) notify('This item is registered for offline use but is not in this browser cache. Download it again on this device.');
    } catch (error: unknown) {
      notify(`⚠️ ${apiErrorText(error, 'Offline request failed')}`);
    }
  }

  const summary = downloadsQuery.data?.summary;

  return (
    <>
      <div className={styles.sectionHeader}>
        <div><h1 className={styles.title}>📶 Offline Mode</h1><div className={styles.subtitle}>Download learning assets to the browser Cache API and track them in PostgreSQL.</div></div>
      </div>

      <div className={styles.offlineHero}>
        <div><div className={styles.offlineBadge}>✅ {summary?.itemCount || 0} Items Registered Offline</div><div style={{ marginTop: 9, fontSize: 13, opacity: .65 }}>This browser stores downloaded lesson files so they can be reopened without a network request while the app is already available.</div></div>
        <div style={{ textAlign: 'right' }}><b>{summary?.totalSizeMb || 0} MB</b><div style={{ fontSize: 12, opacity: .55 }}>tracked content size</div></div>
      </div>

      {(downloadsQuery.isError || catalogQuery.isError) && <div className={styles.error}>{apiErrorText(downloadsQuery.error || catalogQuery.error, 'Offline request failed')}</div>}

      <div className={styles.card}>
        <div className={styles.cardTitle}>✅ My Offline Library</div>
        {downloadsQuery.isLoading && <div className={styles.loading}>Loading offline library…</div>}
        {downloadItems.map(item => (
          <div className={`${styles.downloadRow} ${styles.downloaded}`} key={item.id || item.content_item_id}>
            <div><div className={styles.downloadTitle}>{item.subject_name} · {item.title}</div><div className={styles.downloadMeta}>Chapter {item.chapter_number}: {item.chapter_title} · {item.type} · {item.file_size_kb || 0} KB · saved {item.downloaded_at ? new Date(item.downloaded_at).toLocaleString('en-IN') : '—'}</div></div>
            <div style={{ display: 'flex', gap: 8 }}><button className={styles.secondary} onClick={() => void openOffline(item)}>Open Offline</button><button className={styles.danger} disabled={removeMutation.isPending} onClick={() => removeMutation.mutate(item)}>Remove</button></div>
          </div>
        ))}
        {!downloadsQuery.isLoading && !downloadItems.length && <div className={styles.empty}>Nothing downloaded on this Student account yet. Choose an item below.</div>}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>📥 Available for Offline Study</div>
        {catalogQuery.isLoading && <div className={styles.loading}>Finding offline-ready content…</div>}
        {(catalogQuery.data || []).map(item => {
          const existing = downloadedById[item.id];
          return (
            <div className={`${styles.downloadRow} ${existing ? styles.downloaded : ''}`} key={item.id}>
              <div><div className={styles.downloadTitle}>{item.subject.name} · {item.title}</div><div className={styles.downloadMeta}>Chapter {item.chapter.chapter_number}: {item.chapter.title} · {item.type} · +{item.xp_reward || 0} XP</div></div>
              {existing ? <span className={styles.statusResolved}>✅ Downloaded</span> : <button className={styles.primary} disabled={downloadMutation.isPending} onClick={() => downloadMutation.mutate(item)}>📥 Download</button>}
            </div>
          );
        })}
        {!catalogQuery.isLoading && !(catalogQuery.data || []).length && <div className={styles.empty}>No offline-ready lesson files are published yet.</div>}
      </div>
    </>
  );
}
