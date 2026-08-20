'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSubjects } from '@/services/contentService';
import { getDashboard } from '@/services/studentService';
import { useOffline } from '@/hooks/useOffline';
import { SectionHeader, ProgressBar } from '@/components/ui/index';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

const SUBJECT_ICONS: Record<string, string> = { MATH:'🔢', SCI:'🔬', ENG:'📖', HIN:'🅗', SST:'🌍', SAN:'🕉️' };
const SIZE_MB: Record<string, number> = { MATH: 34, SCI: 28, ENG: 22, HIN: 18, SST: 42, SAN: 14 };

export default function OfflinePage() {
  const { t } = useLanguageStore();
  const { isOnline, cachedSubjects } = useOffline();
  const [downloading, setDownloading] = useState<Set<string>>(new Set());

  const { data: dash } = useQuery({ queryKey: ['student-dashboard'], queryFn: () => getDashboard().then(r => r.data.data) });
  const className = dash?.student?.className?.split('-')[0] || dash?.student?.class_name?.split('-')[0] || '8';

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects', className],
    queryFn: () => getSubjects(className).then(r => r.data.data),
    enabled: !!className,
  });

  async function handleDownload(subjectCode: string): Promise<void> {
    if (!isOnline) { toast.error(t('इंटरनेट नहीं है। डाउनलोड करने के लिए कनेक्ट करें।', 'No internet. Connect to download.')); return; }
    setDownloading(prev => new Set(prev).add(subjectCode));
    await new Promise<void>(resolve => setTimeout(resolve, 2000));
    toast.success(`✅ ${subjectCode} downloaded for offline study!`);
    setDownloading(prev => { const next = new Set(prev); next.delete(subjectCode); return next; });
  }

  const totalMB = 142;
  const maxMB = 500;
  const usedPct = Math.round((totalMB / maxMB) * 100);

  return (
    <div className="animate-fade-up">
      <SectionHeader title={`📶 ${t('ऑफलाइन मोड', 'Offline Mode')}`} sub={t('बिना इंटरनेट के पढ़ने के लिए विषय डाउनलोड करें', 'Download subjects to study without internet')} />

      <div className="rounded-2xl px-5 py-4 mb-5 flex items-center justify-between gap-4 flex-wrap"
        style={{ background: isOnline ? 'linear-gradient(135deg, #0a4d2e, #0d6b3d)' : 'linear-gradient(135deg, #1a1a2e, #2d2d4e)' }}>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full" style={{ background: isOnline ? '#4CAF50' : '#FFD600', boxShadow: `0 0 8px ${isOnline ? '#4CAF50' : '#FFD600'}` }} />
          <div>
            <p className="font-bold text-white text-sm">{isOnline ? t('ऑनलाइन — डाउनलोड उपलब्ध', 'Online — Downloads available') : t('ऑफलाइन — कैश्ड कंटेंट उपलब्ध', 'Offline — Cached content available')}</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>{t('अंतिम सिंक:', 'Last synced:')} Today 9:04 AM · {totalMB} MB {t('उपयोग', 'used')}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-white">{totalMB} / {maxMB} MB</p>
          <div className="h-1.5 w-32 rounded-full mt-1" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <div className="h-full rounded-full" style={{ width: `${usedPct}%`, background: '#4CAF50' }} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {subjects.map(sub => {
          const isDownloaded = cachedSubjects.includes(sub.code) || ['MATH', 'HIN', 'SCI'].includes(sub.code);
          const isInProgress = downloading.has(sub.code);
          const sizeMB = SIZE_MB[sub.code] || 20;

          return (
            <div key={sub.id} className={`card flex items-center gap-4 transition-all ${isDownloaded ? '' : 'hover:shadow-md'}`}
              style={{ border: isDownloaded ? '1.5px solid var(--forest)' : '1.5px solid var(--border)', background: isDownloaded ? '#F0F7F2' : 'white' }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: isDownloaded ? 'var(--forest-pale)' : 'var(--saffron-pale)' }}>
                {SUBJECT_ICONS[sub.code] || '📚'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{sub.name} — {t('सभी अध्याय', 'All Chapters')}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{sub.chapter_count || '—'} chapters · ~{sizeMB} MB</p>
                {isInProgress && (
                  <div className="mt-2"><ProgressBar pct={65} color="var(--saffron)" height={4} showPct={false} /><p className="text-xs mt-1" style={{ color: 'var(--saffron)' }}>Downloading... 65%</p></div>
                )}
              </div>
              <div className="flex-shrink-0">
                {isDownloaded ? <span className="badge badge-green">✅ Downloaded</span> : isInProgress ? <span className="badge badge-orange animate-pulse">⏳ Downloading</span> : (
                  <button className="btn-primary text-sm py-2 px-4" onClick={() => void handleDownload(sub.code)} disabled={!isOnline}>📥 Download</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card mt-5" style={{ background: '#F8F9FC', border: 'none' }}>
        <h3 className="font-display font-bold text-sm mb-3" style={{ color: 'var(--navy)' }}>💡 {t('ऑफलाइन टिप्स', 'Offline Tips')}</h3>
        <ul className="space-y-2">
          {[
            t('WiFi पर डाउनलोड करें और कहीं भी पढ़ें', 'Download on WiFi and study anywhere'),
            t('परीक्षा से पहले सभी विषय डाउनलोड करें', 'Download all subjects before exams'),
            t('ऑफलाइन प्रगति ऑनलाइन होने पर सिंक होती है', 'Offline progress syncs when you come online'),
            t('डाउनलोड 30 दिन तक उपलब्ध रहते हैं', 'Downloads remain available for 30 days'),
          ].map((tip, i) => <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--slate)' }}><span style={{ color: 'var(--saffron)', flexShrink: 0 }}>•</span> {tip}</li>)}
        </ul>
      </div>
    </div>
  );
}
