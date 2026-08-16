'use client';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import useAuthStore from '@/store/authStore';
import { getDashboard } from '@/services/studentService';
import { getSubjects } from '@/services/contentService';
import { getBadges } from '@/services/studentService';
import { formatDate } from '@/utils/formatters';

const SECTIONS = [
  { id: 'overview',     icon: '🏠', label: 'Dashboard'    },
  { id: 'subjects',     icon: '📚', label: 'My Subjects'  },
  { id: 'ai-tutor',     icon: '🤖', label: 'AI Tutor'     },
  { id: 'doubt',        icon: '💬', label: 'Doubt Forum'  },
  { id: 'exams',        icon: '📝', label: 'Exams'        },
  { id: 'attendance',   icon: '📅', label: 'Attendance'   },
  { id: 'gamification', icon: '🎮', label: 'Badges & XP'  },
  { id: 'leaderboard',  icon: '🏆', label: 'Leaderboard'  },
  { id: 'report-card',  icon: '📄', label: 'Report Card'  },
  { id: 'offline',      icon: '📶', label: 'Offline Mode' },
];

const SUBJECT_COLORS = {
  MATH: { color: '#FF6B00', bg: '#FFF3E8', icon: '🔢' },
  SCI:  { color: '#1976D2', bg: '#E3F2FD', icon: '🔬' },
  ENG:  { color: '#138808', bg: '#E8F5E9', icon: '📖' },
  HIN:  { color: '#7B1FA2', bg: '#F3E5F5', icon: '🅗'  },
  SST:  { color: '#00695C', bg: '#E0F2F1', icon: '🌍' },
  SAN:  { color: '#E65100', bg: '#FBE9E7', icon: '🕉️' },
};

const GREETING = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
};

export default function StudentDashboard() {
  const router = useRouter();
  const { user, isLoggedIn } = useAuthStore();
  const [section, setSection] = useState('overview');
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState([
    { role: 'ai', text: 'Namaste! 🙏 Main aapka AI tutor hoon VidyaBot. Koi bhi sawaal poochho — Mathematics, Science, English, History — main Hindi ya English mein samjhaunga!' }
  ]);

  useEffect(() => {
    if (!isLoggedIn) router.replace('/login');
    if (user?.role && user.role !== 'STUDENT') router.replace('/login');
  }, [isLoggedIn, user, router]);

  const { data: dashData, isLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => getDashboard().then(r => r.data.data),
    enabled: isLoggedIn,
  });

  const student = dashData?.student || {};
  const xp = student.xp_total || 0;
  const level = student.xp_level || 1;
  const streak = student.streak_current || 0;
  const nextLevelXP = level * 500;
  const currentLevelXP = (level - 1) * 500;
  const xpProgress = Math.round(((xp - currentLevelXP) / 500) * 100);
  const name = user?.name || student.name || 'Student';
  const firstName = name.split(' ')[0];
  const className = student.class_name || '';
  const section2 = student.section || '';
  const schoolName = student.school_name || '';

  const attPct = dashData?.attendance?.percentage || 0;
  const attPresent = dashData?.attendance?.present_days || 0;
  const attWorking = dashData?.attendance?.working_days || 0;
  const subjects = dashData?.subjects || [];
  const leaderboard = dashData?.leaderboard || [];
  const recentXP = dashData?.recentXP || [];
  const badges = dashData?.badges || [];

  const sendAI = async () => {
    if (!aiInput.trim()) return;
    const q = aiInput.trim();
    setAiMessages(m => [...m, { role: 'user', text: q }]);
    setAiInput('');
    setTimeout(() => {
      setAiMessages(m => [...m, { role: 'ai', text: `Samajh gaya! "${q}" ke baare mein — yeh ek bahut accha sawaal hai. Step by step explain karta hoon:\n\n1. Pehle concept samjhein\n2. Formula yaad karein\n3. Example solve karein\n\nAur detail chahiye? Poochho! 😊` }]);
    }, 800);
  };

  const cardStyle = (accent) => ({
    background: 'white', borderRadius: 14, padding: '20px',
    border: `1.5px solid ${accent}40`, borderLeft: `4px solid ${accent}`,
    flex: 1, minWidth: 0,
  });

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (!isLoggedIn) return null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F4F6FA', fontFamily: "'Noto Sans', sans-serif" }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: 240, background: 'linear-gradient(180deg,#0D1B3E 0%,#1A2F5E 100%)',
        display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
        overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#FF6B00,#FF9A3C)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: 'white', fontSize: 16 }}>V</div>
          <span style={{ fontFamily: "'Baloo 2', cursive", fontWeight: 800, fontSize: '1.1rem', color: 'white' }}>Vidya<span style={{ color: '#FF9A3C' }}>Setu</span></span>
        </div>

        {/* Profile */}
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,107,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 10 }}>👦</div>
          <div style={{ fontWeight: 700, color: 'white', fontSize: '0.9rem' }}>{name}</div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>Class {className}{section2} · {schoolName}</div>
          <div style={{ marginTop: 8, background: 'rgba(255,107,0,0.15)', border: '1px solid rgba(255,107,0,0.3)', borderRadius: 20, padding: '3px 10px', display: 'inline-block', fontSize: '0.72rem', color: '#FF9A3C', fontWeight: 700 }}>
            ⭐ {xp.toLocaleString('en-IN')} XP · Level {level}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '8px 0', flex: 1 }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 20px', background: section === s.id ? 'rgba(255,107,0,0.15)' : 'none',
                borderLeft: `3px solid ${section === s.id ? '#FF6B00' : 'transparent'}`,
                border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                color: section === s.id ? '#FF9A3C' : 'rgba(255,255,255,0.6)',
                fontSize: '0.85rem', fontWeight: section === s.id ? 700 : 400,
              }}>
              <span style={{ fontSize: 15 }}>{s.icon}</span>{s.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── MAIN ── */}
      <main style={{ marginLeft: 240, flex: 1, padding: '28px 32px', minHeight: '100vh' }}>

        {/* ── OVERVIEW ── */}
        {section === 'overview' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontFamily: "'Baloo 2', cursive", fontSize: '1.6rem', fontWeight: 800, color: '#0D1B3E', margin: 0 }}>
                  {GREETING()}, {firstName}! 👋
                </h2>
                <p style={{ color: '#5A6278', fontSize: '0.85rem', margin: '4px 0 0' }}>{today} · Class {className}{section2}</p>
              </div>
              <button onClick={() => setSection('exams')} style={{ background: 'linear-gradient(135deg,#FF6B00,#FF9A3C)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 10, fontFamily: "'Baloo 2', cursive", fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                📝 Take Exam
              </button>
            </div>

            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 20 }}>
              {[
                { label: 'XP Points', value: xp.toLocaleString('en-IN'), sub: `Level ${level} · ${nextLevelXP - xp} to next`, accent: '#FF6B00', bg: '#FFF3E8' },
                { label: 'Attendance', value: `${Math.round(attPct)}%`, sub: `${attPresent}/${attWorking} days this month`, accent: '#138808', bg: '#E8F5E9' },
                { label: 'Class Rank', value: `#${leaderboard.findIndex(l => l.user_id === user?.id) + 1 || '—'}`, sub: 'School leaderboard', accent: '#1565C0', bg: '#E3F2FD' },
                { label: '🔥 Streak', value: `${streak} days`, sub: streak >= (student.streak_best || 0) ? 'Personal best!' : `Best: ${student.streak_best || 0}`, accent: '#E65100', bg: '#FBE9E7' },
              ].map((c, i) => (
                <div key={i} style={{ background: c.bg, borderRadius: 14, padding: '18px 20px', borderLeft: `4px solid ${c.accent}` }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: c.accent, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{c.label}</div>
                  <div style={{ fontFamily: "'Baloo 2', cursive", fontSize: '2rem', fontWeight: 800, color: '#0D1B3E', lineHeight: 1 }}>{isLoading ? '—' : c.value}</div>
                  <div style={{ fontSize: '0.75rem', color: '#5A6278', marginTop: 4 }}>{c.sub}</div>
                </div>
              ))}
            </div>

            {/* XP Progress bar */}
            <div style={{ background: 'white', borderRadius: 14, padding: '18px 22px', marginBottom: 20, border: '1px solid #E5E7F0' }}>
              <div style={{ fontWeight: 700, color: '#0D1B3E', marginBottom: 12, fontSize: '0.9rem' }}>⭐ Level Progress — Level {level} → {level + 1}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '0.8rem', color: '#5A6278', minWidth: 60 }}>{xp.toLocaleString('en-IN')} XP</span>
                <div style={{ flex: 1, height: 10, background: '#E5E7F0', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(xpProgress, 100)}%`, height: '100%', background: 'linear-gradient(to right,#FF6B00,#FF9A3C)', borderRadius: 5, transition: 'width 1s ease' }} />
                </div>
                <span style={{ fontSize: '0.8rem', color: '#5A6278', minWidth: 60, textAlign: 'right' }}>{nextLevelXP.toLocaleString('en-IN')} XP</span>
              </div>
            </div>

            {/* Bottom grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Subjects progress */}
              <div style={{ background: 'white', borderRadius: 14, padding: '20px', border: '1px solid #E5E7F0' }}>
                <div style={{ fontWeight: 700, color: '#0D1B3E', marginBottom: 16, fontSize: '0.9rem' }}>📚 Recent Subjects</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(subjects.length ? subjects : [
                    { name: 'Mathematics', code: 'MATH', pct: 78 },
                    { name: 'Science',     code: 'SCI',  pct: 65 },
                    { name: 'English',     code: 'ENG',  pct: 82 },
                    { name: 'Hindi',       code: 'HIN',  pct: 90 },
                  ]).slice(0, 4).map((s, i) => {
                    const cfg = SUBJECT_COLORS[s.code] || { color: '#FF6B00', bg: '#FFF3E8' };
                    const pct = s.pct || Math.floor(Math.random() * 40 + 50);
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: '0.85rem', minWidth: 80, color: '#0D1B3E', fontWeight: 500 }}>{s.name || s.subject_name}</span>
                        <div style={{ flex: 1, height: 8, background: '#E5E7F0', borderRadius: 4 }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(to right,${cfg.color},${cfg.color}99)`, borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: cfg.color, minWidth: 35, textAlign: 'right' }}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Today's tasks */}
              <div style={{ background: 'white', borderRadius: 14, padding: '20px', border: '1px solid #E5E7F0' }}>
                <div style={{ fontWeight: 700, color: '#0D1B3E', marginBottom: 16, fontSize: '0.9rem' }}>🔔 Today's Tasks</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { dot: '#138808', text: 'Complete Chapter 4 — Light & Optics exercise', sub: 'Science · Due today' },
                    { dot: '#FF6B00', text: 'Register for April Maths Olympiad before April 1', sub: 'Competition · Deadline approaching' },
                    { dot: '#1565C0', text: 'Revise quadratic equations — Maths exam on Tuesday', sub: 'Exam prep · 2 days left' },
                    { dot: '#138808', text: 'Answer posted for your Science doubt ✅', sub: 'Doubt Forum · 30 mins ago' },
                  ].map((t, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.dot, flexShrink: 0, marginTop: 5 }} />
                      <div>
                        <div style={{ fontSize: '0.83rem', color: '#0D1B3E', lineHeight: 1.4 }}>{t.text}</div>
                        <div style={{ fontSize: '0.72rem', color: '#5A6278', marginTop: 2 }}>{t.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SUBJECTS ── */}
        {section === 'subjects' && (
          <div>
            <h2 style={{ fontFamily: "'Baloo 2', cursive", fontSize: '1.5rem', fontWeight: 800, color: '#0D1B3E', marginBottom: 20 }}>📚 My Subjects</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 18 }}>
              {[
                { code: 'MATH', name: 'Mathematics', chapters: 24, pct: 78, new: '4 new videos' },
                { code: 'SCI',  name: 'Science',     chapters: 28, pct: 65, new: 'AI doubt pending' },
                { code: 'ENG',  name: 'English',     chapters: 20, pct: 82, new: '' },
                { code: 'HIN',  name: 'Hindi',       chapters: 18, pct: 90, new: 'Top scorer!' },
                { code: 'SST',  name: 'Social Science', chapters: 32, pct: 55, new: '' },
                { code: 'SAN',  name: 'Sanskrit',    chapters: 16, pct: 40, new: '' },
              ].map((s, i) => {
                const cfg = SUBJECT_COLORS[s.code] || { color: '#FF6B00', bg: '#FFF3E8', icon: '📚' };
                return (
                  <div key={i} onClick={() => {}}
                    style={{ background: 'white', borderRadius: 16, padding: '20px', border: '1.5px solid #E5E7F0', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = cfg.color; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7F0'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', marginBottom: 12 }}>{cfg.icon}</div>
                    <div style={{ fontFamily: "'Baloo 2', cursive", fontWeight: 700, color: '#0D1B3E', marginBottom: 10 }}>{s.name}</div>
                    <div style={{ height: 6, background: '#E5E7F0', borderRadius: 3, marginBottom: 8 }}>
                      <div style={{ width: `${s.pct}%`, height: '100%', background: cfg.color, borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#5A6278' }}>{s.pct}% complete · {s.chapters} chapters {s.new && <strong style={{ color: cfg.color }}> · {s.new}</strong>}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── AI TUTOR ── */}
        {section === 'ai-tutor' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontFamily: "'Baloo 2', cursive", fontSize: '1.5rem', fontWeight: 800, color: '#0D1B3E', margin: 0 }}>🤖 AI Tutor — VidyaBot</h2>
                <p style={{ color: '#5A6278', fontSize: '0.82rem', marginTop: 4 }}>Ask in Hindi or English. Explains step by step.</p>
              </div>
            </div>
            <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E5E7F0', overflow: 'hidden', maxWidth: 760 }}>
              <div style={{ background: 'linear-gradient(135deg,#0D1B3E,#1A2F5E)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,107,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🤖</div>
                <div>
                  <div style={{ color: 'white', fontWeight: 700, fontSize: '0.9rem' }}>VidyaBot</div>
                  <div style={{ color: '#4CAF50', fontSize: '0.72rem' }}>● Online · Hindi & English</div>
                </div>
              </div>
              <div style={{ height: 360, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {aiMessages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '75%', padding: '10px 14px', borderRadius: 12, fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-line',
                      background: m.role === 'user' ? 'linear-gradient(135deg,#FF6B00,#FF9A3C)' : '#F4F6FA',
                      color: m.role === 'user' ? 'white' : '#0D1B3E',
                      borderBottomRightRadius: m.role === 'user' ? 2 : 12,
                      borderBottomLeftRadius: m.role === 'ai' ? 2 : 12,
                    }}>{m.text}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 16px', borderTop: '1px solid #E5E7F0', display: 'flex', gap: 10 }}>
                <input value={aiInput} onChange={e => setAiInput(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && sendAI()}
                  placeholder="Ask in Hindi or English... (e.g. 'photosynthesis explain karo')"
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E5E7F0', fontSize: '0.85rem', outline: 'none' }} />
                <button onClick={sendAI}
                  style={{ background: 'linear-gradient(135deg,#FF6B00,#FF9A3C)', color: 'white', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                  Send ↗
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {['🔬 Light reflection formula', '🌍 French Revolution', '🔢 Quadratic equation', '🌱 Photosynthesis'].map((q, i) => (
                <button key={i} onClick={() => { setAiInput(q.split(' ').slice(1).join(' ')); }}
                  style={{ background: 'white', border: '1.5px solid #E5E7F0', borderRadius: 20, padding: '6px 14px', fontSize: '0.78rem', cursor: 'pointer', color: '#0D1B3E', fontWeight: 500 }}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── EXAMS ── */}
        {section === 'exams' && (
          <div>
            <h2 style={{ fontFamily: "'Baloo 2', cursive", fontSize: '1.5rem', fontWeight: 800, color: '#0D1B3E', marginBottom: 20 }}>📝 Exams & Tests</h2>
            <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E5E7F0', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7F0', fontWeight: 700, color: '#0D1B3E' }}>📌 Upcoming & Past Exams</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F8F9FC' }}>
                    {['Exam', 'Subject', 'Date', 'Score', 'Rank', 'Action'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 700, color: '#5A6278', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: 'Unit Test 4', subject: 'Science', date: 'Apr 5', score: null, rank: null, action: 'start' },
                    { name: 'March Maths Test', subject: 'Mathematics', date: 'Mar 15', score: '87/100', rank: '#3', action: 'done' },
                    { name: 'Science Quiz', subject: 'Science', date: 'Mar 10', score: '72/100', rank: '#8', action: 'done' },
                    { name: 'April Olympiad', subject: 'All Subjects', date: 'Apr 1', score: null, rank: null, action: 'register' },
                  ].map((ex, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F0F2F8' }}>
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0D1B3E', fontSize: '0.875rem' }}>{ex.name}</td>
                      <td style={{ padding: '14px 16px', color: '#5A6278', fontSize: '0.85rem' }}>{ex.subject}</td>
                      <td style={{ padding: '14px 16px', color: '#5A6278', fontSize: '0.85rem' }}>{ex.date}</td>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: ex.score ? '#138808' : '#5A6278', fontSize: '0.875rem' }}>{ex.score || '—'}</td>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: '#FF6B00', fontSize: '0.875rem' }}>{ex.rank || '—'}</td>
                      <td style={{ padding: '14px 16px' }}>
                        {ex.action === 'start' && <button style={{ background: 'linear-gradient(135deg,#FF6B00,#FF9A3C)', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>Start Exam →</button>}
                        {ex.action === 'register' && <button style={{ background: '#1A2F5E', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>Register</button>}
                        {ex.action === 'done' && <span style={{ background: '#E8F5E9', color: '#138808', borderRadius: 20, padding: '4px 12px', fontSize: '0.75rem', fontWeight: 700 }}>✅ Completed</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ATTENDANCE ── */}
        {section === 'attendance' && (
          <div>
            <h2 style={{ fontFamily: "'Baloo 2', cursive", fontSize: '1.5rem', fontWeight: 800, color: '#0D1B3E', marginBottom: 20 }}>📅 Attendance</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 20 }}>
              {[
                { label: 'Present', value: attPresent || 23, sub: 'Days this month', accent: '#138808', bg: '#E8F5E9' },
                { label: 'Absent',  value: (attWorking - attPresent) || 2, sub: 'Days this month', accent: '#FF6B00', bg: '#FFF3E8' },
                { label: 'Attendance %', value: `${Math.round(attPct) || 91}%`, sub: 'Good standing', accent: '#1565C0', bg: '#E3F2FD' },
                { label: 'YTD', value: '89%', sub: 'Year to date', accent: '#E65100', bg: '#FBE9E7' },
              ].map((c, i) => (
                <div key={i} style={{ background: c.bg, borderRadius: 14, padding: '18px 20px', borderLeft: `4px solid ${c.accent}` }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: c.accent, textTransform: 'uppercase', marginBottom: 6 }}>{c.label}</div>
                  <div style={{ fontFamily: "'Baloo 2', cursive", fontSize: '2rem', fontWeight: 800, color: '#0D1B3E' }}>{c.value}</div>
                  <div style={{ fontSize: '0.75rem', color: '#5A6278', marginTop: 4 }}>{c.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ background: 'white', borderRadius: 16, padding: '20px', border: '1px solid #E5E7F0' }}>
              <div style={{ fontWeight: 700, color: '#0D1B3E', marginBottom: 14 }}>May 2026</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, maxWidth: 380 }}>
                {['S','M','T','W','T','F','S'].map((d, i) => (
                  <div key={i} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#5A6278', paddingBottom: 6 }}>{d}</div>
                ))}
                {Array.from({ length: 35 }, (_, i) => {
                  const day = i - 3;
                  if (day < 1 || day > 31) return <div key={i} />;
                  const status = day % 7 === 0 || day % 7 === 6 ? 'weekend' : day === 5 || day === 18 ? 'absent' : 'present';
                  return (
                    <div key={i} style={{
                      textAlign: 'center', padding: '6px 4px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600,
                      background: status === 'present' ? '#E8F5E9' : status === 'absent' ? '#FFEBEE' : '#F4F6FA',
                      color: status === 'present' ? '#138808' : status === 'absent' ? '#C62828' : '#9E9E9E',
                    }}>{day}</div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
                {[['#E8F5E9','#138808','Present'],['#FFEBEE','#C62828','Absent'],['#F4F6FA','#9E9E9E','Weekend']].map(([bg,c,l]) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 4, background: bg, border: `1px solid ${c}40` }} />
                    <span style={{ fontSize: '0.75rem', color: '#5A6278' }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── GAMIFICATION ── */}
        {section === 'gamification' && (
          <div>
            <h2 style={{ fontFamily: "'Baloo 2', cursive", fontSize: '1.5rem', fontWeight: 800, color: '#0D1B3E', marginBottom: 20 }}>🎮 Badges & XP</h2>
            <div style={{ background: 'white', borderRadius: 16, padding: '22px', border: '1px solid #E5E7F0', marginBottom: 20 }}>
              <div style={{ fontWeight: 700, color: '#0D1B3E', marginBottom: 16 }}>⭐ Your XP Journey</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Baloo 2', cursive", fontSize: '2.5rem', fontWeight: 800, color: '#FF6B00' }}>{xp.toLocaleString('en-IN')}</div>
                  <div style={{ fontSize: '0.75rem', color: '#5A6278' }}>Total XP</div>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600 }}>Level {level}</span>
                    <span style={{ color: '#FF6B00', fontWeight: 700 }}>Level {level + 1} (need {nextLevelXP} XP)</span>
                  </div>
                  <div style={{ height: 10, background: '#E5E7F0', borderRadius: 5 }}>
                    <div style={{ width: `${Math.min(xpProgress, 100)}%`, height: '100%', background: 'linear-gradient(to right,#FF6B00,#FF9A3C)', borderRadius: 5 }} />
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#5A6278', marginTop: 4 }}>{nextLevelXP - xp} XP more to unlock Level {level + 1}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                {[[`${streak}🔥`, 'Day Streak', '#FFF3E8', '#FF6B00'],[`${badges.length || 5}`, 'Badges Earned', '#E8F5E9', '#138808'],['#14', 'Class Rank', '#EDE7F6', '#7B1FA2']].map(([v,l,bg,c]) => (
                  <div key={l} style={{ background: bg, borderRadius: 10, padding: '10px 18px', textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Baloo 2', cursive", fontWeight: 800, fontSize: '1.4rem', color: c }}>{v}</div>
                    <div style={{ fontSize: '0.72rem', color: '#5A6278' }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: 'white', borderRadius: 16, padding: '22px', border: '1px solid #E5E7F0' }}>
              <div style={{ fontWeight: 700, color: '#0D1B3E', marginBottom: 16 }}>🏅 Badges Collection</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 12 }}>
                {[
                  { emoji: '📚', name: 'Scholar',       pts: '+100 XP', earned: true },
                  { emoji: '🔥', name: '10-Day Streak',  pts: '+150 XP', earned: true },
                  { emoji: '🥇', name: 'Maths Top 10',   pts: '+200 XP', earned: true },
                  { emoji: '💬', name: 'Helpful Peer',   pts: '+50 XP',  earned: true },
                  { emoji: '📝', name: '10 Tests Done',  pts: '+100 XP', earned: true },
                  { emoji: '🏆', name: 'Olympiad Winner',pts: '+500 XP', earned: false },
                  { emoji: '⚡', name: 'Speed Solver',   pts: '+75 XP',  earned: false },
                  { emoji: '🛡️', name: 'Vidya Knight',   pts: 'Lv 8+',   earned: false },
                ].map((b, i) => (
                  <div key={i} style={{
                    textAlign: 'center', padding: '14px 10px', borderRadius: 12,
                    background: b.earned ? '#FFF3E8' : '#F4F6FA',
                    border: `1.5px solid ${b.earned ? '#FF6B0030' : '#E5E7F0'}`,
                    opacity: b.earned ? 1 : 0.5,
                  }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>{b.emoji}</div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: b.earned ? '#0D1B3E' : '#9E9E9E' }}>{b.name}</div>
                    <div style={{ fontSize: '0.65rem', color: b.earned ? '#FF6B00' : '#9E9E9E', marginTop: 3 }}>{b.pts}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── LEADERBOARD ── */}
        {section === 'leaderboard' && (
          <div>
            <h2 style={{ fontFamily: "'Baloo 2', cursive", fontSize: '1.5rem', fontWeight: 800, color: '#0D1B3E', marginBottom: 20 }}>🏆 Class Leaderboard</h2>
            <div style={{ background: 'white', borderRadius: 16, padding: '20px', border: '1px solid #E5E7F0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(leaderboard.length ? leaderboard : [
                  { rank: 1,  name: 'Priya Sharma', class: 'Class 8-A', xp: 2800, isYou: false, medal: '🥇' },
                  { rank: 2,  name: 'Ananya Gupta', class: 'Class 8-A', xp: 2100, isYou: false, medal: '🥈' },
                  { rank: 3,  name: 'Rahul Tiwari',  class: 'Class 10-A', xp: 1800, isYou: false, medal: '🥉' },
                  { rank: 14, name: `${firstName} (You)`, class: `Class ${className}${section2}`, xp, isYou: true, medal: null },
                ]).map((l, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                    borderRadius: 12, border: '1.5px solid',
                    background: l.isYou ? '#FFF3E8' : l.rank <= 3 ? '#FFFDE7' : '#F8F9FC',
                    borderColor: l.isYou ? '#FF6B0040' : l.rank <= 3 ? '#F5C51840' : '#E5E7F0',
                  }}>
                    <div style={{ width: 36, textAlign: 'center', fontFamily: "'Baloo 2', cursive", fontWeight: 800, fontSize: l.rank <= 3 ? '1.3rem' : '1rem', color: l.rank === 1 ? '#FFD700' : l.rank === 2 ? '#A8A9AD' : l.rank === 3 ? '#CD7F32' : '#5A6278' }}>
                      {l.medal || `#${l.rank}`}
                    </div>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: l.isYou ? '#FFF3E8' : '#F4F6FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                      {l.isYou ? '👦' : i % 2 === 0 ? '👧' : '👦'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: l.isYou ? '#FF6B00' : '#0D1B3E', fontSize: '0.9rem' }}>{l.name}</div>
                      <div style={{ fontSize: '0.72rem', color: '#5A6278' }}>{l.class || l.class_name}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: "'Baloo 2', cursive", fontWeight: 800, color: l.isYou ? '#FF6B00' : '#0D1B3E', fontSize: '1rem' }}>{(l.xp || l.xp_total || 0).toLocaleString('en-IN')}</div>
                      <div style={{ fontSize: '0.65rem', color: '#5A6278' }}>XP</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── REPORT CARD ── */}
        {section === 'report-card' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Baloo 2', cursive", fontSize: '1.5rem', fontWeight: 800, color: '#0D1B3E', margin: 0 }}>📄 Report Card</h2>
              <button style={{ background: 'linear-gradient(135deg,#FF6B00,#FF9A3C)', color: 'white', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontWeight: 700 }}>📥 Download PDF</button>
            </div>
            <div style={{ background: 'white', borderRadius: 16, padding: '24px', border: '1px solid #E5E7F0', maxWidth: 800 }}>
              <div style={{ textAlign: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '2px solid #E5E7F0' }}>
                <div style={{ fontWeight: 700, color: '#5A6278', fontSize: '0.85rem' }}>{schoolName} · UDISE: 2401120401012</div>
                <div style={{ fontFamily: "'Baloo 2', cursive", fontSize: '1.2rem', fontWeight: 800, color: '#0D1B3E', marginTop: 4 }}>Progress Report Card — Term 2, 2025–26</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20, fontSize: '0.85rem' }}>
                {[['Student Name', name], ['Class / Section', `${className} – ${section2}`], ['Roll Number', student.roll_number || '001'], ['Attendance', `${Math.round(attPct) || 91}% (Good)`]].map(([l, v]) => (
                  <div key={l}><div style={{ fontSize: '0.7rem', color: '#5A6278', marginBottom: 2 }}>{l}</div><div style={{ fontWeight: 700, color: '#0D1B3E' }}>{v}</div></div>
                ))}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F8F9FC' }}>
                    {['Subject', 'Max Marks', 'Marks', 'Grade', 'Remarks'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 700, color: '#5A6278', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[['Mathematics',87,'A','Excellent'],['Science',72,'B+','Good'],['English',81,'A','Very Good'],['Hindi',94,'A+','Outstanding'],['Social Science',68,'B','Satisfactory'],['Sanskrit',75,'B+','Good']].map(([sub, marks, grade, remark]) => (
                    <tr key={sub} style={{ borderBottom: '1px solid #F0F2F8' }}>
                      <td style={{ padding: '12px 14px', color: '#0D1B3E', fontWeight: 500 }}>{sub}</td>
                      <td style={{ padding: '12px 14px', color: '#5A6278' }}>100</td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0D1B3E' }}>{marks}</td>
                      <td style={{ padding: '12px 14px' }}><span style={{ background: marks >= 80 ? '#E8F5E9' : '#FFF3E8', color: marks >= 80 ? '#138808' : '#FF6B00', borderRadius: 20, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700 }}>{grade}</span></td>
                      <td style={{ padding: '12px 14px', color: '#5A6278', fontSize: '0.85rem' }}>{remark}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#F8F9FC', fontWeight: 700 }}>
                    <td style={{ padding: '12px 14px', color: '#0D1B3E', fontWeight: 800 }}>Total</td>
                    <td style={{ padding: '12px 14px', color: '#0D1B3E' }}>600</td>
                    <td style={{ padding: '12px 14px', color: '#0D1B3E' }}>477</td>
                    <td style={{ padding: '12px 14px' }}><span style={{ background: '#E8F5E9', color: '#138808', borderRadius: 20, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700 }}>A</span></td>
                    <td style={{ padding: '12px 14px', color: '#FF6B00', fontWeight: 700 }}>Class Rank: #14</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, paddingTop: 16, borderTop: '1px solid #E5E7F0', fontSize: '0.82rem', color: '#5A6278' }}>
                <span>Class Teacher: Mrs. Kavita Shah</span>
                <span>Principal: Mr. R.D. Mehta</span>
              </div>
            </div>
          </div>
        )}

        {/* ── DOUBT FORUM ── */}
        {section === 'doubt' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Baloo 2', cursive", fontSize: '1.5rem', fontWeight: 800, color: '#0D1B3E', margin: 0 }}>💬 Doubt Forum</h2>
              <button style={{ background: 'linear-gradient(135deg,#FF6B00,#FF9A3C)', color: 'white', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontWeight: 700 }}>+ Post Doubt</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { q: 'Why is the sky blue? Please explain in simple language 🌤️', tag: 'Science', by: 'Priya Sharma · 8A', answers: 3, status: '✅ Resolved', statusColor: '#138808' },
                { q: 'Quadratic formula kaise derive karte hain? Step by step chahiye.', tag: 'Maths', by: 'Ravi Kumar · 8B', answers: 2, status: '🤖 AI answered', statusColor: '#1565C0' },
                { q: 'French Revolution ke main causes kya the? Simple mein batao.', tag: 'Social Sc.', by: 'You (Arjun)', answers: 1, status: '⏳ Pending', statusColor: '#FF6B00' },
                { q: 'Photosynthesis ka diagram draw karna hai — koi help kar sakta hai?', tag: 'Science', by: 'Sneha Patil · 7A', answers: 5, status: '✅ Best answer', statusColor: '#138808' },
              ].map((d, i) => (
                <div key={i} style={{ background: 'white', borderRadius: 14, padding: '16px 20px', border: '1.5px solid #E5E7F0', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#FF6B00'; e.currentTarget.style.transform = 'translateX(4px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7F0'; e.currentTarget.style.transform = 'none'; }}>
                  <div style={{ fontWeight: 600, color: '#0D1B3E', marginBottom: 8, lineHeight: 1.5 }}>{d.q}</div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ background: '#E3F2FD', color: '#1565C0', borderRadius: 20, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700 }}>{d.tag}</span>
                    <span style={{ fontSize: '0.75rem', color: '#5A6278' }}>by {d.by}</span>
                    <span style={{ fontSize: '0.75rem', color: '#5A6278' }}>💬 {d.answers} answers</span>
                    <span style={{ fontSize: '0.75rem', color: d.statusColor, fontWeight: 700 }}>{d.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── OFFLINE ── */}
        {section === 'offline' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Baloo 2', cursive", fontSize: '1.5rem', fontWeight: 800, color: '#0D1B3E', margin: '0 0 4px' }}>📶 Offline Mode</h2>
              <p style={{ color: '#5A6278', fontSize: '0.82rem', margin: 0 }}>Download content to study without internet</p>
            </div>
            <div style={{ background: 'linear-gradient(135deg,#0D1B3E,#1A2F5E)', borderRadius: 16, padding: '20px 24px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ background: '#E8F5E9', color: '#138808', borderRadius: 20, padding: '4px 14px', fontSize: '0.78rem', fontWeight: 700, display: 'inline-block', marginBottom: 6 }}>✅ 3 Subjects Cached Offline</div>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)' }}>Last synced: Today 9:04 AM · 142 MB used</div>
            </div>
            <div style={{ background: 'white', borderRadius: 16, padding: '20px', border: '1px solid #E5E7F0' }}>
              <div style={{ fontWeight: 700, color: '#0D1B3E', marginBottom: 16 }}>📥 Download for Offline Study</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { name: 'Mathematics — All Chapters', detail: '24 videos · 48 PDFs · 12 quizzes · 34 MB', downloaded: true },
                  { name: 'Hindi — All Chapters', detail: '20 videos · 40 PDFs · 16 quizzes · 28 MB', downloaded: true },
                  { name: 'Science — Chapters 1–3', detail: '8 videos · 16 PDFs · 6 quizzes · 18 MB', downloaded: true },
                  { name: 'English — All Chapters', detail: '20 videos · 36 PDFs · 10 quizzes · 22 MB', downloaded: false },
                  { name: 'Social Science — All Chapters', detail: '32 videos · 60 PDFs · 14 quizzes · 42 MB', downloaded: false },
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 12, background: s.downloaded ? '#E8F5E9' : 'white', border: `1.5px ${s.downloaded ? 'solid #13880820' : 'dashed #E5E7F0'}` }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0D1B3E', fontSize: '0.9rem' }}>{s.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#5A6278', marginTop: 2 }}>{s.detail}</div>
                    </div>
                    {s.downloaded
                      ? <span style={{ background: '#E8F5E9', color: '#138808', borderRadius: 20, padding: '5px 14px', fontSize: '0.78rem', fontWeight: 700 }}>✅ Downloaded</span>
                      : <button style={{ background: 'linear-gradient(135deg,#FF6B00,#FF9A3C)', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }}>📥 Download</button>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
