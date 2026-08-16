/**
 * formatters.js — All display formatting utilities used across VidyaSetu frontend.
 */

/** Format a date string/object to dd MMM yyyy (Indian style) */
export function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/** Relative time: "2 hours ago", "3 दिन पहले" */
export function timeAgo(date) {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const mins  = Math.floor(diff / 60000);
  const hrs   = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs  < 24) return `${hrs}h ago`;
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

/** Format currency as ₹1,23,456 */
export function formatCurrency(amount) {
  if (amount == null) return '₹0';
  return '₹' + Number(amount).toLocaleString('en-IN');
}

/**
 * XP → level calculation.
 * 1 level per 500 XP, capped at 100.
 * Returns { level, progress (0-100%), nextXP }
 */
export function xpToLevel(xp = 0) {
  const level   = Math.min(Math.max(Math.floor(xp / 500) + 1, 1), 100);
  const current = (level - 1) * 500;
  const nextXP  = level * 500;
  const progress = Math.round(((xp - current) / 500) * 100);
  return { level, progress, nextXP, current };
}

/** Grade label from percentage score */
export function gradeFromScore(pct) {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 40) return 'D';
  return 'F';
}

/** Format attendance percentage with colour hint */
export function attendanceColor(pct) {
  if (pct >= 75) return 'var(--forest)';
  if (pct >= 60) return 'var(--saffron)';
  return '#C62828';
}

/** Truncate text to maxLen with ellipsis */
export function truncate(str, maxLen = 60) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

/** Format duration in seconds → "12:34" or "1h 2m" */
export function formatDuration(secs) {
  if (!secs) return '';
  if (secs < 3600) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m`;
}

/** Fee status → badge class */
export function feeStatusClass(status) {
  const map = {
    PAID:    'badge-green',
    PARTIAL: 'badge-orange',
    PENDING: 'badge-blue',
    OVERDUE: 'badge-red',
    WAIVED:  'badge-blue',
  };
  return map[status] || 'badge-blue';
}

/** Attendance status → badge class */
export function attStatusClass(status) {
  const map = {
    PRESENT:  'badge-green',
    ABSENT:   'badge-red',
    LATE:     'badge-orange',
    HOLIDAY:  'badge-blue',
    HALF_DAY: 'badge-orange',
  };
  return map[status] || 'badge-blue';
}

/** Day of week from index (0=Mon) */
export const DAYS = ['MON','TUE','WED','THU','FRI','SAT'];
export const DAY_LABELS = { MON:'Monday', TUE:'Tuesday', WED:'Wednesday', THU:'Thursday', FRI:'Friday', SAT:'Saturday' };
