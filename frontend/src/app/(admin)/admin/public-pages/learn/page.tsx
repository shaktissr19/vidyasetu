'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getAdminLearnPage, publishLearnPageDraft, saveLearnPageDraft, type LearnPageContent } from '@/services/publicPageContentService';
import { apiErrorText } from '@/utils/errors';

type Field = { key: string; label: string; multiline?: boolean };
const inputClass = 'mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200';

function EditorField({ label, value, multiline, onChange }: { label: string; value: string; multiline?: boolean; onChange: (value: string) => void }) {
  return <label className="block text-sm font-semibold text-slate-800">{label}{multiline ? <textarea className={`${inputClass} min-h-24`} value={value} onChange={(event) => onChange(event.target.value)} /> : <input className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
}

function RowEditor({ title, rows, fields, onChange }: { title: string; rows: Array<Record<string, string>>; fields: Field[]; onChange: (rows: Array<Record<string, string>>) => void }) {
  const edit = (index: number, key: string, value: string) => onChange(rows.map((row, i) => i === index ? { ...row, [key]: value } : row));
  return <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5"><h3 className="mb-4 text-lg font-extrabold text-slate-900">{title}</h3><div className="grid gap-3 sm:grid-cols-2">{rows.map((row, index) => <fieldset key={`${title}-${row.id || row.category || index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><legend className="px-1 text-sm font-bold text-slate-700">{row.id || row.category || `${title} ${index + 1}`}</legend><div className="space-y-3">{fields.map((field) => <EditorField key={field.key} label={field.label} value={row[field.key] || ''} multiline={field.multiline} onChange={(value) => edit(index, field.key, value)} />)}</div></fieldset>)}</div></section>;
}

export default function LearnPageEditor() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin-public-page', 'learn'], queryFn: () => getAdminLearnPage().then((response) => response.data.data) });
  const [content, setContent] = useState<LearnPageContent | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (query.data && !dirty) setContent(query.data.draft || query.data.published); }, [query.data, dirty]);
  const save = useMutation({ mutationFn: (draft: LearnPageContent) => saveLearnPageDraft(draft), onSuccess: async () => { setDirty(false); toast.success('Learn page draft saved. It is not public until you publish it.'); await queryClient.invalidateQueries({ queryKey: ['admin-public-page', 'learn'] }); }, onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not save the Learn page draft.')) });
  const publish = useMutation({ mutationFn: () => publishLearnPageDraft(), onSuccess: async () => { setDirty(false); toast.success('Learn page changes are now public.'); await Promise.all([queryClient.invalidateQueries({ queryKey: ['admin-public-page', 'learn'] }), queryClient.invalidateQueries({ queryKey: ['public-page-content', 'learn'] })]); }, onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not publish the Learn page.')) });

  function setGroup<K extends keyof LearnPageContent>(group: K, key: string, value: string) {
    if (!content) return;
    setContent({ ...content, [group]: { ...content[group], [key]: value } } as LearnPageContent); setDirty(true);
  }
  function setRows(group: 'learningTypes' | 'development', key: 'categories' | 'pillars', rows: Array<Record<string, string>>) {
    if (!content) return;
    setContent({ ...content, [group]: { ...content[group], [key]: rows } } as unknown as LearnPageContent); setDirty(true);
  }
  function fields<K extends keyof LearnPageContent>(group: K, config: Array<[string, string, boolean?]>) {
    const data = content?.[group] as Record<string, string> | undefined;
    return config.map(([key, label, multiline]) => <EditorField key={`${String(group)}-${key}`} label={label} value={data?.[key] || ''} multiline={multiline} onChange={(value) => setGroup(group, key, value)} />);
  }

  if (query.isLoading) return <div className="p-6 text-slate-700">Loading Learn page content…</div>;
  if (query.isError || !content) return <section role="alert" className="m-5 rounded-2xl border border-red-300 bg-white p-6 text-red-900"><h1 className="text-xl font-bold">Learn editor could not load</h1><p className="mt-2">Refresh the page or contact the platform owner if this continues.</p><button className="mt-3 rounded-lg bg-slate-900 px-4 py-2 font-bold text-white" onClick={() => query.refetch()}>Retry</button></section>;

  const categoryRows = content.learningTypes.categories as unknown as Array<Record<string, string>>;
  const pillarRows = content.development.pillars as unknown as Array<Record<string, string>>;
  return <div className="mx-auto max-w-6xl space-y-5 p-4 pb-24 sm:p-6">
    <header className="rounded-2xl bg-[#243B63] p-5 text-white sm:p-6"><p className="text-xs font-black tracking-[.14em] text-orange-300">SUPER ADMIN · PUBLIC WEBSITE</p><h1 className="mt-1 text-2xl font-extrabold">Learn page editor</h1><p className="mt-2 max-w-3xl text-sm text-blue-100">Edit the Learn page story and pathway labels. Grade and board filters, resources and practice sets are still populated from the public overview and published Learning Library APIs.</p><p className="mt-3 text-xs text-blue-100">Published version {query.data?.version || 1} · Last published {query.data?.publishedAt ? new Date(query.data.publishedAt).toLocaleString('en-IN') : 'not available'}</p></header>
    <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5"><h2 className="mb-4 text-lg font-extrabold text-slate-900">Hero</h2><div className="grid gap-4 sm:grid-cols-2">{fields('hero', [['eyebrow','Eyebrow'],['title','Title'],['description','Description',true],['imageUrl','Image URL or same-site path'],['primaryActionLabel','Primary button label'],['secondaryActionLabel','Secondary button label']])}</div></section>
    <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5"><h2 className="mb-4 text-lg font-extrabold text-slate-900">Browse learning levels</h2><div className="grid gap-4 sm:grid-cols-2">{fields('browse', [['eyebrow','Eyebrow'],['title','Heading'],['description','Description',true]])}</div></section>
    <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5"><h2 className="mb-4 text-lg font-extrabold text-slate-900">Learning types</h2><div className="grid gap-4 sm:grid-cols-2">{fields('learningTypes', [['eyebrow','Section label'],['title','Heading'],['description','Description',true],['allLabel','All learning label'],['allDescription','All learning description']])}</div></section>
    <RowEditor title="Learning type labels and descriptions" rows={categoryRows} fields={[{ key: 'label', label: 'Accessible category name' }, { key: 'shortLabel', label: 'Card title' }, { key: 'description', label: 'Card description' }]} onChange={(rows) => setRows('learningTypes', 'categories', rows)} />
    <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5"><h2 className="mb-4 text-lg font-extrabold text-slate-900">Learning resources</h2><div className="grid gap-4 sm:grid-cols-2">{fields('results', [['eyebrow','Section label'],['title','Default heading'],['description','Description',true]])}</div><p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-slate-700">The displayed resources, selected grade, board and category results remain connected to the Learning Library. This editor does not copy learning records.</p></section>
    <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5"><h2 className="mb-4 text-lg font-extrabold text-slate-900">Practice</h2><div className="grid gap-4 sm:grid-cols-2">{fields('practice', [['eyebrow','Section label'],['title','Default heading'],['description','Description',true],['emptyMessage','No practice available message',true],['chooseMessage','Choose a class message',true]])}</div><p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-slate-700">Practice cards continue to come from the published assessments API.</p></section>
    <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5"><h2 className="mb-4 text-lg font-extrabold text-slate-900">Development pathways</h2><div className="grid gap-4 sm:grid-cols-2">{fields('development', [['eyebrow','Section label'],['title','Heading'],['description','Description',true]])}</div></section>
    <RowEditor title="Pathway cards" rows={pillarRows} fields={[{ key: 'eyebrow', label: 'Eyebrow' }, { key: 'title', label: 'Title' }, { key: 'copy', label: 'Description', multiline: true }]} onChange={(rows) => setRows('development', 'pillars', rows)} />
    <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5"><h2 className="mb-4 text-lg font-extrabold text-slate-900">Closing call to action</h2><div className="grid gap-4 sm:grid-cols-2">{fields('finalCta', [['eyebrow','Eyebrow'],['title','Title'],['description','Description',true],['loginLabel','Login button label'],['createAccountLabel','Create account button label']])}</div></section>
    <details className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"><summary className="cursor-pointer font-extrabold text-slate-900">Preview Learn content before publishing</summary><div className="mt-3 rounded-xl bg-[#DCE5EF] p-4"><p className="text-xs font-black tracking-widest text-orange-800">{content.hero.eyebrow}</p><h2 className="mt-2 text-2xl font-extrabold text-[#14213D]">{content.hero.title}</h2><p className="mt-2 text-slate-700">{content.hero.description}</p><div className="mt-4 grid gap-2 sm:grid-cols-3">{content.learningTypes.categories.map((row) => <p key={row.id} className="rounded-lg bg-[#456184] p-3 text-white"><strong>{row.shortLabel}</strong><br />{row.description}</p>)}</div></div></details>
    <footer className="fixed bottom-2 left-4 right-4 z-20 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-white/95 p-3 shadow-xl backdrop-blur"><p className="text-sm font-semibold text-slate-700" role="status">{dirty ? 'Unsaved edits' : query.data?.draft ? 'Draft saved · not public yet' : 'No unpublished draft'}</p><div className="flex gap-2"><button type="button" className="min-h-11 rounded-lg bg-[#14213D] px-4 font-bold text-white disabled:opacity-50" disabled={save.isPending || publish.isPending || !dirty} onClick={() => save.mutate(content)}>{save.isPending ? 'Saving…' : 'Save draft'}</button><button type="button" className="min-h-11 rounded-lg bg-[#FF8A3D] px-4 font-bold text-[#14213D] disabled:opacity-50" disabled={save.isPending || publish.isPending || dirty || !query.data?.draft} onClick={() => { if (window.confirm('Publish the saved Learn page draft for all public visitors?')) publish.mutate(); }}>{publish.isPending ? 'Publishing…' : 'Publish Learn page'}</button></div></footer>
  </div>;
}
