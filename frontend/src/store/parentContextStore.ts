import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ParentContextState {
  selectedChildId: string | null;
  setSelectedChildId: (studentId: string) => void;
  clearSelectedChildId: () => void;
}

type PersistedParentContext = Pick<ParentContextState, 'selectedChildId'>;

const useParentContextStore = create<ParentContextState>()(
  persist<ParentContextState, [], [], PersistedParentContext>(
    (set) => ({
      selectedChildId: null,
      setSelectedChildId: (selectedChildId) => set({ selectedChildId }),
      clearSelectedChildId: () => set({ selectedChildId: null }),
    }),
    {
      name: 'vidyasetu-parent-context',
      partialize: (state) => ({ selectedChildId: state.selectedChildId }),
    },
  ),
);

export default useParentContextStore;
