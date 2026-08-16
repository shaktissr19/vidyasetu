'use client';
import { useQuery } from '@tanstack/react-query';
import { getBadges } from '@/services/studentService';
import { getDashboard } from '@/services/studentService';
import { CardSkeleton } from '@/components/ui/index';
import { xpToLevel } from '@/utils/formatters';
import useLanguageStore from '@/store/languageStore';

const BADGE_ICONS = {
  FIRST_LOGIN: '👣', STREAK_3: '🔥', STREAK_7: '🔥', STREAK_10: '🔥', STREAK_30: '🏅',
  LESSON_10: '📚', LESSON_50: '🎓', QUIZ_PERFECT: '💯', DOUBT_HELPER: '🤝',
  OLYMPIAD_TOP10: '⭐', OLYMPIAD_WIN: '🏆', PROFILE_DONE: '✅', ATTENDANCE_90: '📅',
};

export default function GamificationPage() {
  const { t } = useLanguageStore();

  const { data: dash } = useQuery({ queryKey: ['student-dashboard'], queryFn: () => getDashboard().then(r => r.data.data) });
  const { data: badges = [], isLoading } = useQuery({ queryKey: ['badges'], queryFn: () => getBadges().then(r => r.data.data) });

  const student = dash?.student || {};
  const { level, progress, nextXP } = xpToLevel(student.xpTotal || 0);

  const earned = badges.filter(b => b.earned);
  const locked = badges.filter(b => !b.earned);

  const LEVEL_NAMES = ['', 'Shishya', 'Sikhsharthi', 'Gyanarthi', 'Vidyarthi', 'Medhavi', 'Pratibhavan', 'Vidya Knight', 'Vidya Warrior', 'Vidya Master', 'Vidya Champion'];

  return (
    <div className="animate-fade-up">
      <h1 className="font-display font-extrabold text-2xl mb-5" style={{ color: 'var(--navy)' }}>
        🎮 {t('बैज और XP', 'Badges & XP')}
      </h1>

      {/* XP Overview */}
      <div className="card mb-5" style={{ background: 'linear-gradient(135deg, var(--navy), var(--navy-mid))', border: 'none' }}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {t('आपका स्तर', 'Your Level')}
            </p>
            <p className="font-display font-extrabold text-3xl text-white">Level {level}</p>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {LEVEL_NAMES[level] || 'Scholar'} 🛡️
            </p>
          </div>
          <div className="text-center">
            <div className="font-display font-extrabold text-4xl" style={{ color: 'var(--gold)' }}>
              {(student.xpTotal || 0).toLocaleString()}
            </div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Total XP</p>
          </div>
        </div>

        {/* XP bar */}
        <div className="mb-2">
          <div className="flex justify-between text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <span>Level {level}</span>
            <span>{nextXP - (student.xpTotal || 0)} XP to Level {level + 1}</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${progress}%`, background: 'linear-gradient(to right, var(--gold), var(--saffron))' }} />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: t('🔥 Streak',    'Streak'),    value: `${student.streakCurrent || 0} days` },
            { label: t('🏅 बैज',       'Badges'),    value: `${earned.length}/${badges.length}` },
            { label: t('📈 Best',      'Best'),      value: `${student.streakBest || 0} days` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <p className="font-display font-extrabold text-lg text-white">{value}</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : (
        <>
          {/* Earned badges */}
          {earned.length > 0 && (
            <div className="mb-6">
              <h2 className="font-display font-bold text-base mb-3" style={{ color: 'var(--navy)' }}>
                🏅 {t('अर्जित बैज', 'Earned Badges')} ({earned.length})
              </h2>
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 stagger">
                {earned.map((b) => (
                  <div key={b.id} className="card text-center py-4 animate-fade-up hover:shadow-md transition-all"
                    style={{ border: '2px solid var(--gold)', background: '#FFFDE7' }}>
                    <div className="text-3xl mb-2">{BADGE_ICONS[b.code] || '🏅'}</div>
                    <p className="text-xs font-bold leading-tight" style={{ color: 'var(--navy)' }}>{b.name}</p>
                    <p className="text-xs mt-1 font-bold" style={{ color: 'var(--saffron)' }}>+{b.xp_reward} XP</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Locked badges */}
          {locked.length > 0 && (
            <div>
              <h2 className="font-display font-bold text-base mb-3" style={{ color: 'var(--slate)' }}>
                🔒 {t('अगले बैज', 'Upcoming Badges')} ({locked.length})
              </h2>
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 stagger">
                {locked.map((b) => (
                  <div key={b.id} className="card text-center py-4 opacity-50 animate-fade-up"
                    style={{ filter: 'grayscale(1)', border: '1.5px dashed var(--border)' }}>
                    <div className="text-3xl mb-2">{BADGE_ICONS[b.code] || '🔒'}</div>
                    <p className="text-xs font-bold leading-tight" style={{ color: 'var(--slate)' }}>{b.name}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>+{b.xp_reward} XP</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
