'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getContentAnalytics } from '@/services/adminService';
import {
  getAdminUploadUrl,
  getChapters,
  getSubjects,
  saveAdminContentItem,
  type SaveContentItemPayload,
} from '@/services/contentService';
import { SectionHeader } from '@/components/ui/index';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

type ContentType = SaveContentItemPayload['type'];

interface UploadForm {
  className: string;
  subjectId: string;
  chapterId: string;
  type: ContentType;
  title: string;
  titleHi: string;
  language: string;
  status: 'DRAFT' | 'PUBLISHED';
  xpReward: number;
  isOfflineReady: boolean;
}

const INITIAL_FORM: UploadForm = {
  className: '8', subjectId: '', chapterId: '', type: 'VIDEO', title: '', titleHi: '',
  language: 'hi', status: 'DRAFT', xpReward: 10, isOfflineReady: true,
};

export default function AdminContentPage() {
  const qc = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState<UploadForm>(INITIAL_FORM);
  const [file, setFile] = useState<File | null>(null);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-content-analytics'],
    queryFn: () => getContentAnalytics().then((r) => r.data.data),
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ['admin-content-subjects', form.className],
    queryFn: () => getSubjects(form.className).then((r) => r.data.data),
  });
  const { data: chapters = [] } = useQuery({
    queryKey: ['admin-content-chapters', form.subjectId, form.className],
    queryFn: () => getChapters(form.subjectId, form.className).then((r) => r.data.data),
    enabled: Boolean(form.subjectId),
  });

  useEffect(() => {
    setForm((current) => ({ ...current, subjectId: '', chapterId: '' }));
  }, [form.className]);
  useEffect(() => {
    setForm((current) => ({ ...current, chapterId: '' }));
  }, [form.subjectId]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!form.chapterId) throw new Error('Select a chapter');
      if (!form.title.trim()) throw new Error('Title is required');
      if (form.type !== 'QUIZ' && !file) throw new Error('Choose a file to upload');

      let fileKey: string | null = null;
      if (file) {
        const upload = await getAdminUploadUrl({
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          chapterId: form.chapterId,
          type: form.type,
        }).then((r) => r.data.data);
        const response = await fetch(upload.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        if (!response.ok) throw new Error(`File upload failed (${response.status})`);
        fileKey = upload.key;
      }

      return saveAdminContentItem({
        chapterId: form.chapterId,
        type: form.type,
        status: form.status,
        title: form.title.trim(),
        titleHi: form.titleHi.trim() || null,
        language: form.language,
        fileUrl: fileKey,
        fileSizeKb: file ? Math.ceil(file.size / 1024) : null,
        xpReward: form.xpReward,
        isOfflineReady: form.type === 'QUIZ' ? false : form.isOfflineReady,
      });
    },
    onSuccess: async () => {
      toast.success('✅ Content saved');
      setForm(INITIAL_FORM);
      setFile(null);
      setShowUpload(false);
      await qc.invalidateQueries({ queryKey: ['admin-content-analytics'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Content upload failed')),
  });

  return (
    <div className="animate-fade-up">
      <SectionHeader title="📚 Content Management" sub={`${stats?.publishedItems || 0} published · ${stats?.draftItems || 0} drafts`}>
        <button className="btn-primary" onClick={() => setShowUpload((value) => !value)}>{showUpload ? '✕ Cancel' : '+ Upload Content'}</button>
      </SectionHeader>

      {showUpload && (
        <div className="card-navy mb-6 animate-fade-up">
          <h3 className="font-display font-bold text-white mb-4">📤 Upload Content</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Class
              <select className="input select mt-1.5" value={form.className} onChange={(e) => setForm((v) => ({ ...v, className: e.target.value }))}
                style={{ background: '#111a32', color: 'white' }}>
                {['1','2','3','4','5','6','7','8','9','10','11','12'].map((cls) => <option key={cls} value={cls}>Class {cls}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Subject
              <select className="input select mt-1.5" value={form.subjectId} onChange={(e) => setForm((v) => ({ ...v, subjectId: e.target.value }))}
                style={{ background: '#111a32', color: 'white' }}>
                <option value="">Select subject</option>
                {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Chapter
              <select className="input select mt-1.5" value={form.chapterId} onChange={(e) => setForm((v) => ({ ...v, chapterId: e.target.value }))}
                disabled={!form.subjectId} style={{ background: '#111a32', color: 'white' }}>
                <option value="">Select chapter</option>
                {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>Chapter {chapter.chapter_number}: {chapter.title}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Type
              <select className="input select mt-1.5" value={form.type} onChange={(e) => setForm((v) => ({ ...v, type: e.target.value as ContentType }))}
                style={{ background: '#111a32', color: 'white' }}>
                {['VIDEO','PDF','NOTES','AUDIO','QUIZ'].map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Title
              <input className="input mt-1.5" value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} placeholder="Content title"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Hindi title (optional)
              <input className="input mt-1.5" value={form.titleHi} onChange={(e) => setForm((v) => ({ ...v, titleHi: e.target.value }))} placeholder="हिंदी शीर्षक"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Language
              <select className="input select mt-1.5" value={form.language} onChange={(e) => setForm((v) => ({ ...v, language: e.target.value }))}
                style={{ background: '#111a32', color: 'white' }}>
                {['hi','en','ta','te','mr','bn','gu','kn','or'].map((lang) => <option key={lang} value={lang}>{lang.toUpperCase()}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Status
              <select className="input select mt-1.5" value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value as UploadForm['status'] }))}
                style={{ background: '#111a32', color: 'white' }}>
                <option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option>
              </select>
            </label>
            {form.type !== 'QUIZ' && (
              <label className="text-xs font-bold md:col-span-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                File
                <input type="file" className="input mt-1.5" onChange={(e) => setFile(e.target.files?.[0] || null)}
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
              </label>
            )}
          </div>
          <div className="flex items-center gap-4 mt-4">
            <label className="text-xs flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.65)' }}>
              <input type="checkbox" checked={form.isOfflineReady} disabled={form.type === 'QUIZ'} onChange={(e) => setForm((v) => ({ ...v, isOfflineReady: e.target.checked }))} /> Offline-ready
            </label>
            <label className="text-xs flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.65)' }}>XP
              <input type="number" min={0} max={500} value={form.xpReward} onChange={(e) => setForm((v) => ({ ...v, xpReward: Number(e.target.value) }))}
                style={{ width: 72, padding: '5px 8px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid rgba(255,255,255,0.12)' }} />
            </label>
          </div>
          {form.type === 'QUIZ' && <p className="text-xs mt-3" style={{ color: 'var(--saffron-light)' }}>This creates the quiz content container. Quiz questions are managed through the quiz-question data workflow.</p>}
          <button className="btn-primary mt-4" disabled={uploadMutation.isPending || !form.chapterId || !form.title.trim() || (form.type !== 'QUIZ' && !file)} onClick={() => uploadMutation.mutate()}>
            {uploadMutation.isPending ? 'Uploading…' : form.status === 'PUBLISHED' ? 'Publish Content' : 'Save Draft'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { icon: '🎥', label: 'Videos Published', value: stats?.videos || 0, sub: 'Published videos' },
          { icon: '📄', label: 'PDFs / Notes', value: stats?.documents || 0, sub: 'Published documents' },
          { icon: '📝', label: 'Quiz Questions', value: stats?.quizQuestions || 0, sub: 'Question bank' },
          { icon: '🌐', label: 'Languages', value: stats?.languages || 0, sub: 'Published content' },
        ].map((item) => (
          <div key={item.label} className="card-navy text-center py-4">
            <div className="text-2xl mb-2">{item.icon}</div>
            <div className="font-display font-extrabold text-2xl text-white">{isLoading ? '—' : Number(item.value).toLocaleString('en-IN')}</div>
            <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{item.label}</div>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{item.sub}</div>
          </div>
        ))}
      </div>

      <div className="card-navy mb-5">
        <h3 className="font-display font-bold text-white mb-4">Content by Subject</h3>
        <div className="overflow-x-auto">
          <table className="tbl" style={{ color: 'rgba(255,255,255,0.7)' }}>
            <thead><tr>{['Subject','Chapters','Videos','PDFs / Notes','Quiz Questions','Languages'].map((header) => <th key={header} style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}>{header}</th>)}</tr></thead>
            <tbody>
              {(stats?.bySubject || []).map((row) => (
                <tr key={row.subject_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td className="font-semibold text-white">{row.subject_name}</td><td>{row.chapters}</td><td>{row.videos}</td><td>{row.documents}</td><td>{row.quiz_questions}</td><td>{row.languages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-navy">
        <h3 className="font-display font-bold text-white mb-4">Recently Added</h3>
        {(stats?.recentItems || []).length === 0 ? <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No content items yet.</p> : (
          <div className="space-y-2">
            {(stats?.recentItems || []).map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div><div className="text-sm font-semibold text-white">{item.title}</div><div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{item.subject_name} · {item.chapter_title} · {item.language.toUpperCase()}</div></div>
                <div className="flex gap-2"><span className="badge badge-blue">{item.type}</span><span className={`badge ${item.status === 'PUBLISHED' ? 'badge-green' : 'badge-orange'}`}>{item.status}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
