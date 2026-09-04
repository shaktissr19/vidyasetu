import StudentPortal from '@/components/student/StudentPortal';
import type { StudentSectionId } from '@/types/studentPortal';

export const metadata = {
  title: 'Student Portal | VidyaSetu',
};

const SECTION_IDS = new Set<StudentSectionId>([
  'dashboard',
  'subjects',
  'homework',
  'ai',
  'doubts',
  'exams',
  'groups',
  'attendance',
  'leave',
  'transport',
  'documents',
  'school',
  'report',
  'notifications',
  'offline',
  'profile',
]);

function asSection(value: string | string[] | undefined): StudentSectionId {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && SECTION_IDS.has(raw as StudentSectionId)
    ? raw as StudentSectionId
    : 'dashboard';
}

export default function StudentPage({
  searchParams,
}: {
  searchParams?: { section?: string | string[] };
}) {
  return <StudentPortal initialSection={asSection(searchParams?.section)} />;
}
