import api from './api';
import type { ApiEnvelope } from '@/types/api';

export type TransportEventType = 'PICKED_UP' | 'DROPPED_AT_SCHOOL' | 'BOARDED_RETURN' | 'DROPPED_HOME' | 'MISSED_BUS';

export interface TransportVehicle {
  id: string;
  registration_number: string;
  label: string;
  vehicle_type: 'BUS' | 'VAN' | 'AUTO' | 'OTHER';
  capacity: number;
  driver_name: string;
  driver_phone: string;
  attendant_name?: string | null;
  attendant_phone?: string | null;
  status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
}
export interface TransportStop {
  id: string;
  route_id: string;
  name: string;
  address?: string | null;
  sequence_no: number;
  pickup_time?: string | null;
  drop_time?: string | null;
  is_active: boolean;
}
export interface TransportRoute {
  id: string;
  vehicle_id?: string | null;
  route_code: string;
  name: string;
  morning_start?: string | null;
  afternoon_start?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  vehicle_label?: string | null;
  registration_number?: string | null;
  vehicle_status?: string | null;
  stops: TransportStop[];
}
export interface TransportAssignment {
  id: string;
  student_id: string;
  route_id: string;
  stop_id: string;
  is_active: boolean;
  authorized_pickup_name?: string | null;
  authorized_pickup_phone?: string | null;
  authorized_pickup_relation?: string | null;
  student_name?: string;
  student_code?: string;
  class_name?: string;
  section?: string | null;
  route_name?: string;
  route_code?: string;
  stop_name?: string;
  pickup_time?: string | null;
  drop_time?: string | null;
  vehicle_label?: string | null;
  registration_number?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  attendant_name?: string | null;
  attendant_phone?: string | null;
}
export interface TransportEvent {
  id: string;
  student_id: string;
  event_date: string;
  event_type: TransportEventType;
  event_at: string;
  note?: string | null;
}
export interface TransportSnapshot {
  student: { id: string; name: string; student_code: string; class_name: string; section?: string | null };
  assignment: TransportAssignment | null;
  todayEvents: TransportEvent[];
}
export interface TransportManifestRow extends TransportAssignment { events: TransportEvent[]; }

export const getVehicles = () => api.get<ApiEnvelope<TransportVehicle[]>>('/school/transport/vehicles');
export const createVehicle = (payload: {
  registrationNumber: string; label: string; vehicleType: TransportVehicle['vehicle_type']; capacity: number;
  driverName: string; driverPhone: string; attendantName?: string; attendantPhone?: string;
}) => api.post<ApiEnvelope<TransportVehicle>>('/school/transport/vehicles', payload);
export const getRoutes = () => api.get<ApiEnvelope<TransportRoute[]>>('/school/transport/routes');
export const createRoute = (payload: { routeCode: string; name: string; vehicleId?: string; morningStart?: string; afternoonStart?: string }) =>
  api.post<ApiEnvelope<TransportRoute>>('/school/transport/routes', payload);
export const createStop = (routeId: string, payload: { name: string; address?: string; sequenceNo: number; pickupTime?: string; dropTime?: string }) =>
  api.post<ApiEnvelope<TransportStop>>(`/school/transport/routes/${routeId}/stops`, payload);
export const getAssignments = () => api.get<ApiEnvelope<TransportAssignment[]>>('/school/transport/assignments');
export const assignStudentTransport = (studentId: string, payload: {
  routeId: string; stopId: string; authorizedPickupName?: string; authorizedPickupPhone?: string; authorizedPickupRelation?: string;
}) => api.put<ApiEnvelope<TransportAssignment>>(`/school/transport/assignments/${studentId}`, payload);
export const getTransportManifest = (date: string) => api.get<ApiEnvelope<TransportManifestRow[]>>('/school/transport/manifest', { params: { date } });
export const recordTransportEvent = (payload: { studentId: string; eventType: TransportEventType; note?: string }) =>
  api.post<ApiEnvelope<TransportEvent>>('/school/transport/events', payload);
export const getMyTransport = () => api.get<ApiEnvelope<TransportSnapshot>>('/student/transport');
export const getParentChildTransport = (studentId: string) => api.get<ApiEnvelope<TransportSnapshot>>(`/parent/transport/children/${studentId}`);
