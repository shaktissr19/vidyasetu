'use client';
/**
 * components/ui/index.js
 * Every reusable UI primitive used across VidyaSetu.
 * All pages import from here: import { StatCard, ... } from '@/components/ui/index'
 */

// ── StatCard ─────────────────────────────────────────────────
export function StatCard({ label, value, sub, accent = 'var(--saffron)', icon, onClick }) {
  return (
    <div
      className="card"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', borderTop: `3px solid ${accent}`, minWidth: 0 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
          {label}
        </p>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      </div>
      <p style={{ fontFamily: "'Baloo 2', cursive", fontWeight: 800, fontSize: '1.6rem', color: 'var(--navy)', lineHeight: 1.1 }}>
        {value ?? '—'}
      </p>
      {sub && <p style={{ fontSize: '0.72rem', color: 'var(--slate)', marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

// ── ProgressBar ──────────────────────────────────────────────
export function ProgressBar({ label, pct = 0, color = 'var(--saffron)', showPct = true, height = 7 }) {
  const safe = Math.max(0, Math.min(100, pct || 0));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--navy)', fontWeight: 600 }}>{label}</span>
        {showPct && <span style={{ fontSize: '0.72rem', color: 'var(--slate)', fontWeight: 700 }}>{safe}%</span>}
      </div>
      <div className="prog-track" style={{ height }}>
        <div className="prog-fill" style={{ width: `${safe}%`, background: color }} />
      </div>
    </div>
  );
}

// ── SectionHeader ────────────────────────────────────────────
export function SectionHeader({ title, sub, children }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
      <div>
        <h1 style={{ fontFamily: "'Baloo 2', cursive", fontWeight: 800, fontSize: '1.35rem', color: 'var(--navy)', lineHeight: 1.2 }}>
          {title}
        </h1>
        {sub && <p style={{ fontSize: '0.8rem', color: 'var(--slate)', marginTop: 3 }}>{sub}</p>}
      </div>
      {children && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>}
    </div>
  );
}

// ── StatusBadge ──────────────────────────────────────────────
const STATUS_MAP = {
  // Fee
  PAID:      { cls: 'badge-green',  label: 'Paid' },
  PARTIAL:   { cls: 'badge-orange', label: 'Partial' },
  PENDING:   { cls: 'badge-blue',   label: 'Pending' },
  OVERDUE:   { cls: 'badge-red',    label: 'Overdue' },
  WAIVED:    { cls: 'badge-blue',   label: 'Waived' },
  // Attendance
  PRESENT:   { cls: 'badge-green',  label: 'Present' },
  ABSENT:    { cls: 'badge-red',    label: 'Absent' },
  LATE:      { cls: 'badge-orange', label: 'Late' },
  HOLIDAY:   { cls: 'badge-blue',   label: 'Holiday' },
  HALF_DAY:  { cls: 'badge-orange', label: 'Half Day' },
  // School/User
  ACTIVE:    { cls: 'badge-green',  label: 'Active' },
  SUSPENDED: { cls: 'badge-red',    label: 'Suspended' },
  INACTIVE:  { cls: 'badge-red',    label: 'Inactive' },
  // Exam
  LIVE:               { cls: 'badge-red',    label: 'Live' },
  COMPLETED:          { cls: 'badge-green',  label: 'Completed' },
  REGISTRATION_OPEN:  { cls: 'badge-orange', label: 'Open' },
  DRAFT:              { cls: 'badge-blue',   label: 'Draft' },
  // Plan
  FREE:       { cls: 'badge-blue',   label: 'Free' },
  BASIC:      { cls: 'badge-orange', label: 'Basic' },
  PRO:        { cls: 'badge-green',  label: 'Pro' },
  ENTERPRISE: { cls: 'badge-gold',   label: 'Enterprise' },
};

export function StatusBadge({ status, label }) {
  const cfg = STATUS_MAP[status] || { cls: 'badge-blue', label: status };
  return <span className={`badge ${cfg.cls}`}>{label || cfg.label}</span>;
}

// ── CardSkeleton ─────────────────────────────────────────────
export function CardSkeleton({ lines = 2 }) {
  return (
    <div className="card" style={{ minHeight: 90 }}>
      <div className="skeleton" style={{ height: 12, width: '40%', marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 28, width: '60%', marginBottom: 8 }} />
      {lines > 1 && <div className="skeleton" style={{ height: 10, width: '50%' }} />}
    </div>
  );
}

// ── TableSkeleton ────────────────────────────────────────────
export function TableSkeleton({ rows = 5, cols = 4 }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, padding: '12px 16px', borderBottom: i < rows - 1 ? '1px solid var(--border)' : 'none' }}>
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="skeleton" style={{ height: 14, borderRadius: 4 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────
export function EmptyState({ icon = '📭', title, sub, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <p style={{ fontFamily: "'Baloo 2', cursive", fontWeight: 700, fontSize: '1rem', color: 'var(--navy)', marginBottom: 6 }}>
        {title}
      </p>
      {sub && <p style={{ fontSize: '0.8rem', color: 'var(--slate)', marginBottom: 16 }}>{sub}</p>}
      {action}
    </div>
  );
}

// ── ActivityItem ─────────────────────────────────────────────
export function ActivityItem({ icon, title, sub, right, accent = 'var(--saffron-pale)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</p>
        {sub && <p style={{ fontSize: '0.72rem', color: 'var(--slate)', marginTop: 2 }}>{sub}</p>}
      </div>
      {right && <div style={{ flexShrink: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--saffron)' }}>{right}</div>}
    </div>
  );
}

// ── NotifItem ────────────────────────────────────────────────
export function NotifItem({ type, title, body, sentAt, isRead, onClick }) {
  const TYPE_ICON = {
    ATTENDANCE_ABSENT: '📅', ATTENDANCE_LATE: '⏰',
    FEE_REMINDER: '💰', FEE_OVERDUE: '⚠️', FEE_PAID: '✅',
    EXAM_RESULT: '🏆', ANNOUNCEMENT: '📢',
    BADGE_EARNED: '🏅', STREAK_BROKEN: '💔',
    NEW_CONTENT: '📚', DOUBT_ANSWERED: '💬', SYSTEM: 'ℹ️',
  };
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', gap: 12, padding: '12px 16px', cursor: onClick ? 'pointer' : 'default',
        background: isRead ? 'transparent' : 'var(--saffron-pale)',
        borderBottom: '1px solid var(--border)',
        transition: 'background 0.2s',
      }}
    >
      <span style={{ fontSize: 20, flexShrink: 0 }}>{TYPE_ICON[type] || '🔔'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.875rem', fontWeight: isRead ? 500 : 700, color: 'var(--navy)' }}>{title}</p>
        <p style={{ fontSize: '0.75rem', color: 'var(--slate)', marginTop: 2, lineHeight: 1.4 }}>{body}</p>
      </div>
      {!isRead && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--saffron)', flexShrink: 0, marginTop: 6 }} />}
    </div>
  );
}

// ── LBRow (Leaderboard Row) ───────────────────────────────────
export function LBRow({ rank, name, photo, xp, level, classLabel, isCurrentUser }) {
  const RANK_COLORS = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };
  const medal = { 1: '🥇', 2: '🥈', 3: '🥉' };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
      background: isCurrentUser ? 'var(--saffron-pale)' : 'transparent',
      borderRadius: 10, borderLeft: isCurrentUser ? '3px solid var(--saffron)' : '3px solid transparent',
      marginBottom: 4,
    }}>
      <div style={{ width: 28, textAlign: 'center', fontFamily: "'Baloo 2', cursive", fontWeight: 800, fontSize: '0.9rem', color: RANK_COLORS[rank] || 'var(--slate)', flexShrink: 0 }}>
        {medal[rank] || `#${rank}`}
      </div>
      <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--saffron-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
        {photo ? <img src={photo} alt={name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : '🎓'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name} {isCurrentUser && <span style={{ fontSize: '0.65rem', color: 'var(--saffron)' }}>YOU</span>}
        </p>
        <p style={{ fontSize: '0.7rem', color: 'var(--slate)' }}>Class {classLabel} · Lv.{level}</p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ fontFamily: "'Baloo 2', cursive", fontWeight: 800, fontSize: '0.95rem', color: 'var(--saffron)' }}>{(xp || 0).toLocaleString('en-IN')}</p>
        <p style={{ fontSize: '0.65rem', color: 'var(--slate)' }}>XP</p>
      </div>
    </div>
  );
}
