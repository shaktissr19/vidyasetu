import '@/types/api';

declare module '@/types/api' {
  interface ContentItem {
    file_size_kb?: string | number | null;
  }
}

export {};
