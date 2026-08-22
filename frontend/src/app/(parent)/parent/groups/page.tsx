'use client';

import GroupsWorkspace from '@/components/groups/GroupsWorkspace';

export default function ParentGroupsPage() {
  return (
    <GroupsWorkspace
      title="Parent Groups"
      subtitle="Create or join private Parent Groups with owner-controlled membership"
      accent="var(--forest)"
    />
  );
}
