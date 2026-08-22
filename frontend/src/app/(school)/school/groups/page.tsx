'use client';

import GroupsHub from '@/components/groups/GroupsHub';
import useAuthStore from '@/store/authStore';

export default function SchoolGroupsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const isTeacher = role === 'TEACHER';
  return (
    <GroupsHub
      title={isTeacher ? 'Teacher & Class Communities' : 'School Education Communities'}
      subtitle={isTeacher
        ? 'Create Teacher, class or approved Teacher–Student Communities with controlled membership and moderation'
        : 'Create moderated School, Parent, Teacher or mixed Communities for constructive school collaboration'}
      accent="var(--saffron)"
    />
  );
}
