'use client';
import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPlatformAdmin } from '@/services/adminService';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';
import { PLATFORM_ADMIN_CAPABILITIES, PLATFORM_ADMIN_CAPABILITY_LABELS, type PlatformAdminCapability } from '@/services/platformAdminService';

const empty = { name: '', username: '', mobile: '', email: '', password: '', confirmPassword: '', permissions: [] as PlatformAdminCapability[] };
export default function CreatePlatformAdmin() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const create = useMutation({
    mutationFn: () => createPlatformAdmin({ name: form.name.trim(), username: form.username.trim(), mobile: form.mobile, email: form.email.trim() || undefined, password: form.password, permissions: form.permissions }),
    onSuccess: async () => {
      setForm(empty); setOpen(false); toast.success('Platform Admin account created. Share credentials securely.');
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin-users'] }), qc.invalidateQueries({ queryKey: ['admin-analytics'] }), qc.invalidateQueries({ queryKey: ['platform-admin-access'] })]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create Platform Admin')),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (form.password !== form.confirmPassword) return toast.error('Passwords do not match');
    if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) return toast.error('Password must contain a letter and a number');
    create.mutate();
  }
  return <section className="card mb-5">
    <button type="button" className="btn-primary" onClick={() => { setForm(empty); setOpen(!open); }}>Create Platform Admin</button>
    <p className="text-sm mt-3" style={{ color: 'var(--slate)' }}>Only the Super Admin can create or suspend platform administrator accounts. School and Teacher applications use their separate approval workflows.</p>
    {open && <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3 mt-4">
      <label>Full name<input className="input" required minLength={2} maxLength={120} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label>Username<input className="input" required minLength={3} maxLength={60} pattern="[A-Za-z0-9._-]+" autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
      <label>Mobile<input className="input" required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} autoComplete="tel" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '') })} /></label>
      <label>Email (optional)<input className="input" type="email" maxLength={180} autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
      <label>Password<input className="input" type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
      <label>Confirm password<input className="input" type="password" required autoComplete="new-password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} /></label>
      <fieldset className="sm:col-span-2 rounded-xl border border-slate-300 p-3"><legend className="px-1 text-sm font-extrabold">Operational access</legend><p className="mb-3 text-xs leading-5" style={{ color: 'var(--slate)' }}>Analytics is the default dashboard. Grant only the work areas this administrator needs. Revenue, settings, audit, admin management, public publishing and content editing stay Super Admin-only.</p><div className="grid gap-2 sm:grid-cols-2">{PLATFORM_ADMIN_CAPABILITIES.map((permission) => { const meta = PLATFORM_ADMIN_CAPABILITY_LABELS[permission]; const checked = form.permissions.includes(permission); return <label key={permission} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><input type="checkbox" checked={checked} onChange={() => setForm({ ...form, permissions: checked ? form.permissions.filter((item) => item !== permission) : [...form.permissions, permission] })} /><span><strong>{meta.title}</strong><small className="mt-0.5 block leading-5 text-slate-600">{meta.description}</small></span></label>; })}</div></fieldset>
      <button type="submit" className="btn-primary sm:col-span-2" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create Admin Account'}</button>
    </form>}
  </section>;
}
