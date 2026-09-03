'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  getActiveSessions,
  getMe,
  revokeOtherSessions,
  setPassword,
  updateProfile,
  type ActiveSession,
  type SessionUser,
} from '@/services/authService';
import useAuthStore from '@/store/authStore';
import { apiErrorText } from '@/utils/errors';
import type { StudentProfile } from '@/types/api';
import type { StudentSectionProps } from '@/types/studentPortal';
import styles from '../StudentPortal.module.css';

type MeProfile = StudentProfile & SessionUser;

function sessionDeviceLabel(deviceInfo?: string | null): string {
  const value = String(deviceInfo || '').trim();
  if (!value) return 'Unknown device';

  const os = /Windows/i.test(value) ? 'Windows'
    : /Android/i.test(value) ? 'Android'
      : /iPhone/i.test(value) ? 'iPhone'
        : /iPad/i.test(value) ? 'iPad'
          : /Macintosh|Mac OS/i.test(value) ? 'macOS'
            : /Linux/i.test(value) ? 'Linux'
              : '';
  const browser = /Edg\//i.test(value) ? 'Edge'
    : /Chrome\//i.test(value) ? 'Chrome'
      : /Firefox\//i.test(value) ? 'Firefox'
        : /Safari\//i.test(value) ? 'Safari'
          : '';

  if (os || browser) return [browser, os].filter(Boolean).join(' on ');
  return value.length > 80 ? `${value.slice(0, 77)}…` : value;
}

function sessionTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ProfileSecuritySection({ student, dashboard, notify, refreshDashboard }: StudentSectionProps) {
  const { updateUser, refreshToken } = useAuthStore();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [form, setForm] = useState({ name: '', username: '', email: '', language: 'hi' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  const sessionsQuery = useQuery<ActiveSession[]>({
    queryKey: ['auth-sessions'],
    queryFn: async () => (await getActiveSessions()).data.data || [],
    staleTime: 15_000,
    retry: 1,
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: async () => {
      if (!refreshToken) throw new Error('Current session token is unavailable. Please sign in again.');
      return (await revokeOtherSessions(refreshToken)).data.data;
    },
    onSuccess: async (data) => {
      await sessionsQuery.refetch();
      notify(data.revokedCount
        ? `✅ Signed out ${data.revokedCount} other active session${data.revokedCount === 1 ? '' : 's'}.`
        : '✅ No other active sessions were found.');
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error, 'Could not sign out other devices')}`),
  });

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
  const sessions = sessionsQuery.data || [];

  return (
    <>
      <div className={styles.sectionHeader}>
        <div><h1 className={styles.title}>👤 Profile & Security</h1><div className={styles.subtitle}>Manage your permanent VidyaSetu identity, login credentials and active devices.</div></div>
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

      <div className={styles.card} style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
          <div>
            <div className={styles.cardTitle}>🔐 Active sign-ins</div>
            <div className={styles.muted}>VidyaSetu currently has {sessions.length} active sign-in{sessions.length === 1 ? '' : 's'} for this account.</div>
          </div>
          <button
            className={styles.danger}
            disabled={sessionsQuery.isLoading || sessions.length <= 1 || revokeSessionsMutation.isPending || !refreshToken}
            onClick={() => revokeSessionsMutation.mutate()}
          >
            {revokeSessionsMutation.isPending ? 'Signing out…' : 'Sign out other devices'}
          </button>
        </div>

        {sessionsQuery.isLoading && <div className={styles.loading}>Checking active sign-ins…</div>}
        {sessionsQuery.isError && <div className={styles.error}>{apiErrorText(sessionsQuery.error, 'Could not load active sign-ins')}</div>}
        {!sessionsQuery.isLoading && sessions.map((session) => (
          <div key={session.id} className={styles.contentItem} style={{ marginTop: 10 }}>
            <div className={styles.contentTop}>
              <strong>{sessionDeviceLabel(session.deviceInfo)}</strong>
              <span className={styles.statusResolved}>Active</span>
            </div>
            <div className={styles.contentMeta}>IP: {session.ipAddress || 'Unavailable'}</div>
            <div className={styles.contentMeta}>Signed in: {sessionTime(session.createdAt)} · Refresh access expires: {sessionTime(session.expiresAt)}</div>
          </div>
        ))}
        {!sessionsQuery.isLoading && !sessions.length && !sessionsQuery.isError && <div className={styles.empty}>No active refresh sessions were returned.</div>}
        <div className={styles.muted} style={{ marginTop: 12, fontSize: 12 }}>
          “Sign out other devices” preserves this browser and immediately revokes refresh access elsewhere. A device may retain its already-issued short-lived access token until that token naturally expires.
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
