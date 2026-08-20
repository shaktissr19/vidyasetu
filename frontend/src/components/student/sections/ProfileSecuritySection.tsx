'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { getMe, setPassword, updateProfile, type SessionUser } from '@/services/authService';
import useAuthStore from '@/store/authStore';
import { apiErrorText } from '@/utils/errors';
import type { StudentProfile } from '@/types/api';
import type { StudentSectionProps } from '@/types/studentPortal';
import styles from '../StudentPortal.module.css';

type MeProfile = StudentProfile & SessionUser;

export default function ProfileSecuritySection({ student, dashboard, notify, refreshDashboard }: StudentSectionProps) {
  const { updateUser } = useAuthStore();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [form, setForm] = useState({ name: '', username: '', email: '', language: 'hi' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const result = (await getMe()).data.data;
      setMe(result);
      setForm({
        name: result?.name || '',
        username: result?.username || '',
        email: result?.email || '',
        language: result?.language || 'hi',
      });
    } catch (error: unknown) {
      notify(`⚠️ ${apiErrorText(error)}`);
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = (await updateProfile({
        name: form.name.trim(),
        username: form.username.trim().toLowerCase(),
        email: form.email.trim() || null,
        language: form.language,
      })).data.data;
      setMe(prev => ({ ...(prev || updated as MeProfile), ...updated } as MeProfile));
      updateUser(updated);
      await refreshDashboard();
      notify('✅ Profile updated.');
    } catch (error: unknown) {
      notify(`⚠️ ${apiErrorText(error)}`);
    } finally { setSaving(false); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (passwords.newPassword.length < 8 || !/[A-Za-z]/.test(passwords.newPassword) || !/\d/.test(passwords.newPassword)) {
      notify('⚠️ New password needs at least 8 characters, one letter and one number.');
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      notify('⚠️ New passwords do not match.');
      return;
    }
    setPasswordSaving(true);
    try {
      await setPassword(passwords.currentPassword || null, passwords.newPassword);
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      notify('✅ Password changed successfully.');
    } catch (error: unknown) {
      notify(`⚠️ ${apiErrorText(error)}`);
    } finally { setPasswordSaving(false); }
  }

  if (loading) return <div className={styles.loading}>Loading Student account…</div>;

  const dashboardWithSchoolLink = dashboard as (typeof dashboard & { schoolLink?: { parent_linked?: boolean; parent_link_pending?: boolean } }) | undefined;
  const schoolLink = dashboardWithSchoolLink?.schoolLink;

  return (
    <>
      <div className={styles.sectionHeader}>
        <div><h1 className={styles.title}>👤 Profile & Security</h1><div className={styles.subtitle}>Manage your permanent VidyaSetu identity and login credentials.</div></div>
      </div>

      <div className={styles.twoCol}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Student Identity</div>
          <div style={{ fontSize: 13, color: '#5A6278', marginBottom: 4 }}>PERMANENT STUDENT ID</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#0D1B3E', letterSpacing: '.02em' }}>{student?.studentCode || me?.student_code || '—'}</div>
          <div className={styles.muted} style={{ marginTop: 12 }}>Username: <b>{me?.username || student?.username || '—'}</b></div>
          <div className={styles.muted}>Mobile: {me?.mobile || student?.mobile || '—'}</div>
          <div className={styles.muted}>School status: {student?.schoolLinkStatus || me?.school_link_status || 'NOT REQUESTED'}</div>
          <div className={styles.muted}>Class: {student?.classLabel || (me?.grade_level ? `Class ${me.grade_level}` : '—')}</div>
          {schoolLink?.parent_linked && <div style={{ marginTop: 12 }} className={styles.statusResolved}>✅ Parent/Guardian connected</div>}
          {schoolLink?.parent_link_pending && <div style={{ marginTop: 12 }} className={styles.status}>⏳ Parent/Guardian link pending</div>}
        </div>

        <div className={styles.card}>
          <div className={styles.cardTitle}>Edit Profile</div>
          <form onSubmit={saveProfile}>
            <div className={styles.formGroup}><label className={styles.label}>Full Name</label><input className={styles.input} value={form.name} onChange={e => setForm(value => ({ ...value, name: e.target.value }))} /></div>
            <div className={styles.formGroup}><label className={styles.label}>Username</label><input className={styles.input} value={form.username} onChange={e => setForm(value => ({ ...value, username: e.target.value.replace(/\s/g, '').toLowerCase() }))} /></div>
            <div className={styles.formGroup}><label className={styles.label}>Email</label><input type="email" className={styles.input} value={form.email} onChange={e => setForm(value => ({ ...value, email: e.target.value }))} placeholder="Optional email address" /></div>
            <div className={styles.formGroup}><label className={styles.label}>Preferred Language</label><select className={styles.select} value={form.language} onChange={e => setForm(value => ({ ...value, language: e.target.value }))}><option value="hi">Hindi</option><option value="en">English</option><option value="ta">Tamil</option><option value="te">Telugu</option><option value="mr">Marathi</option><option value="bn">Bengali</option><option value="gu">Gujarati</option><option value="kn">Kannada</option><option value="or">Odia</option></select></div>
            <button className={styles.primary} disabled={saving}>{saving ? 'Saving…' : 'Save Profile'}</button>
          </form>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>🔐 Change Password</div>
        <form onSubmit={changePassword} style={{ maxWidth: 560 }}>
          <div className={styles.formGroup}><label className={styles.label}>Current Password</label><input type="password" className={styles.input} value={passwords.currentPassword} onChange={e => setPasswords(value => ({ ...value, currentPassword: e.target.value }))} /></div>
          <div className={styles.twoCol}>
            <div className={styles.formGroup}><label className={styles.label}>New Password</label><input type="password" className={styles.input} value={passwords.newPassword} onChange={e => setPasswords(value => ({ ...value, newPassword: e.target.value }))} placeholder="8+ chars, letter + number" /></div>
            <div className={styles.formGroup}><label className={styles.label}>Confirm New Password</label><input type="password" className={styles.input} value={passwords.confirmPassword} onChange={e => setPasswords(value => ({ ...value, confirmPassword: e.target.value }))} /></div>
          </div>
          <button className={styles.primary} disabled={passwordSaving}>{passwordSaving ? 'Changing…' : 'Change Password'}</button>
        </form>
      </div>
    </>
  );
}
