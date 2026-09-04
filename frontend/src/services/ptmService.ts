import api from './api';
import type { ApiEnvelope } from '@/types/api';

export type PtmSessionStatus='DRAFT'|'OPEN'|'CLOSED'|'COMPLETED'|'CANCELLED';
export type PtmBookingStatus='BOOKED'|'CANCELLED'|'COMPLETED'|'NO_SHOW';

export interface PtmSession{
  id:string;school_id:string;calendar_event_id?:string|null;title:string;description?:string|null;
  starts_at:string;ends_at:string;booking_opens_at:string;booking_closes_at:string;status:PtmSessionStatus;
  slot_count?:number;booked_count?:number;
}
export interface PtmSlot{
  id:string;session_id:string;school_id:string;teacher_id:string;starts_at:string;ends_at:string;location?:string|null;
  is_active:boolean;teacher_user_id?:string;teacher_name?:string;subjects?:string|null;is_booked?:boolean;
}
export interface PtmBooking{
  id:string;session_id:string;slot_id:string;school_id:string;teacher_id:string;student_id:string;parent_user_id:string;
  status:PtmBookingStatus;parent_note?:string|null;outcome_note?:string|null;booked_at:string;cancelled_at?:string|null;completed_at?:string|null;
  session_title?:string;starts_at?:string;ends_at?:string;location?:string|null;teacher_name?:string;teacher_user_id?:string;
  student_name?:string;student_code?:string;class_name?:string;section?:string|null;parent_name?:string;
}

export const getSchoolPtmSessions=()=>api.get<ApiEnvelope<PtmSession[]>>('/school/ptm/sessions');
export const createSchoolPtmSession=(payload:{title:string;description?:string;startsAt:string;endsAt:string;bookingOpensAt:string;bookingClosesAt:string})=>api.post<ApiEnvelope<PtmSession>>('/school/ptm/sessions',payload);
export const updateSchoolPtmSessionStatus=(sessionId:string,status:Exclude<PtmSessionStatus,'DRAFT'>)=>api.patch<ApiEnvelope<PtmSession>>(`/school/ptm/sessions/${sessionId}/status`,{status});
export const getSchoolPtmSlots=(sessionId?:string)=>api.get<ApiEnvelope<PtmSlot[]>>('/school/ptm/slots',{params:{sessionId}});
export const createSchoolPtmSlot=(sessionId:string,payload:{teacherId:string;startsAt:string;endsAt:string;location?:string})=>api.post<ApiEnvelope<PtmSlot>>(`/school/ptm/sessions/${sessionId}/slots`,payload);
export const getSchoolPtmBookings=(sessionId?:string)=>api.get<ApiEnvelope<PtmBooking[]>>('/school/ptm/bookings',{params:{sessionId}});
export const updatePtmOutcome=(bookingId:string,payload:{status:'COMPLETED'|'NO_SHOW';outcomeNote?:string})=>api.patch<ApiEnvelope<PtmBooking>>(`/school/ptm/bookings/${bookingId}/outcome`,payload);

export const getParentPtmOptions=(studentId:string)=>api.get<ApiEnvelope<PtmSlot[]>>(`/parent/ptm/children/${studentId}/options`);
export const getParentPtmBookings=(studentId:string)=>api.get<ApiEnvelope<PtmBooking[]>>(`/parent/ptm/children/${studentId}/bookings`);
export const bookParentPtmSlot=(studentId:string,slotId:string,parentNote?:string)=>api.post<ApiEnvelope<PtmBooking>>(`/parent/ptm/children/${studentId}/slots/${slotId}/book`,{parentNote});
export const cancelParentPtmBooking=(bookingId:string)=>api.patch<ApiEnvelope<PtmBooking>>(`/parent/ptm/bookings/${bookingId}/cancel`);

export const getStudentPtmBookings=()=>api.get<ApiEnvelope<PtmBooking[]>>('/student/ptm/bookings');
