'use client';

import GroupsHub from '@/components/groups/GroupsHub';

export default function ParentGroupsPage() {
  return (
    <GroupsHub
      title="Parent Groups"
      subtitle="Create or join private Parent Groups with owner-controlled membership"
      accent="var(--forest)"
    />
  );
}
