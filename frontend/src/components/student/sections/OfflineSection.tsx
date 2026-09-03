'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSubjects, getChapters, getContentItems, downloadOffline } from '@/services/contentService';
import { getOfflineDownloads, removeOfflineDownload, type StudentOfflineDownloadsData } from '@/services/studentService';
import {
  cacheLearningAsset,
  flushOfflineQueue,
  getOfflineSyncState,
  listLocalOfflineDownloads,
  openCachedLearningAsset,
  removeCachedLearningAsset,
  removeLocalOfflineDownload,
  removeOfflineSyncEntry,
  saveLocalOfflineDownload,
  type OfflineDownloadRecord,
} from '@/lib/offlineLearning';
import { isPwaInstallable, isStandalonePwa, promptPwaInstall } from '@/lib/pwa';
import useAuthStore from '@/store/authStore';
import { apiErrorText } from '@/utils/errors';
import type { ContentChapter, ContentItem, ContentSubject } from '@/types/api';
import type { StudentSectionProps } from '@/types/studentPortal';
import styles from '../StudentPortal.module.css';

interface PortalContentItem extends ContentItem {
  is_offline_ready?: boolean;
  xp_reward?: string | number | null;
  file_size_kb?: string | number | null;
}

interface CatalogItem extends PortalContentItem {
  subject: ContentSubject;
  chapter: ContentChapter;
}

async function loadCatalog(cls: string | number, lang: string): Promise<CatalogItem[]> {
  const subjects = (await getSubjects(cls)).data.data || [];
  const output: CatalogItem[] = [];
  for (const subject of subjects) {
    const chapters = (await getChapters(subject.id, cls)).data.data || [];
    for (const chapter of chapters) {
      const items = (await getContentItems(chapter.id, lang)).data.data as PortalContentItem[];
      items
        .filter((item) => item.is_offline_ready && item.type !== 'QUIZ')
        .forEach((item) => output.push({ ...item, subject, chapter }));
    }
  }
  return output;
}

function syncKindLabel(kind: string): string {
  return kind === 'CONTENT_COMPLETE' ? 'Lesson completion' : 'Learning progress';
}

export default function OfflineSection({ student, notify, refreshDashboard }: StudentSectionProps) {
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const userId = user?.id || '';
  const cls = student?.className || student?.gradeLevel || '8';
  const lang = student?.language || student?.preferred_language || 'hi';
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [installable, setInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, []);

  useEffect(() => {
    const refreshInstallState = () => {
      setInstallable(isPwaInstallable());
      setInstalled(isStandalonePwa());
    };
    refreshInstallState();
    window.addEventListener('vidyasetu:pwa-installable', refreshInstallState);
    window.addEventListener('vidyasetu:pwa-install-state', refreshInstallState);
    window.addEventListener('appinstalled', refreshInstallState);
    return () => {
      window.removeEventListener('vidyasetu:pwa-installable', refreshInstallState);
      window.removeEventListener('vidyasetu:pwa-install-state', refreshInstallState);
      window.removeEventListener('appinstalled', refreshInstallState);
    };
  }, []);

  const downloadsQuery = useQuery<StudentOfflineDownloadsData>({
    queryKey: ['offline-downloads', userId],
    queryFn: async () => (await getOfflineDownloads()).data.data,
    enabled: Boolean(userId) && online,
  });
  const localDownloadsQuery = useQuery<OfflineDownloadRecord[]>({
    queryKey: ['offline-local-downloads', userId],
    queryFn: () => listLocalOfflineDownloads(userId),
    enabled: Boolean(userId),
  });
  const syncQuery = useQuery({
    queryKey: ['offline-sync-state', userId],
    queryFn: () => getOfflineSyncState(userId),
    enabled: Boolean(userId),
    refetchInterval: online ? 15_000 : false,
  });
  const catalogQuery = useQuery<CatalogItem[]>({
    queryKey: ['offline-catalog', cls, lang],
    queryFn: () => loadCatalog(cls, String(lang)),
    enabled: online,
    staleTime: 60_000,
  });

  useEffect(() => {
    const refreshSync = () => { void qc.invalidateQueries({ queryKey: ['offline-sync-state', userId] }); };
    window.addEventListener('vidyasetu:offline-sync', refreshSync);
    return () => window.removeEventListener('vidyasetu:offline-sync', refreshSync);
  }, [qc, userId]);

  const localItems = localDownloadsQuery.data || [];
  const localById = useMemo<Record<string, OfflineDownloadRecord>>(
    () => Object.fromEntries(localItems.map((item) => [item.contentItemId, item])),
    [localItems],
  );
  const syncState = syncQuery.data;
  const permanentFailures = (syncState?.entries || []).filter((entry) => entry.status === 'PERMANENT_FAILURE');
  const serverSummary = downloadsQuery.data?.summary;

  const downloadMutation = useMutation({
    mutationFn: async (item: CatalogItem) => {
      if (!userId) throw new Error('Student account is not available');
      if (!navigator.onLine) throw new Error('Connect once to download a new learning item');
      const payload = (await downloadOffline(item.id)).data.data;
      if (!payload.url) throw new Error('Offline download URL unavailable');
      await cacheLearningAsset(payload.url);
      await saveLocalOfflineDownload(userId, {
        contentItemId: item.id,
        fileUrl: payload.url,
        title: item.title,
        subjectName: item.subject.name,
        chapterNumber: item.chapter.chapter_number,
        chapterTitle: item.chapter.title,
        type: item.type,
        fileSizeKb: item.file_size_kb || null,
      });
      return item;
    },
    onSuccess: async (item) => {
      notify(`📥 ${item.title} is saved on this device for offline study.`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['offline-downloads', userId] }),
        qc.invalidateQueries({ queryKey: ['offline-local-downloads', userId] }),
      ]);
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error, 'Offline download failed')}`),
  });

  const removeMutation = useMutation({
    mutationFn: async (item: OfflineDownloadRecord) => {
      if (!navigator.onLine) throw new Error('Reconnect before removing an offline item so your account and this device stay in sync');
      await removeOfflineDownload(item.contentItemId);
      await removeCachedLearningAsset(item.fileUrl);
      await removeLocalOfflineDownload(userId, item.contentItemId);
      return item;
    },
    onSuccess: async () => {
      notify('Removed from this device and your Offline Mode list.');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['offline-downloads', userId] }),
        qc.invalidateQueries({ queryKey: ['offline-local-downloads', userId] }),
      ]);
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error, 'Could not remove offline item')}`),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Student account is not available');
      if (!navigator.onLine) throw new Error('You are offline. Your saved progress will stay safely queued.');
      return flushOfflineQueue(userId, true);
    },
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ['offline-sync-state', userId] });
      if (result.succeeded > 0) await refreshDashboard();
      if (result.stoppedForAuth) notify('Sign in again before queued learning progress can sync.');
      else if (result.failedCount > 0) notify(`Synced ${result.succeeded} change(s). ${result.failedCount} change(s) need attention.`);
      else if (result.succeeded > 0) notify(`✅ Synced ${result.succeeded} saved learning change(s).`);
      else notify('Everything is already synced.');
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error, 'Could not sync offline progress')}`),
  });

  const discardMutation = useMutation({
    mutationFn: async (dedupeKey: string) => removeOfflineSyncEntry(userId, dedupeKey),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['offline-sync-state', userId] });
      notify('Discarded the failed local change.');
    },
  });

  async function openOffline(item: OfflineDownloadRecord): Promise<void> {
    try {
      const ok = await openCachedLearningAsset(item.fileUrl);
      if (!ok) notify('The local file is missing from this browser. Reconnect and download it again.');
    } catch (error: unknown) {
      notify(`⚠️ ${apiErrorText(error, 'Could not open offline item')}`);
    }
  }

  async function installApp(): Promise<void> {
    const result = await promptPwaInstall();
    setInstallable(isPwaInstallable());
    setInstalled(isStandalonePwa() || result.outcome === 'accepted');
    if (!result.available) notify('Use your browser menu and choose “Install app” or “Add to Home Screen”.');
    else if (result.outcome === 'accepted') notify('✅ VidyaSetu installation accepted.');
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <h1 className={styles.title}>📶 Offline Mode</h1>
          <div className={styles.subtitle}>Keep approved learning material on this device and safely sync simple progress after connectivity returns.</div>
        </div>
        {installed ? (
          <span className={styles.statusResolved}>✅ App installed</span>
        ) : installable ? (
          <button className={styles.primary} onClick={() => void installApp()}>📱 Install VidyaSetu</button>
        ) : (
          <button className={styles.secondary} onClick={() => void installApp()}>How to install</button>
        )}
      </div>

      <div className={styles.offlineHero}>
        <div>
          <div className={styles.offlineBadge}>{online ? '🟢 Online' : '🟠 Offline'} · {localItems.length} item{localItems.length === 1 ? '' : 's'} on this device</div>
          <div style={{ marginTop: 9, fontSize: 13, opacity: .7 }}>
            {online
              ? 'New downloads and saved progress can sync now.'
              : 'Your device library remains available. Only safe lesson/progress changes are queued; quizzes, homework and competition submissions still require a connection.'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <b>{syncState?.pendingCount || 0} pending</b>
          <div style={{ fontSize: 12, opacity: .58 }}>
            {syncState?.lastSuccessfulSync ? `last sync ${new Date(syncState.lastSuccessfulSync).toLocaleString('en-IN')}` : 'no queued sync yet'}
          </div>
        </div>
      </div>

      {!userId && <div className={styles.error}>Sign in as a Student to use device-isolated Offline Mode.</div>}
      {localDownloadsQuery.isError && <div className={styles.error}>{apiErrorText(localDownloadsQuery.error, 'Could not read this device’s offline library')}</div>}

      <div className={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div className={styles.cardTitle}>🔄 Resilient progress sync</div>
            <div className={styles.contentMeta}>Only lesson completion and Learning Hub progress can be queued. High-consequence submissions are never replayed offline.</div>
          </div>
          <button className={styles.primary} disabled={!online || !userId || syncMutation.isPending} onClick={() => syncMutation.mutate()}>
            {syncMutation.isPending ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10, marginTop: 14 }}>
          <div className={styles.contentItem}><strong style={{ fontSize: 22 }}>{syncState?.pendingCount || 0}</strong><div className={styles.contentMeta}>Waiting to sync</div></div>
          <div className={styles.contentItem}><strong style={{ fontSize: 22 }}>{syncState?.failedCount || 0}</strong><div className={styles.contentMeta}>Need attention</div></div>
          <div className={styles.contentItem}><strong style={{ fontSize: 22 }}>{serverSummary?.itemCount ?? '—'}</strong><div className={styles.contentMeta}>Registered to account{online ? '' : ' · reconnect to refresh'}</div></div>
        </div>

        {permanentFailures.map((entry) => (
          <div className={styles.downloadRow} key={entry.dedupeKey} style={{ marginTop: 10 }}>
            <div>
              <div className={styles.downloadTitle}>⚠️ {syncKindLabel(entry.kind)} could not be accepted</div>
              <div className={styles.downloadMeta}>{entry.targetId} · {entry.lastError || 'Server rejected this saved change'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={styles.secondary} disabled={!online || syncMutation.isPending} onClick={() => syncMutation.mutate()}>Retry sync</button>
              <button className={styles.danger} disabled={discardMutation.isPending} onClick={() => discardMutation.mutate(entry.dedupeKey)}>Discard</button>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>✅ On This Device</div>
        <div className={styles.contentMeta} style={{ marginBottom: 10 }}>This list comes from this browser’s IndexedDB, not only from the server, so it reflects what this device actually saved.</div>
        {localDownloadsQuery.isLoading && <div className={styles.loading}>Reading this device’s offline library…</div>}
        {localItems.map((item) => (
          <div className={`${styles.downloadRow} ${styles.downloaded}`} key={item.key}>
            <div>
              <div className={styles.downloadTitle}>{item.subjectName || 'Learning'} · {item.title}</div>
              <div className={styles.downloadMeta}>
                {item.chapterNumber ? `Chapter ${item.chapterNumber}${item.chapterTitle ? `: ${item.chapterTitle}` : ''} · ` : ''}{item.type || 'Resource'} · {item.fileSizeKb || 0} KB · saved {new Date(item.downloadedAt).toLocaleString('en-IN')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={styles.secondary} onClick={() => void openOffline(item)}>Open Offline</button>
              <button className={styles.danger} disabled={!online || removeMutation.isPending} title={!online ? 'Reconnect before removing so server and device stay aligned' : undefined} onClick={() => removeMutation.mutate(item)}>Remove</button>
            </div>
          </div>
        ))}
        {!localDownloadsQuery.isLoading && !localItems.length && <div className={styles.empty}>Nothing is cached on this device yet. Connect once and download an approved item below.</div>}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>📥 Available for Offline Study</div>
        {!online && <div className={styles.empty}>Reconnect to browse or download new offline-ready learning material. Already saved items above still work.</div>}
        {catalogQuery.isLoading && online && <div className={styles.loading}>Finding offline-ready content…</div>}
        {online && catalogQuery.isError && <div className={styles.error}>{apiErrorText(catalogQuery.error, 'Could not load offline-ready content')}</div>}
        {(catalogQuery.data || []).map((item) => {
          const local = localById[item.id];
          return (
            <div className={`${styles.downloadRow} ${local ? styles.downloaded : ''}`} key={item.id}>
              <div>
                <div className={styles.downloadTitle}>{item.subject.name} · {item.title}</div>
                <div className={styles.downloadMeta}>Chapter {item.chapter.chapter_number}: {item.chapter.title} · {item.type}{item.xp_reward ? ` · +${item.xp_reward} XP` : ''}</div>
              </div>
              {local
                ? <span className={styles.statusResolved}>✅ On this device</span>
                : <button className={styles.primary} disabled={downloadMutation.isPending} onClick={() => downloadMutation.mutate(item)}>📥 Download</button>}
            </div>
          );
        })}
        {online && !catalogQuery.isLoading && !(catalogQuery.data || []).length && <div className={styles.empty}>No offline-ready lesson files are published yet.</div>}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>📱 Installable Student App</div>
        <p className={styles.contentMeta} style={{ marginTop: 0 }}>
          Installing VidyaSetu gives the Student workspace its own home-screen/app-launch experience. It does not move your password or access token into the service worker.
        </p>
        {installed ? (
          <div className={styles.success}>VidyaSetu is running as an installed app on this device.</div>
        ) : installable ? (
          <button className={styles.primary} onClick={() => void installApp()}>Install VidyaSetu</button>
        ) : (
          <div className={styles.contentMeta}>If your browser does not show an install button here, use its menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>.</div>
        )}
      </div>
    </>
  );
}
