import axios from 'axios';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import api from '@/services/api';
import type { StudentDashboard } from '@/types/api';

export const OFFLINE_DB_NAME = 'vidyasetu-offline-v1';
export const LEARNING_CACHE_NAME = 'vidyasetu-learning-v2';

export type OfflineSyncKind = 'CONTENT_COMPLETE' | 'RESOURCE_PROGRESS';
export type OfflineSyncStatus = 'PENDING' | 'PERMANENT_FAILURE';

export interface OfflineSyncEntry {
  dedupeKey: string;
  userId: string;
  kind: OfflineSyncKind;
  targetId: string;
  payload: Record<string, unknown>;
  status: OfflineSyncStatus;
  attempts: number;
  nextAttemptAt: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
}

export interface OfflineDownloadRecord {
  key: string;
  userId: string;
  contentItemId: string;
  fileUrl: string;
  title: string;
  subjectName?: string | null;
  chapterNumber?: string | number | null;
  chapterTitle?: string | null;
  type?: string | null;
  fileSizeKb?: string | number | null;
  downloadedAt: string;
}

interface OfflineMetaRecord {
  key: string;
  userId: string;
  value: unknown;
  updatedAt: string;
}

interface OfflineLearningDb extends DBSchema {
  downloads: {
    key: string;
    value: OfflineDownloadRecord;
  };
  syncQueue: {
    key: string;
    value: OfflineSyncEntry;
  };
  meta: {
    key: string;
    value: OfflineMetaRecord;
  };
}

export interface ResilientWriteResult {
  queued: boolean;
}

export interface OfflineSyncSummary {
  attempted: number;
  succeeded: number;
  deferred: number;
  permanentFailures: number;
  pendingCount: number;
  failedCount: number;
  stoppedForAuth: boolean;
  lastSuccessfulSync: string | null;
}

export interface OfflineSyncState {
  pendingCount: number;
  failedCount: number;
  lastSuccessfulSync: string | null;
  entries: OfflineSyncEntry[];
}

let dbPromise: Promise<IDBPDatabase<OfflineLearningDb>> | null = null;

function getDb(): Promise<IDBPDatabase<OfflineLearningDb>> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB is not available in this browser'));
  }
  if (!dbPromise) {
    dbPromise = openDB<OfflineLearningDb>(OFFLINE_DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('downloads')) db.createObjectStore('downloads', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('syncQueue')) db.createObjectStore('syncQueue', { keyPath: 'dedupeKey' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

function nowIso(): string {
  return new Date().toISOString();
}

function metaKey(userId: string, name: string): string {
  return `${userId}:${name}`;
}

function syncKey(userId: string, kind: OfflineSyncKind, targetId: string): string {
  return `${userId}:${kind}:${targetId}`;
}

function downloadKey(userId: string, contentItemId: string): string {
  return `${userId}:${contentItemId}`;
}

function retryDelayMs(attempts: number): number {
  const exponent = Math.min(Math.max(attempts, 1), 8);
  return Math.min(5 * 60_000, 1000 * (2 ** exponent));
}

async function setMeta(userId: string, name: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('meta', {
    key: metaKey(userId, name),
    userId,
    value,
    updatedAt: nowIso(),
  });
}

async function getMeta<T>(userId: string, name: string): Promise<T | null> {
  const db = await getDb();
  const record = await db.get('meta', metaKey(userId, name));
  return record ? (record.value as T) : null;
}

export function isNetworkOnlyFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return axios.isAxiosError(error) && !error.response;
}

async function enqueueSync(
  userId: string,
  kind: OfflineSyncKind,
  targetId: string,
  payload: Record<string, unknown> = {},
): Promise<OfflineSyncEntry> {
  const db = await getDb();
  const dedupeKey = syncKey(userId, kind, targetId);
  const existing = await db.get('syncQueue', dedupeKey);
  const timestamp = nowIso();
  const entry: OfflineSyncEntry = {
    dedupeKey,
    userId,
    kind,
    targetId,
    payload,
    status: 'PENDING',
    attempts: existing?.attempts || 0,
    nextAttemptAt: 0,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    lastError: null,
  };
  await db.put('syncQueue', entry);
  return entry;
}

export async function completeContentResilient(userId: string, contentItemId: string): Promise<ResilientWriteResult> {
  try {
    await api.post(`/content/items/${contentItemId}/complete`);
    return { queued: false };
  } catch (error: unknown) {
    if (!isNetworkOnlyFailure(error)) throw error;
    await enqueueSync(userId, 'CONTENT_COMPLETE', contentItemId);
    return { queued: true };
  }
}

export async function updateLearningProgressResilient(
  userId: string,
  resourceId: string,
  progressPct: number,
): Promise<ResilientWriteResult> {
  const normalized = Math.max(0, Math.min(100, Math.round(progressPct)));
  try {
    await api.patch(`/student/learning/resources/${resourceId}/progress`, { progressPct: normalized });
    return { queued: false };
  } catch (error: unknown) {
    if (!isNetworkOnlyFailure(error)) throw error;
    await enqueueSync(userId, 'RESOURCE_PROGRESS', resourceId, { progressPct: normalized });
    return { queued: true };
  }
}

async function replayEntry(entry: OfflineSyncEntry): Promise<void> {
  if (entry.kind === 'CONTENT_COMPLETE') {
    await api.post(`/content/items/${entry.targetId}/complete`);
    return;
  }
  const progressPct = Number(entry.payload.progressPct ?? 0);
  await api.patch(`/student/learning/resources/${entry.targetId}/progress`, { progressPct });
}

export async function listOfflineSyncEntries(userId: string): Promise<OfflineSyncEntry[]> {
  const db = await getDb();
  const all = await db.getAll('syncQueue');
  return all
    .filter((entry) => entry.userId === userId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeOfflineSyncEntry(userId: string, dedupeKey: string): Promise<void> {
  const db = await getDb();
  const entry = await db.get('syncQueue', dedupeKey);
  if (entry?.userId === userId) await db.delete('syncQueue', dedupeKey);
}

export async function getOfflineSyncState(userId: string): Promise<OfflineSyncState> {
  const entries = await listOfflineSyncEntries(userId);
  const lastSuccessfulSync = await getMeta<string>(userId, 'lastSuccessfulSync');
  return {
    pendingCount: entries.filter((entry) => entry.status === 'PENDING').length,
    failedCount: entries.filter((entry) => entry.status === 'PERMANENT_FAILURE').length,
    lastSuccessfulSync,
    entries,
  };
}

export async function flushOfflineQueue(userId: string, force = false): Promise<OfflineSyncSummary> {
  const db = await getDb();
  const entries = await listOfflineSyncEntries(userId);
  let attempted = 0;
  let succeeded = 0;
  let deferred = 0;
  let permanentFailures = 0;
  let stoppedForAuth = false;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const state = await getOfflineSyncState(userId);
    return {
      attempted,
      succeeded,
      deferred: state.pendingCount,
      permanentFailures: state.failedCount,
      pendingCount: state.pendingCount,
      failedCount: state.failedCount,
      stoppedForAuth,
      lastSuccessfulSync: state.lastSuccessfulSync,
    };
  }

  for (const entry of entries) {
    if (entry.status === 'PERMANENT_FAILURE') continue;
    if (!force && entry.nextAttemptAt > Date.now()) {
      deferred += 1;
      continue;
    }

    attempted += 1;
    try {
      await replayEntry(entry);
      await db.delete('syncQueue', entry.dedupeKey);
      succeeded += 1;
    } catch (error: unknown) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 401 || status === 403) {
        stoppedForAuth = true;
        break;
      }

      if (status && status >= 400 && status < 500) {
        permanentFailures += 1;
        await db.put('syncQueue', {
          ...entry,
          status: 'PERMANENT_FAILURE',
          updatedAt: nowIso(),
          lastError: axios.isAxiosError(error) ? error.message : 'The server rejected this offline change',
        });
        continue;
      }

      const attempts = entry.attempts + 1;
      deferred += 1;
      await db.put('syncQueue', {
        ...entry,
        attempts,
        nextAttemptAt: Date.now() + retryDelayMs(attempts),
        updatedAt: nowIso(),
        lastError: error instanceof Error ? error.message : 'Network sync failed',
      });
    }
  }

  if (succeeded > 0) await setMeta(userId, 'lastSuccessfulSync', nowIso());
  const state = await getOfflineSyncState(userId);
  return {
    attempted,
    succeeded,
    deferred,
    permanentFailures,
    pendingCount: state.pendingCount,
    failedCount: state.failedCount,
    stoppedForAuth,
    lastSuccessfulSync: state.lastSuccessfulSync,
  };
}

export async function saveDashboardSnapshot(userId: string, dashboard: StudentDashboard): Promise<void> {
  await setMeta(userId, 'studentDashboard', dashboard);
}

export async function getDashboardSnapshot(userId: string): Promise<StudentDashboard | null> {
  return getMeta<StudentDashboard>(userId, 'studentDashboard');
}

export async function saveLocalOfflineDownload(
  userId: string,
  input: Omit<OfflineDownloadRecord, 'key' | 'userId' | 'downloadedAt'> & { downloadedAt?: string },
): Promise<OfflineDownloadRecord> {
  const db = await getDb();
  const record: OfflineDownloadRecord = {
    ...input,
    key: downloadKey(userId, input.contentItemId),
    userId,
    downloadedAt: input.downloadedAt || nowIso(),
  };
  await db.put('downloads', record);
  return record;
}

export async function listLocalOfflineDownloads(userId: string): Promise<OfflineDownloadRecord[]> {
  const db = await getDb();
  const records = await db.getAll('downloads');
  return records
    .filter((record) => record.userId === userId)
    .sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
}

export async function removeLocalOfflineDownload(userId: string, contentItemId: string): Promise<void> {
  const db = await getDb();
  await db.delete('downloads', downloadKey(userId, contentItemId));
}

function absoluteUrl(url: string): string {
  if (typeof window === 'undefined') return url;
  return url.startsWith('/') ? `${window.location.origin}${url}` : url;
}

interface ServiceWorkerReply {
  ok: boolean;
  cached?: boolean;
  error?: string;
}

async function postServiceWorkerMessage(message: Record<string, unknown>): Promise<ServiceWorkerReply | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const worker = navigator.serviceWorker.controller || registration?.active || registration?.waiting || registration?.installing;
  if (!worker || typeof MessageChannel === 'undefined') return null;

  return new Promise<ServiceWorkerReply>((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve({ ok: false, error: 'Service worker did not respond' }), 8000);
    channel.port1.onmessage = (event: MessageEvent<ServiceWorkerReply>) => {
      window.clearTimeout(timeout);
      resolve(event.data || { ok: false });
    };
    worker.postMessage(message, [channel.port2]);
  });
}

async function directCachePut(url: string): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) throw new Error('Offline cache is not available');
  const absolute = absoluteUrl(url);
  const sameOrigin = new URL(absolute).origin === window.location.origin;
  const response = await fetch(absolute, {
    credentials: sameOrigin ? 'include' : 'omit',
    mode: sameOrigin ? 'same-origin' : 'cors',
  });
  if (!response.ok) throw new Error(`Could not cache learning asset (${response.status})`);
  const cache = await caches.open(LEARNING_CACHE_NAME);
  await cache.put(absolute, response.clone());
}

export async function cacheLearningAsset(url: string): Promise<void> {
  const absolute = absoluteUrl(url);
  const reply = await postServiceWorkerMessage({ type: 'CACHE_LEARNING_ASSET', url: absolute });
  if (reply?.ok) return;
  await directCachePut(absolute);
}

export async function removeCachedLearningAsset(url: string): Promise<void> {
  const absolute = absoluteUrl(url);
  const reply = await postServiceWorkerMessage({ type: 'REMOVE_LEARNING_ASSET', url: absolute });
  if (reply?.ok) return;
  if (typeof window === 'undefined' || !('caches' in window)) return;
  const cache = await caches.open(LEARNING_CACHE_NAME);
  await cache.delete(absolute);
}

export async function hasCachedLearningAsset(url: string): Promise<boolean> {
  const absolute = absoluteUrl(url);
  const reply = await postServiceWorkerMessage({ type: 'CHECK_LEARNING_ASSET', url: absolute });
  if (reply?.ok && typeof reply.cached === 'boolean') return reply.cached;
  if (typeof window === 'undefined' || !('caches' in window)) return false;
  const cache = await caches.open(LEARNING_CACHE_NAME);
  return Boolean(await cache.match(absolute));
}

export async function openCachedLearningAsset(url: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;
  const absolute = absoluteUrl(url);
  const cache = await caches.open(LEARNING_CACHE_NAME);
  const response = await cache.match(absolute);
  if (!response) return false;
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return true;
}
