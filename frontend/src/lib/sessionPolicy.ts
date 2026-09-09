export const SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
export const SESSION_RETURN_GRACE_MS = 5 * 60 * 1000;
export const SESSION_PRESENCE_HEARTBEAT_MS = 30 * 1000;

const LAST_ACTIVITY_KEY = 'vs_session_last_activity_at';
const LAST_PRESENCE_KEY = 'vs_session_last_presence_at';
const STARTED_AT_KEY = 'vs_session_started_at';
const AUTH_STORAGE_KEY = 'vidyasetu-auth';

export type SessionExpiryReason = 'idle' | 'away';

function readTimestamp(key: string): number | null {
  if (typeof window === 'undefined') return null;
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function writeTimestamp(key: string, value: number): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, String(value));
}

export function startTrackedSession(now = Date.now()): void {
  if (typeof window === 'undefined') return;
  writeTimestamp(STARTED_AT_KEY, now);
  writeTimestamp(LAST_ACTIVITY_KEY, now);
  writeTimestamp(LAST_PRESENCE_KEY, now);
}

export function touchSessionActivity(now = Date.now()): void {
  writeTimestamp(LAST_ACTIVITY_KEY, now);
  writeTimestamp(LAST_PRESENCE_KEY, now);
}

export function touchSessionPresence(now = Date.now()): void {
  writeTimestamp(LAST_PRESENCE_KEY, now);
}

export function clearTrackedSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STARTED_AT_KEY);
  window.localStorage.removeItem(LAST_ACTIVITY_KEY);
  window.localStorage.removeItem(LAST_PRESENCE_KEY);
}

export function purgePersistedAuthSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('vs_access_token');
  window.localStorage.removeItem('vs_refresh_token');
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  clearTrackedSession();
}

export function getTrackedSessionExpiryReason(now = Date.now()): SessionExpiryReason | null {
  if (typeof window === 'undefined') return null;

  const lastActivity = readTimestamp(LAST_ACTIVITY_KEY);
  const lastPresence = readTimestamp(LAST_PRESENCE_KEY);

  if (lastPresence && now - lastPresence > SESSION_RETURN_GRACE_MS) return 'away';
  if (lastActivity && now - lastActivity > SESSION_IDLE_TIMEOUT_MS) return 'idle';

  return null;
}

export function sessionReasonMessage(reason: SessionExpiryReason): string {
  if (reason === 'away') return 'For your security, please sign in again after being away from VidyaSetu for more than 5 minutes.';
  return 'For your security, you were signed out after 10 minutes without activity.';
}

export function hasTrackedSession(): boolean {
  return readTimestamp(STARTED_AT_KEY) !== null;
}
