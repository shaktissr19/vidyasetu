'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSubjects, getChapters, getContentItems, downloadOffline } from '@/services/contentService';
import { getOfflineDownloads, removeOfflineDownload } from '@/services/studentService';
import styles from '../StudentPortal.module.css';

const data = r => r?.data?.data;
const err = e => e?.response?.data?.error?.message || e?.message || 'Offline request failed';
const CACHE = 'vidyasetu-learning-v1';

async function loadCatalog(cls, lang) {
  const subjects = data(await getSubjects(cls)) || [];
  const output = [];
  for (const subject of subjects) {
    const chapters = data(await getChapters(subject.id, cls)) || [];
    for (const chapter of chapters) {
      const items = data(await getContentItems(chapter.id, lang)) || [];
      items.filter(i => i.is_offline_ready && i.type !== 'QUIZ').forEach(item => output.push({ ...item, subject, chapter }));
    }
  }
  return output;
}

async function putBrowserCache(url) {
  if (!('caches' in window)) return false;
  const absolute = url.startsWith('/') ? `${window.location.origin}${url}` : url;
  const response = await fetch(absolute, { credentials: 'include' });
  if (!response.ok) throw new Error(`Could not fetch content (${response.status})`);
  const cache = await caches.open(CACHE);
  await cache.put(absolute, response.clone());
  return true;
}

async function removeBrowserCache(url) {
  if (!url || !('caches' in window)) return;
  const absolute = url.startsWith('/') ? `${window.location.origin}${url}` : url;
  const cache = await caches.open(CACHE);
  await cache.delete(absolute);
}

async function openFromBrowserCache(url) {
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

export default function OfflineSection({ student, notify }) {
  const qc = useQueryClient();
  const cls = student?.className || '8';
  const lang = student?.language || 'hi';

  const downloadsQuery = useQuery({
    queryKey: ['offline-downloads'],
    queryFn: async () => data(await getOfflineDownloads()) || { items: [], summary: {} },
  });
  const catalogQuery = useQuery({
    queryKey: ['offline-catalog', cls, lang],
    queryFn: () => loadCatalog(cls, lang),
    staleTime: 60_000,
  });

  const downloadedById = useMemo(() => Object.fromEntries(
    (downloadsQuery.data?.items || []).map(item => [item.content_item_id, item])
  ), [downloadsQuery.data]);

  const downloadMutation = useMutation({
    mutationFn: async item => {
      const response = await downloadOffline(item.id);
      const payload = data(response);
      await putBrowserCache(payload.url);
      return item;
    },
    onSuccess: async item => {
      notify(`📥 ${item.title} is now cached for offline study.`);
      await qc.invalidateQueries({ queryKey: ['offline-downloads'] });
    },
    onError: e => notify(`⚠️ ${err(e)}`),
  });

  const removeMutation = useMutation({
    mutationFn: async item => {
      await removeOfflineDownload(item.content_item_id);
      await removeBrowserCache(item.file_url);
      return item;
    },
    onSuccess: async () => {
      notify('Removed from Offline Mode.');
      await qc.invalidateQueries({ queryKey: ['offline-downloads'] });
    },
    onError: e => notify(`⚠️ ${err(e)}`),
  });

  async function openOffline(item) {
    try {
      const ok = await openFromBrowserCache(item.file_url);
      if (!ok) {
        notify('This item is registered for offline use but is not in this browser cache. Download it again on this device.');
      }
    } catch (e) {
      notify(`⚠️ ${err(e)}`);
    }
  }

  const summary = downloadsQuery.data?.summary || {};

  return (
    <>
      <div className={styles.sectionHeader}>
        <div><h1 className={styles.title}>📶 Offline Mode</h1><div className={styles.subtitle}>Download learning assets to the browser Cache API and track them in PostgreSQL.</div></div>
      </div>

      <div className={styles.offlineHero}>
        <div><div className={styles.offlineBadge}>✅ {summary.itemCount || 0} Items Registered Offline</div><div style={{ marginTop: 9, fontSize: 13, opacity: .65 }}>This browser stores downloaded lesson files so they can be reopened without a network request while the app is already available.</div></div>
        <div style={{ textAlign: 'right' }}><b>{summary.totalSizeMb || 0} MB</b><div style={{ fontSize: 12, opacity: .55 }}>tracked content size</div></div>
      </div>

      {(downloadsQuery.isError || catalogQuery.isError) && <div className={styles.error}>{err(downloadsQuery.error || catalogQuery.error)}</div>}

      <div className={styles.card}>
        <div className={styles.cardTitle}>✅ My Offline Library</div>
        {downloadsQuery.isLoading && <div className={styles.loading}>Loading offline library…</div>}
        {(downloadsQuery.data?.items || []).map(item => (
          <div className={`${styles.downloadRow} ${styles.downloaded}`} key={item.id}>
            <div><div className={styles.downloadTitle}>{item.subject_name} · {item.title}</div><div className={styles.downloadMeta}>Chapter {item.chapter_number}: {item.chapter_title} · {item.type} · {item.file_size_kb || 0} KB · saved {new Date(item.downloaded_at).toLocaleString('en-IN')}</div></div>
            <div style={{ display: 'flex', gap: 8 }}><button className={styles.secondary} onClick={() => openOffline(item)}>Open Offline</button><button className={styles.danger} disabled={removeMutation.isPending} onClick={() => removeMutation.mutate(item)}>Remove</button></div>
          </div>
        ))}
        {!downloadsQuery.isLoading && !(downloadsQuery.data?.items || []).length && <div className={styles.empty}>Nothing downloaded on this Student account yet. Choose an item below.</div>}
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
