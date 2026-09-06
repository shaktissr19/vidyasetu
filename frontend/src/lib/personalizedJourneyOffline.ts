import axios from 'axios';
import api from '@/services/api';
import type { ApiEnvelope } from '@/types/api';
import type { StudentPersonalizedJourney } from '@/services/studentService';

const CACHE_VERSION = 1;
const CACHE_PREFIX = 'vidyasetu:personalized-journey';

interface CachedJourney {
  version: number;
  userId: string;
  savedAt: string;
  data: StudentPersonalizedJourney;
}

export interface ResilientJourneyResult {
  data: StudentPersonalizedJourney;
  offline: boolean;
}

function cacheKey(userId: string): string {
  return `${CACHE_PREFIX}:${userId}`;
}

function indiaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: 'year' | 'month' | 'day') => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function savePersonalizedJourneySnapshot(userId: string, data: StudentPersonalizedJourney): void {
  if (typeof window === 'undefined') return;
  const record: CachedJourney = {
    version: CACHE_VERSION,
    userId,
    savedAt: new Date().toISOString(),
    data,
  };
  window.localStorage.setItem(cacheKey(userId), JSON.stringify(record));
}

export function getPersonalizedJourneySnapshot(userId: string): StudentPersonalizedJourney | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const record = JSON.parse(raw) as CachedJourney;
    if (record.version !== CACHE_VERSION || record.userId !== userId) return null;
    if (!record.data?.journey || record.data.journey.date !== indiaDate()) return null;
    return record.data;
  } catch {
    return null;
  }
}

export async function getPersonalizedJourneyResilient(userId: string): Promise<ResilientJourneyResult> {
  try {
    const response = await api.get<ApiEnvelope<StudentPersonalizedJourney>>('/student/learning/journey/today');
    savePersonalizedJourneySnapshot(userId, response.data.data);
    return { data: response.data.data, offline: false };
  } catch (error: unknown) {
    const networkFailure = (typeof navigator !== 'undefined' && navigator.onLine === false)
      || (axios.isAxiosError(error) && !error.response);
    if (!networkFailure) throw error;
    const cached = getPersonalizedJourneySnapshot(userId);
    if (!cached) throw error;
    return { data: cached, offline: true };
  }
}
