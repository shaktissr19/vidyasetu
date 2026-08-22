'use client';

import GroupsHub from '@/components/groups/GroupsHub';
import useAuthStore from '@/store/authStore';

export default function SchoolGroupsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const isTeacher = role === 'TEACHER';
  return (
    <GroupsHub
      title={isTeacher ? 'Teacher & Learning Community' : 'School Education Community'}
      subtitle={isTeacher ? 'Create Teacher circles or moderated Student-Teacher learning communities for your school context' : 'Create moderated school, class, Parent or mixed learning communities with controlled membership'}
      accent="var(--saffron)"
    />
  );
}
