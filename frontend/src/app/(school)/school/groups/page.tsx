'use client';

import GroupsWorkspace from '@/components/groups/GroupsWorkspace';
import useAuthStore from '@/store/authStore';

export default function SchoolGroupsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const isTeacher = role === 'TEACHER';
  return (
    <GroupsWorkspace
      title={isTeacher ? 'Teacher & Class Groups' : 'School Groups'}
      subtitle={isTeacher ? 'Create Teacher or moderated mixed Groups for your classes' : 'Create moderated mixed Groups for your School community'}
      accent="var(--saffron)"
    />
  );
}
