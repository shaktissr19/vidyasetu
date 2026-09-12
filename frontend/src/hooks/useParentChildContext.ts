'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getChildren } from '@/services/parentService';
import useParentContextStore from '@/store/parentContextStore';

export function useParentChildContext() {
  const selectedChildId = useParentContextStore((state) => state.selectedChildId);
  const setSelectedChildId = useParentContextStore((state) => state.setSelectedChildId);
  const clearSelectedChildId = useParentContextStore((state) => state.clearSelectedChildId);

  const childrenQuery = useQuery({
    queryKey: ['parent-children'],
    queryFn: () => getChildren().then((response) => response.data.data),
  });

  const children = childrenQuery.data || [];

  useEffect(() => {
    if (!childrenQuery.isSuccess) return;
    if (children.length === 0) {
      if (selectedChildId) clearSelectedChildId();
      return;
    }
    const stillLinked = selectedChildId && children.some((child) => child.id === selectedChildId);
    if (!stillLinked) setSelectedChildId(children[0].id);
  }, [children, childrenQuery.isSuccess, selectedChildId, setSelectedChildId, clearSelectedChildId]);

  return {
    children,
    selectedChildId,
    selectedChild: children.find((child) => child.id === selectedChildId) || null,
    setSelectedChildId,
    isLoading: childrenQuery.isLoading,
    isError: childrenQuery.isError,
    refetchChildren: childrenQuery.refetch,
  };
}
