'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLeaderboard } from '@/services/studentService';
import { LBRow, CardSkeleton } from '@/components/ui/index';
import useLanguageStore from '@/store/languageStore';

export default function LeaderboardPage() {
  const { t } = useLanguageStore();
  const [scope, setScope] = useState('class');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['leaderboard', scope],
    queryFn:  () => getLeaderboard(scope).then(r => r.data.data),
  });

  const myRow = rows.find(r => r.is_me);

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)' }}>
            🏆 {t('लीडरबोर्ड', 'Leaderboard')}
          </h1>
          {myRow && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--slate)' }}>
              {t('आपकी रैंक:', 'Your rank:')} <strong style={{ color: 'var(--saffron)' }}>#{myRow.rank}</strong> · {(myRow.xp_total || 0).toLocaleString()} XP
            </p>
          )}
        </div>
        {/* Scope toggle */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--saffron-pale)' }}>
          {[['class', t('कक्षा', 'Class')], ['school', t('स्कूल', 'School')]].map(([k, l]) => (
            <button key={k} onClick={() => setScope(k)}
              className="px-4 py-1.5 rounded-lg text-sm font-bold transition-all"
              style={{ background: scope === k ? 'white' : 'transparent', color: scope === k ? 'var(--saffron)' : 'var(--slate)', boxShadow: scope === k ? '0 2px 8px rgba(255,107,0,0.15)' : 'none' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : (
        <div className="stagger">
          {rows.slice(0, 3).map((r, i) => (
            <div key={r.user_id} className="animate-fade-up">
              <LBRow rank={i + 1} name={r.name} school={r.school_name} score={`${r.xp_total?.toLocaleString()} XP`} isMe={r.is_me} />
            </div>
          ))}

          {rows.length > 3 && (
            <div className="my-3 text-center">
              <div className="inline-flex items-center gap-2 text-xs" style={{ color: 'var(--slate)' }}>
                <div className="h-px w-12" style={{ background: 'var(--border)' }} />
                Ranks 4–{rows.length - (myRow && myRow.rank > 3 ? 1 : 0)}
                <div className="h-px w-12" style={{ background: 'var(--border)' }} />
              </div>
            </div>
          )}

          {rows.slice(3, rows.length - (myRow && myRow.rank > 3 ? 1 : 0)).map((r) => (
            <div key={r.user_id} className="animate-fade-up">
              <LBRow rank={r.rank} name={r.name} school={r.school_name} score={`${r.xp_total?.toLocaleString()} XP`} isMe={r.is_me} />
            </div>
          ))}

          {myRow && myRow.rank > 3 && (
            <>
              <div className="my-3 text-center">
                <div className="inline-flex items-center gap-2 text-xs" style={{ color: 'var(--slate)' }}>
                  <div className="h-px w-12" style={{ background: 'var(--border)' }} />
                  {t('आपकी रैंक', 'Your position')}
                  <div className="h-px w-12" style={{ background: 'var(--border)' }} />
                </div>
              </div>
              <LBRow rank={myRow.rank} name={myRow.name} score={`${myRow.xp_total?.toLocaleString()} XP`} isMe={true} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
