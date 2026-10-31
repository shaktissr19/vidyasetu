import api from './api';
import type { ApiEnvelope } from '@/types/api';

export type HomepageIcon = 'graduation' | 'school' | 'family' | 'book' | 'trophy' | 'link' | 'shield' | 'india' | 'progress' | 'device';
export type HomepageTone = 'orange' | 'green' | 'violet' | 'blue' | 'rose' | 'teal';
export interface HomepageCard { title: string; copy: string; icon: HomepageIcon; tone?: HomepageTone; }
export interface HomepageContent {
  hero: { eyebrow: string; title: string; description: string };
  benefits: HomepageCard[];
  modules: Array<HomepageCard & { href: string; imageUrl: string }>;
  video: { title: string; description: string; videoUrl: string; posterUrl: string; captionsUrl: string; captionsLanguage: string; transcript: string };
  journey: Array<HomepageCard & { step: string }>;
  trust: HomepageCard[];
  finalCta: { eyebrow: string; title: string; copy: string };
}
export interface AdminHomepageContent {
  published: HomepageContent;
  draft: HomepageContent | null;
  updatedAt: string | null;
  publishedAt: string | null;
  version: number;
}

export const getPublicHomepage = () => api.get<ApiEnvelope<HomepageContent>>('/public/homepage');
export const getAdminHomepage = () => api.get<ApiEnvelope<AdminHomepageContent>>('/admin/homepage');
export const saveHomepageDraft = (content: HomepageContent) => api.put<ApiEnvelope<{ saved: boolean; version: number }>>('/admin/homepage/draft', content);
export const publishHomepageDraft = () => api.post<ApiEnvelope<{ published: boolean; publishedAt: string; version: number }>>('/admin/homepage/publish');
