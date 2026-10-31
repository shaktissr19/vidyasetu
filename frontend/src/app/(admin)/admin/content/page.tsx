'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, FileText, Languages, Video } from 'lucide-react';
import { getContentAnalytics } from '@/services/adminService';
import { SectionHeader, TableSkeleton } from '@/components/ui/index';

function displayCount(value: number | string | null | undefined): string {
  return value == null ? '—' : Number(value).toLocaleString('en-IN');
}

export default function AdminContentAnalyticsPage() {
  const query = useQuery({
    queryKey: ['admin-content-analytics'],
    queryFn: () => getContentAnalytics().then((response) => response.data.data),
    staleTime: 30_000,
    retry: 1,
  });
  const data = query.data;
  const metrics = [
    { label: 'Published resources', value: displayCount(data?.publishedItems), icon: BookOpen },
    { label: 'Published videos', value: displayCount(data?.videos), icon: Video },
    { label: 'Published documents', value: displayCount(data?.documents), icon: FileText },
    { label: 'Languages', value: displayCount(data?.languages), icon: Languages },
  ];

  return <div className="animate-fade-up">
    <SectionHeader title="📈 Content analytics" sub="Read-only catalogue metrics. Editing and publishing remain in the Super Admin content workspace." />
    {query.isError ? <div role="alert" className="card-navy p-5 text-white"><strong>Content analytics could not be loaded.</strong><p className="mt-1 text-sm text-blue-100">Check your access or try again.</p><button type="button" className="btn-primary mt-3" onClick={() => query.refetch()}>Try again</button></div> : <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon }) => <article key={label} className="card-navy flex min-h-28 items-center gap-4 p-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-orange-300"><Icon aria-hidden="true" size={23} /></span><div><p className="text-2xl font-extrabold text-white">{query.isPending ? '…' : value}</p><p className="mt-1 text-sm text-blue-100">{label}</p></div></article>)}
      </div>
      {data?.draftItems != null && <p className="mb-4 rounded-xl border border-orange-300/30 bg-orange-50 p-3 text-sm font-semibold text-slate-800">Draft content is visible only to the Super Admin: {displayCount(data.draftItems)} draft items.</p>}
      <section className="card-navy mb-5 p-4 sm:p-5" aria-labelledby="content-subject-breakdown"><h2 id="content-subject-breakdown" className="mb-3 text-lg font-extrabold text-white">Published catalogue by subject</h2>{query.isPending ? <TableSkeleton rows={5} cols={5} /> : <div className="overflow-x-auto"><table className="tbl min-w-[620px] text-left text-sm text-blue-50"><thead><tr>{['Subject','Videos','Documents','Questions','Languages'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{(data?.bySubject || []).map((row) => <tr key={row.subject_id}><td className="font-semibold text-white">{row.subject_name}</td><td>{displayCount(row.videos)}</td><td>{displayCount(row.documents)}</td><td>{displayCount(row.quiz_questions)}</td><td>{displayCount(row.languages)}</td></tr>)}</tbody></table>{!data?.bySubject.length && <p className="py-5 text-sm text-blue-100">No published catalogue records yet.</p>}</div>}</section>
      <section className="card-navy p-4 sm:p-5" aria-labelledby="content-recent-published"><h2 id="content-recent-published" className="mb-3 text-lg font-extrabold text-white">Recent catalogue items</h2>{query.isPending ? <TableSkeleton rows={5} cols={4} /> : <div className="overflow-x-auto"><table className="tbl min-w-[620px] text-left text-sm text-blue-50"><thead><tr>{['Title','Subject','Type','Status'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{(data?.recentItems || []).map((item) => <tr key={item.id}><td className="font-semibold text-white">{item.title}</td><td>{item.subject_name}</td><td>{item.type}</td><td>{item.status}</td></tr>)}</tbody></table>{!data?.recentItems.length && <p className="py-5 text-sm text-blue-100">No catalogue items to show.</p>}</div>}</section>
    </>}
  </div>;
}
