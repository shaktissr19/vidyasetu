'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getConfig, updateConfig } from '@/services/adminService';
import { SectionHeader, CardSkeleton } from '@/components/ui/index';
import toast from 'react-hot-toast';

const GROUPS = {
  'Gamification':  ['XP_PER_LESSON','XP_PER_QUIZ_PASS','XP_PER_QUIZ_PERFECT','XP_STREAK_BONUS_7D','XP_STREAK_BONUS_30D'],
  'Auth & OTP':    ['OTP_EXPIRY_MINUTES','OTP_MAX_ATTEMPTS','LOCKOUT_DURATION_MINUTES'],
  'Plans & Limits':['FREE_PLAN_MAX_STUDENTS','BASIC_PLAN_MAX_STUDENTS','PRO_PLAN_MAX_STUDENTS','WHATSAPP_DAILY_LIMIT','CONTENT_MAX_SIZE_MB'],
  'Payments':      ['RAZORPAY_FEE_PCT'],
  'Sync':          ['OFFLINE_SYNC_INTERVAL_MINS'],
};

export default function AdminSettingsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState({});

  const { data: config = [], isLoading } = useQuery({
    queryKey: ['platform-config'],
    queryFn:  () => getConfig().then(r => r.data.data),
  });

  const mut = useMutation({
    mutationFn: ({ key, value }) => updateConfig(key, value),
    onSuccess: (_, { key }) => {
      toast.success(`✅ ${key} updated`);
      setEditing(e => { const n = { ...e }; delete n[key]; return n; });
      qc.invalidateQueries(['platform-config']);
    },
    onError: () => toast.error('Update failed'),
  });

  const configMap = Object.fromEntries((config || []).map(c => [c.key, c]));

  if (isLoading) return (
    <div className="animate-fade-up">
      <div className="skeleton h-8 w-64 mb-6 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
      {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-40 rounded-xl mb-4" style={{ background: 'rgba(255,255,255,0.05)' }} />)}
    </div>
  );

  return (
    <div className="animate-fade-up">
      <SectionHeader title="⚙️ Platform Settings" sub="Global configuration — changes apply immediately" />

      {Object.entries(GROUPS).map(([group, keys]) => (
        <div key={group} className="card-navy mb-5">
          <h3 className="font-display font-bold text-base text-white mb-4">{group}</h3>
          <div className="space-y-3">
            {keys.map(key => {
              const cfg = configMap[key];
              if (!cfg) return null;
              const isEditing = key in editing;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>{key}</p>
                    {cfg.description && <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{cfg.description}</p>}
                  </div>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="number"
                        value={editing[key]}
                        onChange={e => setEditing(prev => ({ ...prev, [key]: e.target.value }))}
                        style={{ width: 90, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,107,0,0.5)', background: 'rgba(255,107,0,0.1)', color: 'white', fontSize: '0.875rem', textAlign: 'center' }}
                      />
                      <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                        disabled={mut.isPending}
                        onClick={() => mut.mutate({ key, value: editing[key] })}>
                        Save
                      </button>
                      <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}
                        onClick={() => setEditing(e => { const n = { ...e }; delete n[key]; return n; })}>
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 800, color: 'var(--saffron-light)', minWidth: 48, textAlign: 'right' }}>
                        {cfg.value}
                      </span>
                      <button className="btn-ghost" style={{ padding: '5px 10px', fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}
                        onClick={() => setEditing(e => ({ ...e, [key]: cfg.value }))}>
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
