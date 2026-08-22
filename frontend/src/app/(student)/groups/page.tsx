'use client';

import GroupsHub from '@/components/groups/GroupsHub';

export default function StudentGroupsPage() {
  return (
    <GroupsHub
      title="Groups"
      subtitle="Create or join private study Groups with controlled membership"
      accent="var(--forest)"
    />
  );
}
