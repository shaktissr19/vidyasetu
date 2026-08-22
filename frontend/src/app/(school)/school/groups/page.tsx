'use client';

import GroupsHub from '@/components/groups/GroupsHub';
import useAuthStore from '@/store/authStore';

export default function SchoolGroupsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const isTeacher = role === 'TEACHER';
  return (
    <GroupsHub
      title={isTeacher ? 'Teacher & Class Groups' : 'School Groups'}
      subtitle={isTeacher ? 'Create Teacher or moderated mixed Groups for your classes' : 'Create moderated mixed Groups for your School community'}
      accent="var(--saffron)"
    />
  );
}
