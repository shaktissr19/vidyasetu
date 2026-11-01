import api from './api';
import type { ApiEnvelope } from '@/types/api';

export type HomepageIcon = 'graduation' | 'school' | 'family' | 'book' | 'trophy' | 'link' | 'shield' | 'india' | 'progress' | 'device';
export type HomepageTone = 'orange' | 'green' | 'violet' | 'blue' | 'rose' | 'teal';
export interface HomepageCard { title: string; copy: string; icon: HomepageIcon; tone?: HomepageTone; }
export interface HomepageContent {
  hero: { eyebrow: string; title: string; description: string };
  benefits: HomepageCard[];
  modules: Array<HomepageCard & { href: string; imageUrl: string }>;
  video: { title: string; description: string; videoUrl: string; posterUrl: string; captionsUrl: string; captionsLanguage: string; transcript: string; hindiTitle?: string; hindiDescription?: string; hindiCaptionsUrl?: string; hindiTranscript?: string };
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
export interface PublicContentRevision { version: number; published_at: string; published_by_name: string | null; }
export const getHomepageHistory = () => api.get<ApiEnvelope<PublicContentRevision[]>>('/admin/homepage/history');
export const restoreHomepageVersion = (version: number) => api.post<ApiEnvelope<{ restored: boolean; sourceVersion: number; stagedAsDraft: boolean }>>('/admin/homepage/restore', { version });
export async function uploadHomepageVideo(file: File): Promise<{ videoUrl: string }> {
  const types = new Set(['video/mp4', 'video/webm', 'video/ogg']);
  if (!types.has(file.type)) throw new Error('Choose an MP4, WebM or Ogg video file.');
  if (file.size <= 0 || file.size > 250 * 1024 * 1024) throw new Error('The introduction video must be 250 MB or smaller.');
  const form = new FormData();
  form.append('video', file, file.name);
  const { data } = await api.post<ApiEnvelope<{ videoUrl: string }>>('/admin/homepage/video-upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 15 * 60 * 1000,
  });
  return { videoUrl: data.data.videoUrl };
}
