'use client';
import { useQuery } from '@tanstack/react-query';
import { getConfig, updateConfig } from '@/services/adminService';
import { SectionHeader } from '@/components/ui/index';
import toast from 'react-hot-toast';

const CONTENT_STATS = [
  { icon: '🎥', label: 'Videos Published', value: '2,840', sub: '9 languages' },
  { icon: '📄', label: 'PDFs / Notes',      value: '5,200', sub: 'NCERT aligned' },
  { icon: '📝', label: 'Quiz Questions',     value: '18,400', sub: 'All subjects' },
  { icon: '🌐', label: 'Languages',          value: '9',    sub: 'hi, en, ta, te, mr...' },
];

export default function AdminContentPage() {
  return (
    <div className="animate-fade-up">
      <SectionHeader title="📚 Content Management">
        <button className="btn-primary" onClick={() => toast('Opening content upload form...')}>+ Upload Content</button>
      </SectionHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {CONTENT_STATS.map(s => (
          <div key={s.label} className="card-navy text-center py-4">
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className="font-display font-extrabold text-2xl text-white">{s.value}</div>
            <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* By subject */}
      <div className="card-navy">
        <h3 className="font-display font-bold text-white mb-4">Content by Subject</h3>
        <div className="overflow-x-auto">
          <table className="tbl" style={{ color: 'rgba(255,255,255,0.7)' }}>
            <thead>
              <tr>
                {['Subject', 'Videos', 'PDFs', 'Quizzes', 'Languages', 'Status'].map(h => (
                  <th key={h} style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Mathematics', 840, 1200, 4800, 9, '✅ Complete'],
                ['Science',     720,  980, 3600, 8, '✅ Complete'],
                ['English',     480,  640, 2400, 3, '✅ Complete'],
                ['Hindi',       420,  580, 2100, 4, '✅ Complete'],
                ['Social Sc.',  300,  400, 1600, 6, '🔄 In Progress'],
                ['Sanskrit',    80,   100,  400, 2, '⏳ Pending'],
              ].map(([sub, vid, pdf, quiz, lang, status]) => (
                <tr key={sub} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td className="font-semibold text-white">{sub}</td>
                  <td>{vid}</td>
                  <td>{pdf}</td>
                  <td>{quiz}</td>
                  <td>{lang}</td>
                  <td className="text-xs">{status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
