import api from './api';
import type { ApiEnvelope } from '@/types/api';

export interface LearningMediaUpload {
  uploadUrl: string;
  key: string;
  contentType: string;
  maxRecommendedBytes: number;
}

export const getLearningMediaUploadUrl = (fileName: string, contentType: string) =>
  api.post<ApiEnvelope<LearningMediaUpload>>('/admin/learning/media/upload-url', { fileName, contentType });
