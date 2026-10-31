import api from './api';
import type { ApiEnvelope } from '@/types/api';

export const PLATFORM_ADMIN_CAPABILITIES = ['SCHOOLS', 'USERS', 'CONTENT_ANALYTICS', 'COMPETITIONS', 'SUPPORT'] as const;
export type PlatformAdminCapability = typeof PLATFORM_ADMIN_CAPABILITIES[number];
export type AdminCapability = 'ANALYTICS' | PlatformAdminCapability;
export const PLATFORM_ADMIN_CAPABILITY_LABELS: Record<PlatformAdminCapability, { title: string; description: string }> = {
  SCHOOLS: { title: 'School operations', description: 'View schools and change school account status.' },
  USERS: { title: 'User operations', description: 'Search, export, and manage non-admin user accounts.' },
  CONTENT_ANALYTICS: { title: 'Content analytics', description: 'View catalogue metrics without editing or publishing content.' },
  COMPETITIONS: { title: 'Competitions', description: 'View and create platform competitions.' },
  SUPPORT: { title: 'Support', description: 'View and update support tickets.' },
};
export interface AdminPermissionsResponse { role: 'SUPER_ADMIN' | 'PLATFORM_ADMIN'; permissions: AdminCapability[]; }
export interface ManagedPlatformAdmin { id: string; name: string; username: string; email: string | null; mobile: string; status: string; created_at: string; permissions: PlatformAdminCapability[]; }

export const getMyAdminPermissions = () => api.get<ApiEnvelope<AdminPermissionsResponse>>('/admin/me/permissions');
export const listPlatformAdmins = () => api.get<ApiEnvelope<ManagedPlatformAdmin[]>>('/admin/platform-admins');
export const updatePlatformAdminPermissions = (userId: string, permissions: PlatformAdminCapability[]) => api.put<ApiEnvelope<{ userId: string; permissions: PlatformAdminCapability[] }>>(`/admin/platform-admins/${userId}/permissions`, { permissions });
