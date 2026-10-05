'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMySyllabus, saveSyllabusProfile, getSyllabusDocuments, getSyllabusDocument, type SyllabusDocument } from '@/services/syllabusService';

export default function MySyllabus() {
  const client = useQueryClient();
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [search, setSearch] = useState('');
  const [boardChoice, setBoardChoice] = useState('');
  const [gradeChoice, setGradeChoice] = useState('');
  const [yearChoice, setYearChoice] = useState('');
  const syllabusQuery = useQuery({ queryKey: ['my-syllabus'], queryFn: () => getMySyllabus().then(r => r.data.data) });
  const data = syllabusQuery.data;
  const profile = data?.profile;
  const boardCode = profile?.boardCode || '';
  const gradeCode = profile?.gradeCode || '';
  const academicYear = profile?.academicYear || '';
  const boardName = data?.options.boards.find(b => b.code === boardCode)?.name || boardCode;
  const gradeName = data?.options.grades.find(g => g.code === gradeCode)?.name || gradeCode.replace('CLASS_', 'Class ');
  const documentsQuery = useQuery({
    queryKey: ['student-syllabus-documents', boardCode, gradeCode, academicYear, search],
    queryFn: () => getSyllabusDocuments({ boardCode, gradeCode, academicYear, query: search }, false).then(r => r.data.data),
    enabled: Boolean(boardCode && gradeCode && academicYear),
  });
  const documentQuery = useQuery({
    queryKey: ['student-syllabus-document', selectedDocumentId],
    queryFn: () => getSyllabusDocument(selectedDocumentId, false).then(r => r.data.data),
    enabled: Boolean(selectedDocumentId),
  });
  useEffect(() => {
    if (!profile) return;
    setBoardChoice(profile.boardCode || '');
    setGradeChoice(profile.gradeCode);
    setYearChoice(profile.academicYear);
  }, [profile?.boardCode, profile?.gradeCode, profile?.academicYear]);
  const saveProfile = useMutation({
    mutationFn: () => saveSyllabusProfile({ boardCode: boardChoice, gradeCode: gradeChoice, academicYear: yearChoice, language: 'en' }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['my-syllabus'] }); },
  });
  const subjects = useMemo(() => {
    if (!data) return [];
    return data.options.subjects.map(subject => {
      const topics = data.topics.filter(topic => topic.subject_id === subject.id && !topic.is_retired);
      const documents = (documentsQuery.data || []).filter((doc: SyllabusDocument) => doc.subject_id === subject.id);
      return { ...subject, topics, documents };
    });
  }, [data, documentsQuery.data]);
  const selectedSubject = subjects.find(subject => subject.id === selectedSubjectId);
  const boardWideDocuments = (documentsQuery.data || []).filter((doc: SyllabusDocument) => !doc.subject_id);

  if (syllabusQuery.isLoading) return <main className="mx-auto max-w-6xl p-6"><p role="status">Loading your syllabus…</p></main>;
  if (syllabusQuery.isError) return <main className="mx-auto max-w-6xl p-6"><Link className="underline" href="/student">← Student Portal</Link><section className="card mt-4 p-6"><h1 className="text-2xl font-bold">My Syllabus</h1><p role="alert">We could not load your syllabus. Try again, or contact your school administrator if the issue continues.</p><button className="btn-secondary mt-3" onClick={() => syllabusQuery.refetch()}>Retry</button></section></main>;
  if (!data || !profile) return null;

  return <main className="mx-auto max-w-6xl space-y-5 p-5 md:p-8">
    <header className="card p-5">
      <Link className="inline-flex items-center font-semibold underline" href="/student">← Back to Student Portal</Link>
      <h1 className="mt-4 text-3xl font-bold">My Syllabus</h1>
      <p className="mt-2">Choose a subject to see its approved chapters, topics, source PDFs and learning links.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <span className="rounded-full bg-slate-100 px-4 py-2"><strong>Board:</strong> {boardName || 'Not assigned'}</span>
        <span className="rounded-full bg-slate-100 px-4 py-2"><strong>Class:</strong> {gradeName || 'Not assigned'}</span>
        <span className="rounded-full bg-slate-100 px-4 py-2"><strong>Academic year:</strong> {academicYear || 'Not set'}</span>
      </div>
      {profile.schoolLinked && !boardCode && <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3" role="status">Your school has not assigned a board yet. The correct syllabus will appear after the school board is set. Please ask your school administrator to update the school profile.</p>}
      {!profile.schoolLinked && <details className="mt-4 rounded-lg border p-4">
        <summary className="cursor-pointer font-semibold">Set my learning board and class</summary>
        <p className="my-3 text-sm">These settings are used when you are not linked to a school.</p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); saveProfile.mutate(); }}>
          <label className="min-w-44 flex-1">Board<select className="input mt-1 w-full" required value={boardChoice} onChange={event => setBoardChoice(event.target.value)}><option value="">Choose board</option>{data.options.boards.map(board => <option key={board.code} value={board.code}>{board.name}</option>)}</select></label>
          <label className="min-w-36 flex-1">Class<select className="input mt-1 w-full" required value={gradeChoice} onChange={event => setGradeChoice(event.target.value)}>{data.options.grades.map(grade => <option key={grade.code} value={grade.code}>{grade.name}</option>)}</select></label>
          <label className="min-w-36 flex-1">Academic year<input className="input mt-1 w-full" required value={yearChoice} onChange={event => setYearChoice(event.target.value)} /></label>
          <button className="btn-primary" disabled={saveProfile.isPending || !boardChoice}>{saveProfile.isPending ? 'Saving…' : 'Save profile'}</button>
        </form>
        {saveProfile.isError && <p className="mt-2 text-red-700" role="alert">Could not save your learning profile. Please retry.</p>}
      </details>}
      <div className="mt-4 flex flex-wrap gap-3">
        <label className="min-w-56 flex-1">Search syllabus or topic<input className="input mt-1 w-full" value={search} onChange={event => setSearch(event.target.value)} placeholder="e.g. photosynthesis" /></label>
        <Link className="btn-secondary self-end" href={'/learn/library?q=' + encodeURIComponent(search) + '&board=' + encodeURIComponent(boardCode) + '&grade=' + encodeURIComponent(gradeCode)}>Search learning content</Link>
      </div>
    </header>

    {selectedSubject ? <section className="card p-5">
      <button className="mb-4 font-semibold underline" type="button" onClick={() => { setSelectedSubjectId(''); setSelectedDocumentId(''); }}>← All subjects</button>
      <h2 className="text-2xl font-bold">{selectedSubject.name}</h2>
      <p className="mt-1">{boardName} · {gradeName} · {academicYear}</p>
      {selectedSubject.topics.length > 0 ? <div className="mt-5 space-y-4">
        {[...new Set(selectedSubject.topics.map(topic => topic.chapter))].map(chapter => <section key={chapter} className="rounded-xl border p-4">
          <h3 className="text-lg font-bold">{chapter}</h3>
          <div className="mt-2 divide-y">{selectedSubject.topics.filter(topic => topic.chapter === chapter).map(topic => <article className="py-3" key={topic.id}>
            <h4 className="font-semibold">{topic.title}</h4>
            {topic.learning_outcome && <p className="mt-1 text-sm">{topic.learning_outcome}</p>}
            {topic.evidence_url && <a className="mt-1 inline-block text-sm underline" href={topic.evidence_url} target="_blank" rel="noopener noreferrer">Official source · {topic.page_reference || 'view document'} ↗</a>}
            <div className="mt-2"><Link className="underline" href={'/learn/library?q=' + encodeURIComponent(topic.title) + '&board=' + encodeURIComponent(boardCode) + '&grade=' + encodeURIComponent(gradeCode)}>Find lessons for this topic →</Link></div>
            {topic.resources?.length ? <ul className="mt-2 list-inside list-disc">{topic.resources.map(resource => <li key={resource.id}>{resource.locked ? <span>🔒 {resource.title} · Subscription required</span> : <Link className="underline" href={'/subjects/resource/' + resource.id}>{resource.title} · {resource.resource_type}{resource.completed ? ' · Completed' : ''}</Link>}</li>)}</ul> : <p className="mt-2 text-sm text-slate-600">Learning content is not available for this topic yet.</p>}
          </article>)}</div>
        </section>)}
      </div> : <p className="mt-4 rounded-lg bg-slate-50 p-4">No verified topic list has been published for this subject yet.</p>}
      <h3 className="mt-6 text-lg font-bold">Source documents</h3>
      {selectedSubject.documents.length ? <ul className="mt-2 divide-y">{selectedSubject.documents.map(doc => <li className="py-3" key={doc.id}>
        <div className="font-semibold">{doc.title} <span className="text-sm font-normal">· {doc.academic_year}</span></div>
        <div className="mt-1 flex flex-wrap gap-4 text-sm"><a className="underline" href={doc.source_url} target="_blank" rel="noopener noreferrer">Open official source ↗</a><button className="underline" type="button" onClick={() => setSelectedDocumentId(doc.id)}>View extracted pages</button></div>
      </li>)}</ul> : <p className="mt-2 text-sm text-slate-600">No approved source PDF is available for this subject yet.</p>}
      {selectedDocumentId && documentQuery.data && <div className="mt-4 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-bold">{documentQuery.data.title}</h4><button className="underline" type="button" onClick={() => setSelectedDocumentId('')}>Close document</button></div>
        {documentQuery.data.downloadUrl ? <a className="mt-2 inline-block underline" href={documentQuery.data.downloadUrl} target="_blank" rel="noopener noreferrer">Download PDF ↗</a> : <p className="mt-2 text-sm">The board source link is available above. VidyaSetu does not redistribute this PDF.</p>}
        <ol className="mt-3 max-h-80 list-inside list-decimal overflow-auto">{documentQuery.data.outline?.slice(0, 100).map((item, index) => <li className="py-1" key={index}>Page {item.page}: {item.text}</li>)}</ol>
      </div>}
    </section> : <>
      {profile.schoolLinked && !boardCode ? <section className="card p-6"><h2 className="text-xl font-bold">Waiting for school board assignment</h2><p className="mt-2">We won’t show another board’s syllabus. Ask the school administrator to set the board in the school profile.</p></section> : <section className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Subjects</h2><p className="mt-1">Select a subject to open its syllabus and source documents.</p></div><span className="text-sm">{data.summary?.totalTopics || 0} approved topics</span></div>
        {documentsQuery.isLoading && <p className="mt-4" role="status">Loading syllabus documents…</p>}
        {documentsQuery.isError && <p className="mt-4 text-red-700" role="alert">Syllabus documents could not be loaded. Try again shortly.</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{subjects.map(subject => <button key={subject.id} type="button" className="card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md" onClick={() => setSelectedSubjectId(subject.id)}>
          <span className="text-lg font-bold">{subject.name}</span>
          <span className="mt-2 block text-sm text-slate-600">{subject.topics.length} verified topics · {subject.documents.length} source documents</span>
          <span className="mt-3 block font-semibold text-orange-700">{subject.topics.length || subject.documents.length ? 'Open syllabus →' : 'Syllabus not published yet →'}</span>
        </button>)}</div>
        {boardWideDocuments.length > 0 && <div className="mt-6 rounded-xl bg-slate-50 p-4"><h3 className="font-bold">Board-wide documents</h3><ul className="mt-2 list-inside list-disc">{boardWideDocuments.map(doc => <li key={doc.id}><a className="underline" href={doc.source_url} target="_blank" rel="noopener noreferrer">{doc.title} · {doc.academic_year} ↗</a></li>)}</ul></div>}
        {data.version && <p className="mt-4 text-sm">Verified syllabus: {data.version.title} · {data.summary?.coveredTopics || 0} subjects/topics with learning materials</p>}
      </section>}
    </>}
  </main>;
}
