import Link from 'next/link';

export default function PublicPagesAdmin() {
  return <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
    <header className="rounded-2xl bg-[#243B63] p-6 text-white"><p className="text-xs font-black tracking-[.14em] text-orange-300">SUPER ADMIN · PUBLIC WEBSITE</p><h1 className="mt-1 text-2xl font-extrabold">Public page content</h1><p className="mt-2 max-w-3xl text-sm text-blue-100">Edit and publish the public page story. Learning resources, school records, competitions and all account data remain connected to their existing services and access rules.</p></header>
    <section className="grid gap-4 sm:grid-cols-2" aria-label="Public page editors">
      <article className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"><h2 className="text-xl font-extrabold text-slate-900">Home</h2><p className="mt-2 text-sm leading-6 text-slate-600">Manage the platform introduction, audience cards, video and Home story.</p><Link className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#14213D] px-4 font-bold text-white" href="/admin/homepage">Open Home editor</Link></article>
      <article className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"><h2 className="text-xl font-extrabold text-slate-900">Learn</h2><p className="mt-2 text-sm leading-6 text-slate-600">Manage Learn page copy, learning type labels and descriptions, developmental pathways, and calls to action. Published resources and filters remain live from the Learning Library.</p><Link className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#14213D] px-4 font-bold text-white" href="/admin/public-pages/learn">Open Learn editor</Link></article>
    </section>
    <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-slate-700">More public page editors can be added here one page at a time after their editorial fields and live data dependencies are reviewed.</p>
  </div>;
}
