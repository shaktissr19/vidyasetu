'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getPublicModulePage, getPublicLearnPage } from '@/services/publicPageContentService';
import { getPublicCompetitions, getPublicLearningOverview, getPublicLearningResources, getPublicOverview, getPublicSchools } from '@/services/publicService';
import { getPublicHomepage } from '@/services/homepageService';

const rolePages = ['students', 'schools', 'parents', 'communities', 'platform-admin'] as const;
type Check = { name: string; endpoint: string; ok: boolean; note?: string };

async function publicSiteChecks(): Promise<Check[]> {
  const run = async (name: string, endpoint: string, request: () => Promise<unknown>): Promise<Check> => {
    try { await request(); return { name, endpoint, ok: true }; }
    catch (error) { return { name, endpoint, ok: false, note: error instanceof Error ? error.message.slice(0, 160) : 'Request failed' }; }
  };
  return Promise.all([
    run('Home page copy', 'GET /public/homepage', getPublicHomepage),
    run('Learn page copy', 'GET /public/pages/learn', getPublicLearnPage),
    ...rolePages.map((slug) => run(`${slug} page copy`, `GET /public/pages/modules/${slug}`, () => getPublicModulePage(slug))),
    run('Platform overview', 'GET /public/overview', getPublicOverview),
    run('Learning catalogue metadata', 'GET /public/learning/overview', getPublicLearningOverview),
    run('Published learning resources', 'GET /public/learning/resources', () => getPublicLearningResources({ limit: 1 })),
    run('School directory', 'GET /public/schools', getPublicSchools),
    run('Competitions', 'GET /competition', getPublicCompetitions),
  ]);
}

function PublicWebsiteHealth() {
  const query = useQuery({ queryKey: ['public-website-health'], queryFn: publicSiteChecks, staleTime: 60_000, retry: 0 });
  const failures = query.data?.filter((item) => !item.ok) || [];
  return <section aria-labelledby="public-health-title" className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="public-health-title" className="text-lg font-extrabold text-slate-900">Public page integration check</h2><p className="mt-1 text-sm text-slate-600">Checks published editorial content and the public data APIs used by the page sections. No private account data is requested.</p></div><button type="button" className="min-h-10 rounded-lg border border-slate-400 bg-white px-3 font-bold text-[#14213D]" onClick={() => void query.refetch()} disabled={query.isFetching}>{query.isFetching ? 'Checking…' : 'Run checks'}</button></div>
    {query.isPending ? <p className="mt-4 text-sm text-slate-700" role="status">Checking public endpoints…</p> : query.isError ? <p className="mt-4 text-sm text-red-900" role="alert">The integration check could not run. Check administrator sign-in and try again.</p> : <>
      <p className={`mt-4 rounded-lg p-3 text-sm font-bold ${failures.length ? 'border border-amber-300 bg-amber-50 text-amber-950' : 'border border-green-300 bg-green-50 text-green-900'}`} role="status">{failures.length ? `${failures.length} of ${query.data?.length} checks failed. Public pages may show fallback copy or an unavailable-data message.` : `All ${query.data?.length} checks passed.`}{query.dataUpdatedAt ? ` Last checked ${new Date(query.dataUpdatedAt).toLocaleString('en-IN')}.` : ''}</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{query.data?.map((check) => <li key={check.endpoint} className={`rounded-lg border p-3 text-sm ${check.ok ? 'border-slate-200 bg-slate-50' : 'border-red-200 bg-red-50'}`}><div className="flex justify-between gap-3"><strong className="text-slate-900">{check.name}</strong><span className={check.ok ? 'font-bold text-green-800' : 'font-bold text-red-800'}>{check.ok ? 'Available' : 'Failed'}</span></div><code className="mt-1 block break-all text-xs text-slate-600">{check.endpoint}</code>{check.note && <p className="mt-1 break-words text-xs text-red-900">{check.note}</p>}</li>)}</ul>
    </>}
  </section>;
}

export default function PublicPagesAdmin() {
  return <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
    <header className="public-editor-banner rounded-2xl p-6"><p className="public-editor-eyebrow text-xs font-black tracking-[.14em]">SUPER ADMIN · PUBLIC WEBSITE</p><h1 className="mt-1 text-2xl font-extrabold">Public page content</h1><p className="public-editor-muted mt-2 max-w-3xl text-sm">Edit and publish the public page story. Learning resources, school records, competitions and all account data remain connected to their existing services and access rules.</p></header>
    <section className="grid gap-4 sm:grid-cols-2" aria-label="Public page editors">
      <article className="public-editor-card rounded-2xl border border-slate-300 p-5 shadow-sm"><h2 className="text-xl font-extrabold text-slate-900">Home</h2><p className="mt-2 text-sm leading-6 text-slate-600">Manage the platform introduction, audience cards, video and Home story.</p><Link className="public-editor-action mt-4 inline-flex min-h-11 items-center rounded-lg px-4 font-bold" href="/admin/homepage">Open Home editor</Link></article>
      <article className="public-editor-card rounded-2xl border border-slate-300 p-5 shadow-sm"><h2 className="text-xl font-extrabold text-slate-900">Learn</h2><p className="mt-2 text-sm leading-6 text-slate-600">Manage Learn page copy, learning type labels and descriptions, developmental pathways, and calls to action. Published resources and filters remain live from the Learning Library.</p><Link className="public-editor-action mt-4 inline-flex min-h-11 items-center rounded-lg px-4 font-bold" href="/admin/public-pages/learn">Open Learn editor</Link></article>
      {[
        ['Students', '/for-students'], ['Schools & Teachers', '/for-schools'], ['Parents', '/for-parents'],
        ['Communities', '/communities'], ['Platform Admin', '/platform-admin'],
      ].map(([title, href]) => <article key={href} className="public-editor-card rounded-2xl border border-slate-300 p-5 shadow-sm"><h2 className="text-xl font-extrabold text-slate-900">{title === 'Platform Admin' ? 'Platform Admin public page' : title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">Edit the introduction, capability cards, journey cards, proof cards and sign-in calls to action directly on this public page.</p><Link className="public-editor-action mt-4 inline-flex min-h-11 items-center rounded-lg px-4 font-bold" href={href}>Open public page editor</Link></article>)}
      <article className="public-editor-card rounded-2xl border border-slate-300 p-5 shadow-sm"><h2 className="text-xl font-extrabold text-slate-900">Competitions</h2><p className="mt-2 text-sm leading-6 text-slate-600">Competition cards are live records from the competitions service. Create and manage them in the competition admin workspace.</p><Link className="public-editor-action mt-4 inline-flex min-h-11 items-center rounded-lg px-4 font-bold" href="/admin/competitions">Manage competitions</Link><Link className="ml-2 mt-4 inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 font-bold text-[#14213D]" href="/competition">View public page</Link></article>
    </section>
    <PublicWebsiteHealth />
    <aside className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950" aria-labelledby="public-copy-review-title">
      <h2 id="public-copy-review-title" className="font-extrabold">Editorial accuracy review</h2>
      <p className="mt-1">The integration check confirms that public APIs respond; it cannot verify the truth of editorial or hard-coded claims. Before publishing, compare factual statements, dates, eligibility rules and outcome claims with their current approved sources. Live school, competition, learning and platform figures continue to come from their APIs.</p>
    </aside>
    <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-slate-700">Only the Super Admin can edit and publish public page content. Published changes are served by the public API and appear without a code deployment; code or layout changes still require deployment. Learning catalogue records, live statistics, school directory data, and competition schedules stay connected to their existing services.</p>
  </div>;
}
