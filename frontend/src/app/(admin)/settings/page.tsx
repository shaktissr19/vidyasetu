'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getConfig, updateConfig } from '@/services/adminService';
import { SectionHeader } from '@/components/ui/index';
import type { PlatformConfigItem } from '@/types/api';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

const GROUPS: Record<string, string[]> = {
  Gamification: ['XP_PER_LESSON', 'XP_PER_QUIZ_PASS', 'XP_PER_QUIZ_PERFECT', 'XP_STREAK_BONUS_7D', 'XP_STREAK_BONUS_30D'],
  'Auth & OTP': ['OTP_EXPIRY_MINUTES', 'OTP_MAX_ATTEMPTS', 'LOCKOUT_DURATION_MINUTES'],
  'Plans & Limits': ['FREE_PLAN_MAX_STUDENTS', 'BASIC_PLAN_MAX_STUDENTS', 'PRO_PLAN_MAX_STUDENTS', 'WHATSAPP_DAILY_LIMIT', 'CONTENT_MAX_SIZE_MB'],
  Payments: ['RAZORPAY_FEE_PCT'],
  Sync: ['OFFLINE_SYNC_INTERVAL_MINS'],
};

function coerceValue(original: string | number, draft: string): string | number | boolean {
  if (typeof original === 'number') return Number(draft);
  const normalized = String(original).trim().toLowerCase();
  if (normalized === 'true' || normalized === 'false') return draft.trim().toLowerCase() === 'true';
  if (/^-?\d+(?:\.\d+)?$/.test(String(original).trim()) && /^-?\d+(?:\.\d+)?$/.test(draft.trim())) return Number(draft);
  return draft;
}

function fieldType(value: string | number) {
  const text = String(value).trim().toLowerCase();
  if (text === 'true' || text === 'false') return 'boolean';
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return 'number';
  return 'text';
}

export default function AdminSettingsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Record<string, string>>({});

  const { data: config = [], isLoading, isError, error } = useQuery({
    queryKey: ['platform-config'],
    queryFn: () => getConfig().then((r) => r.data.data),
  });

  const mut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string | number | boolean }) => updateConfig(key, value),
    onSuccess: async (_, { key }) => {
      toast.success(`✅ ${key} updated`);
      setEditing((current) => { const next = { ...current }; delete next[key]; return next; });
      await qc.invalidateQueries({ queryKey: ['platform-config'] });
    },
    onError: (err: unknown) => toast.error(apiErrorText(err, 'Settings update failed')),
  });

  const configMap = useMemo(() => Object.fromEntries(config.map((item) => [item.key, item])) as Record<string, PlatformConfigItem>, [config]);
  const groupedKeys = useMemo(() => new Set(Object.values(GROUPS).flat()), []);
  const otherKeys = useMemo(() => config.map((item) => item.key).filter((key) => !groupedKeys.has(key)), [config, groupedKeys]);
  const sections = useMemo(() => ({ ...GROUPS, ...(otherKeys.length ? { Other: otherKeys } : {}) }), [otherKeys]);

  const beginEdit = (cfg: PlatformConfigItem) => setEditing((current) => ({ ...current, [cfg.key]: String(cfg.value) }));
  const cancelEdit = (key: string) => setEditing((current) => { const next = { ...current }; delete next[key]; return next; });
  const save = (cfg: PlatformConfigItem) => {
    const draft = editing[cfg.key];
    if (draft === undefined || !draft.trim()) { toast.error('A configuration value cannot be empty'); return; }
    mut.mutate({ key: cfg.key, value: coerceValue(cfg.value, draft) });
  };

  if (isLoading) return (
    <div className="animate-fade-up">
      <div className="skeleton h-8 w-64 mb-6 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
      {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-40 rounded-xl mb-4" style={{ background: 'rgba(255,255,255,0.05)' }} />)}
    </div>
  );

  if (isError) return <div className="card-navy" style={{ color: '#EF9A9A' }}>{apiErrorText(error, 'Could not load platform configuration')}</div>;

  return (
    <div className="animate-fade-up">
      <SectionHeader title="⚙️ Platform Settings" sub={`${config.length} governed configuration keys · every change is audit logged`} />

      <div className="card-navy mb-5" style={{ borderLeft: '4px solid var(--saffron)' }}>
        <div className="font-bold text-white">Configuration safety</div>
        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Changes use the validated per-key Admin API. Unknown keys cannot be created here, and every successful change records the previous and new value in Audit Trail.</p>
      </div>

      {Object.entries(sections).map(([group, keys]) => {
        const visible = keys.map((key) => configMap[key]).filter(Boolean);
        if (!visible.length) return null;
        return (
          <div key={group} className="card-navy mb-5">
            <h3 className="font-display font-bold text-base text-white mb-4">{group}</h3>
            <div className="space-y-1">
              {visible.map((cfg) => {
                const isEditing = cfg.key in editing;
                const kind = fieldType(cfg.value);
                return (
                  <div key={cfg.key} className="flex flex-col md:flex-row md:items-center gap-3 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white font-mono break-all">{cfg.key}</p>
                      {cfg.description && <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{cfg.description}</p>}
                    </div>
                    {isEditing ? (
                      <div className="flex gap-2 items-center flex-wrap md:justify-end">
                        {kind === 'boolean' ? (
                          <select value={editing[cfg.key]} onChange={(e) => setEditing((prev) => ({ ...prev, [cfg.key]: e.target.value }))}
                            className="input select" style={{ width: 110, background: '#111a32', color: 'white' }}>
                            <option value="true">true</option><option value="false">false</option>
                          </select>
                        ) : (
                          <input type={kind} value={editing[cfg.key]} onChange={(e) => setEditing((prev) => ({ ...prev, [cfg.key]: e.target.value }))}
                            className="input" style={{ width: kind === 'number' ? 130 : 220, background: 'rgba(255,107,0,0.1)', border: '1px solid rgba(255,107,0,0.45)', color: 'white' }} />
                        )}
                        <button className="btn-primary" disabled={mut.isPending} onClick={() => save(cfg)}>Save</button>
                        <button className="btn-ghost" onClick={() => cancelEdit(cfg.key)}>Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 md:justify-end">
                        <code className="text-sm font-extrabold break-all" style={{ color: 'var(--saffron-light)' }}>{String(cfg.value)}</code>
                        <button className="btn-ghost text-xs" onClick={() => beginEdit(cfg)}>Edit</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
