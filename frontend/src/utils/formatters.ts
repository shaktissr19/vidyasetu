type DateInput = string | number | Date | null | undefined;

export function formatDate(date: DateInput): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function timeAgo(date: DateInput): string {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount == null) return '₹0';
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

export function xpToLevel(xp = 0) {
  const level = Math.min(Math.max(Math.floor(xp / 500) + 1, 1), 100);
  const current = (level - 1) * 500;
  const nextXP = level * 500;
  const progress = Math.round(((xp - current) / 500) * 100);
  return { level, progress, nextXP, current };
}

export function gradeFromScore(pct: number): 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F' {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 40) return 'D';
  return 'F';
}

export function attendanceColor(pct: number): string {
  if (pct >= 75) return 'var(--forest)';
  if (pct >= 60) return 'var(--saffron)';
  return '#C62828';
}

export function truncate(str: string | null | undefined, maxLen = 60): string {
  if (!str) return '';
  return str.length > maxLen ? `${str.slice(0, maxLen)}…` : str;
}

export function formatDuration(secs: number | null | undefined): string {
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

export function feeStatusClass(status: string): string {
  const map: Record<string, string> = { PAID: 'badge-green', PARTIAL: 'badge-orange', PENDING: 'badge-blue', OVERDUE: 'badge-red', WAIVED: 'badge-blue' };
  return map[status] || 'badge-blue';
}

export function attStatusClass(status: string): string {
  const map: Record<string, string> = { PRESENT: 'badge-green', ABSENT: 'badge-red', LATE: 'badge-orange', HOLIDAY: 'badge-blue', HALF_DAY: 'badge-orange' };
  return map[status] || 'badge-blue';
}

export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
export type DayCode = (typeof DAYS)[number];
export const DAY_LABELS: Record<DayCode, string> = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday' };
