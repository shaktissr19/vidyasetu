import api from './api';
import type { ApiEnvelope } from '@/types/api';

export interface PublicOverview {
  students: number;
  schools: number;
  teachers: number;
  parents: number;
  groups: number;
  competitions: number;
  generatedAt: string;
}

export const getPublicOverview = () =>
  api.get<ApiEnvelope<PublicOverview>>('/public/overview');
