'use client';

import GroupsHub from '@/components/groups/GroupsHub';
import LearningCommunitiesPanel from '@/components/groups/LearningCommunitiesPanel';

export default function ParentGroupsPage() {
  return (
    <>
      <LearningCommunitiesPanel />
      <GroupsHub
        title="Parent Education Communities"
        subtitle="Connect with parents, teachers or school-linked communities through controlled membership, consent and moderation"
        accent="var(--forest)"
      />
    </>
  );
}
