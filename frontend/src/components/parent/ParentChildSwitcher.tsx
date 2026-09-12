'use client';

import type { ParentChild } from '@/services/parentService';
import useLanguageStore from '@/store/languageStore';

interface Props {
  children: ParentChild[];
  selectedChildId: string | null;
  onSelect: (studentId: string) => void;
  className?: string;
}

export default function ParentChildSwitcher({ children, selectedChildId, onSelect, className = '' }: Props) {
  const { t } = useLanguageStore();
  if (!children.length) return null;

  return (
    <div className={`flex gap-2 flex-wrap ${className}`} aria-label={t('बच्चा चुनें', 'Select child')}>
      {children.map((child) => {
        const active = selectedChildId === child.id;
        return (
          <button
            key={child.id}
            type="button"
            onClick={() => onSelect(child.id)}
            aria-pressed={active}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
            style={{
              background: active ? 'var(--forest)' : 'white',
              color: active ? 'white' : 'var(--slate)',
              border: `1.5px solid ${active ? 'var(--forest)' : 'var(--border)'}`,
            }}
          >
            👤 {child.name.split(' ')[0]} ({t('कक्षा', 'Class')} {child.class_name})
          </button>
        );
      })}
    </div>
  );
}
