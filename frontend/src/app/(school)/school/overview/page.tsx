'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getOverview, sendFeeReminders } from '@/services/schoolService';
import { StatCard, CardSkeleton, ProgressBar, SectionHeader } from '@/components/ui/index';
import { schoolGradeLabel } from '@/lib/schoolGrades';
import { formatCurrency } from '@/utils/formatters';
import { apiErrorText } from '@/utils/errors';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

interface TeacherOverviewExtras {
  teacher?: { id: string; name?: string | null; employee_id?: string | null; designation?: string | null };
  assignments?: Array<{ class_id: string; class_name: string; section?: string | null; subject_code: string; subject_name?: string | null; is_class_teacher?: boolean }>;
  workload?: { homeworkActive?: number; submissionsToReview?: number; interventionsOpen?: number };
  todaySchedule?: Array<{ id: string; class_name: string; section?: string | null; period_number: number; start_time: string; end_time: string; subject?: string | null; subject_code?: string | null; room_number?: string | null }>;
}

export default function SchoolOverview() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { t, lang } = useLanguageStore();
  const canAdmin = Boolean(user?.role && ['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(user.role));

  const { data: overview, isLoading, isError, error } = useQuery({
    queryKey: ['school-overview'],
    queryFn: () => getOverview().then((r) => r.data.data),
  });

  const reminderMut = useMutation({
    mutationFn: sendFeeReminders,
    onSuccess: async (res) => {
      toast.success(`Fee reminder sent to ${res.data.data.sent || 0} parent(s)`);
      await qc.invalidateQueries({ queryKey: ['school-overview'] });
    },
    onError: (failure: unknown) => toast.error(apiErrorText(failure)),
  });

  if (isLoading) return <div><div className="skeleton h-8 w-64 mb-6 rounded" /><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">{[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}</div></div>;
  if (isError) return <div className="card" style={{ color: '#C62828' }}>{apiErrorText(error)}</div>;
  if (!overview) return null;

  const teacherOverview = overview as typeof overview & TeacherOverviewExtras;
  const { school, stats, feeStats: fee, classSummary: classes, announcements, onboarding } = overview;
  const teacherAssignments = teacherOverview.assignments || [];
  const assignedSubjects = new Set(teacherAssignments.map((assignment) => assignment.subject_code)).size;
  const workload = teacherOverview.workload || {};
  const todaySchedule = teacherOverview.todaySchedule || [];
  const adminQuickLinks: Array<[string, string, string, string | number]> = [
    ['/school/enrollments', '✅', 'Enrollment Requests', stats.pending_enrollment_requests || 0],
    ['/school/students', '👨‍🎓', 'Student Roster', stats.total_students || 0],
    ['/school/learning-insights', '🧭', 'Learning Insights', 'Open'],
    ['/school/academic-workspace', '🎯', 'Academic Workspace', 'Open'],
    ['/school/classes', '🏷️', 'Classes & Sections', stats.total_classes || 0],
    ['/school/exams', '📝', 'School Exams', stats.upcoming_exams || 0],
  ];
  const teacherQuickLinks: Array<[string, string, string, string | number]> = [
    ['/school/academic-workspace', '🎯', 'Academic Workspace', workload.interventionsOpen || 'Open'],
    ['/school/learning-insights', '🧭', 'Learning Insights', 'Open'],
    ['/school/attendance', '📅', 'Student Attendance', 'Mark'],
    ['/school/homework', '📚', 'Homework to Review', workload.submissionsToReview || 0],
  ];
  const quickLinks = canAdmin ? adminQuickLinks : teacherQuickLinks;

  return (
    <div className="animate-fade-up">
      <SectionHeader title={canAdmin ? `🏫 ${school.name || 'School Dashboard'}` : `👩‍🏫 ${teacherOverview.teacher?.name || t('शिक्षक डैशबोर्ड', 'Teacher Dashboard')}`} sub={canAdmin ? `UDISE: ${school.udise_code || '—'} · ${school.academic_year || '—'} · ${school.district || ''}${school.state ? `, ${school.state}` : ''}` : `${school.name || ''} · ${school.academic_year || '—'} · ${teacherAssignments.length} class-subject assignment${teacherAssignments.length === 1 ? '' : 's'}`}>
        {canAdmin ? <button className="btn-primary" onClick={() => router.push('/school/announcements')}>📢 {t('घोषणा भेजें', 'New Announcement')}</button> : <button className="btn-primary" onClick={() => router.push('/school/academic-workspace')}>🎯 {t('अकादमिक कार्यक्षेत्र', 'Academic Workspace')}</button>}
      </SectionHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 stagger">
        <StatCard label={canAdmin ? t('कुल छात्र', 'Total Students') : t('असाइन किए गए छात्र', 'Assigned Students')} value={Number(stats.total_students || 0).toLocaleString()} sub={canAdmin ? `${stats.pending_enrollment_requests || 0} pending enrollment` : t('आपकी कक्षाओं में सक्रिय', 'active in your classes')} accent="var(--saffron)" />
        <StatCard label={t('आज उपस्थिति', 'Today Attendance')} value={`${Number(stats.today_attendance || 0)}%`} sub={`${stats.attended_today || 0}/${stats.attendance_denominator || 0} marked present`} accent="var(--forest)" />
        {canAdmin ? <StatCard label={t('फीस संग्रह', 'Fees Collected')} value={formatCurrency(fee.collected || 0)} sub={`${fee.pending_count || 0} pending invoice(s)`} accent="var(--navy)" /> : <StatCard label={t('असाइन की गई कक्षाएँ', 'Assigned Classes')} value={stats.total_classes || 0} sub={t('आपकी सक्रिय कक्षाएँ / सेक्शन', 'your active classes / sections')} accent="var(--navy)" />}
        {canAdmin ? <StatCard label={t('शिक्षक', 'Teachers')} value={stats.total_teachers || 0} sub={`${stats.total_classes || 0} active classes`} accent="var(--gold)" /> : <StatCard label={t('असाइन किए गए विषय', 'Assigned Subjects')} value={assignedSubjects} sub={`${teacherAssignments.length} ${t('कक्षा-विषय असाइनमेंट', 'class-subject assignments')}`} accent="var(--gold)" />}
      </div>

      <div className={`grid grid-cols-2 ${canAdmin ? 'lg:grid-cols-6' : 'md:grid-cols-4'} gap-3 mb-6`}>
        {quickLinks.map(([href, icon, label, value]) => <button key={href} onClick={() => router.push(href)} className="card text-left p-4 transition-all hover:-translate-y-0.5"><div className="text-xl mb-1">{icon}</div><div className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>{value}</div><div className="text-xs" style={{ color: 'var(--slate)' }}>{label}</div></button>)}
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-5">
        <div className="card">
          <div className="flex items-center justify-between mb-4"><h3 className="font-display font-bold text-base" style={{ color: 'var(--navy)' }}>📅 {canAdmin ? t('कक्षावार उपस्थिति', 'Class-wise Attendance Today') : t('मेरी कक्षाओं की उपस्थिति', 'My Classes Attendance Today')}</h3><button className="text-xs font-bold" style={{ color: 'var(--saffron)' }} onClick={() => router.push('/school/attendance')}>Open Attendance →</button></div>
          {classes.length === 0 ? <p className="text-sm" style={{ color: 'var(--slate)' }}>{canAdmin ? 'No active classes found.' : 'No active class assignment found.'}</p> : <div className="space-y-3">{classes.map((cls) => { const total = Number(cls.total || 0); const present = Number(cls.present || 0); const pct = total > 0 ? Math.round((present / total) * 100) : 0; return <div key={cls.id}><div className="flex justify-between text-sm mb-1"><span className="font-semibold" style={{ color: 'var(--navy)' }}>{schoolGradeLabel(cls.class_name, lang)}{cls.section ? `-${cls.section}` : ''}</span><span style={{ color: pct >= 85 ? 'var(--forest)' : 'var(--saffron)' }}>{present}/{total} ({pct}%)</span></div><ProgressBar pct={pct} color={pct >= 85 ? 'var(--forest)' : 'var(--saffron)'} height={6} showPct={false} /></div>; })}</div>}
        </div>

        {canAdmin ? <div className="card">
          <div className="flex items-center justify-between mb-4"><h3 className="font-display font-bold text-base" style={{ color: 'var(--navy)' }}>💰 {t('फीस स्थिति', 'Fee Status')}</h3><button className="text-xs font-bold" style={{ color: 'var(--saffron)' }} onClick={() => router.push('/school/fees')}>Manage Fees →</button></div>
          <div className="space-y-3"><div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--forest-pale)' }}><span className="font-semibold text-sm">✅ {t('भुगतान', 'Paid')}</span><span className="font-display font-extrabold text-lg" style={{ color: 'var(--forest)' }}>{fee.paid_count || 0}</span></div><div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--saffron-pale)' }}><span className="font-semibold text-sm">⏳ {t('लंबित', 'Pending')}</span><span className="font-display font-extrabold text-lg" style={{ color: 'var(--saffron)' }}>{fee.pending_count || 0}</span></div><button className="btn-primary w-full justify-center mt-2" disabled={reminderMut.isPending} onClick={() => reminderMut.mutate()}>{reminderMut.isPending ? 'Sending…' : `📲 ${t('रिमाइंडर भेजें', 'Send Fee Reminders')}`}</button></div>
        </div> : <div className="card" style={{ borderLeft: '4px solid var(--saffron)' }}>
          <h3 className="font-display font-bold text-base" style={{ color: 'var(--navy)' }}>🎯 {t('आज का शिक्षक कार्यभार', 'Teacher Action Queue')}</h3>
          <p className="text-sm mt-2" style={{ color: 'var(--slate)' }}>{t('अपनी असाइन की गई कक्षाओं में होमवर्क समीक्षा और विद्यार्थी सहायता को प्राथमिकता दें।', 'Prioritize homework review and Student support within your assigned classes.')}</p>
          <div className="grid grid-cols-3 gap-2 mt-4"><button className="p-3 rounded-xl text-center" style={{ background: '#F7F8FA' }} onClick={() => router.push('/school/homework')}><div className="font-display font-extrabold" style={{ color: 'var(--navy)' }}>{workload.homeworkActive || 0}</div><div className="text-[11px]" style={{ color: 'var(--slate)' }}>Active homework</div></button><button className="p-3 rounded-xl text-center" style={{ background: '#F7F8FA' }} onClick={() => router.push('/school/homework')}><div className="font-display font-extrabold" style={{ color: 'var(--saffron)' }}>{workload.submissionsToReview || 0}</div><div className="text-[11px]" style={{ color: 'var(--slate)' }}>To review</div></button><button className="p-3 rounded-xl text-center" style={{ background: '#F7F8FA' }} onClick={() => router.push('/school/academic-workspace')}><div className="font-display font-extrabold" style={{ color: 'var(--forest)' }}>{workload.interventionsOpen || 0}</div><div className="text-[11px]" style={{ color: 'var(--slate)' }}>Open support</div></button></div>
          <div className="grid grid-cols-2 gap-2 mt-4"><button className="btn-primary justify-center" onClick={() => router.push('/school/learning-insights')}>🧭 Insights</button><button className="btn-outline justify-center" onClick={() => router.push('/school/academic-workspace')}>🎯 Workspace</button></div>
        </div>}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="card"><div className="flex items-center justify-between mb-3"><h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>📢 Recent Announcements</h3><button className="text-xs font-bold" style={{ color: 'var(--saffron)' }} onClick={() => router.push('/school/announcements')}>View all →</button></div>{announcements.length === 0 ? <p className="text-sm" style={{ color: 'var(--slate)' }}>No announcements yet.</p> : announcements.map((announcement) => <div key={announcement.id} className="py-2" style={{ borderBottom: '1px solid var(--border)' }}><div className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{announcement.title}</div><div className="text-xs" style={{ color: 'var(--slate)' }}>{new Date(announcement.published_at).toLocaleString('en-IN')}</div></div>)}</div>
        {canAdmin ? <div className="card"><div className="flex items-center justify-between mb-3"><h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>🚀 Setup Readiness</h3><span className="font-bold" style={{ color: onboarding.isComplete ? 'var(--forest)' : 'var(--saffron)' }}>{onboarding.completed || 0}/{onboarding.total || 5}</span></div><div className="space-y-2">{Object.entries(onboarding.checks || {}).map(([key, done]) => <div key={key} className="flex justify-between text-sm"><span className="capitalize">{key}</span><span style={{ color: done ? 'var(--forest)' : 'var(--saffron)', fontWeight: 700 }}>{done ? '✓ Ready' : '○ Pending'}</span></div>)}</div>{!onboarding.isComplete && <button className="btn-outline w-full justify-center mt-4" onClick={() => router.push('/school/profile')}>Complete School Setup</button>}</div> : <div className="card"><div className="flex items-center justify-between mb-3"><h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>🕘 {t('आज की कक्षाएँ', "Today's Teaching")}</h3><button className="text-xs font-bold" style={{ color: 'var(--saffron)' }} onClick={() => router.push('/school/timetable')}>Timetable →</button></div>{todaySchedule.length === 0 ? <p className="text-sm" style={{ color: 'var(--slate)' }}>{t('आज के लिए कोई शिक्षण पीरियड नहीं मिला।', 'No teaching period found for today.')}</p> : <div className="space-y-2">{todaySchedule.map((period) => <div key={period.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#F7F8FA' }}><div className="w-10 h-10 rounded-xl grid place-items-center font-display font-extrabold" style={{ background: 'var(--saffron-pale)', color: 'var(--saffron)' }}>{period.period_number}</div><div className="flex-1"><div className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{period.subject || period.subject_code || 'Subject'} · Class {period.class_name}{period.section ? `-${period.section}` : ''}</div><div className="text-xs" style={{ color: 'var(--slate)' }}>{String(period.start_time).slice(0, 5)}–{String(period.end_time).slice(0, 5)}{period.room_number ? ` · Room ${period.room_number}` : ''}</div></div></div>)}</div>}</div>}
      </div>
    </div>
  );
}
