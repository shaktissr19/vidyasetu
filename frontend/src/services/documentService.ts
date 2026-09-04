import api from './api';
import type { ApiEnvelope } from '@/types/api';

export type StudentDocumentType = 'BONAFIDE_CERTIFICATE'|'STUDY_CERTIFICATE'|'CHARACTER_CERTIFICATE'|'TRANSFER_CERTIFICATE'|'ENROLLMENT_CERTIFICATE'|'OTHER';
export type StudentDocumentStatus = 'ISSUED'|'REVOKED';
export type StudentDocumentRequestStatus = 'PENDING'|'APPROVED'|'REJECTED'|'FULFILLED'|'CANCELLED';

export interface StudentDocument {
  id: string;
  student_id: string;
  document_type: StudentDocumentType;
  document_number: string;
  verification_code: string;
  title: string;
  academic_year?: string | null;
  status: StudentDocumentStatus;
  issued_at: string;
  valid_until?: string | null;
  notes?: string | null;
  payload?: Record<string, unknown>;
  student_name_snapshot: string;
  student_code_snapshot: string;
  class_label_snapshot?: string | null;
  school_name_snapshot: string;
  revoked_at?: string | null;
  revocation_reason?: string | null;
}
export interface StudentDocumentRequest {
  id: string;
  student_id: string;
  document_type: StudentDocumentType;
  purpose: string;
  status: StudentDocumentRequestStatus;
  review_note?: string | null;
  document_id?: string | null;
  created_at: string;
  student_name?: string;
  student_code?: string;
  class_name?: string | null;
  section?: string | null;
  requester_name?: string;
}
export interface VerifiedDocument {
  verified: boolean;
  status: 'ISSUED'|'REVOKED'|'EXPIRED';
  documentNumber: string;
  documentType: StudentDocumentType;
  title: string;
  studentName: string;
  studentCode: string;
  classLabel?: string | null;
  schoolName: string;
  academicYear?: string | null;
  issuedAt: string;
  validUntil?: string | null;
  revocationReason?: string | null;
}

export const getSchoolDocuments = (status?: StudentDocumentStatus) => api.get<ApiEnvelope<StudentDocument[]>>('/school/documents', { params: { status } });
export const getSchoolDocumentRequests = (status?: StudentDocumentRequestStatus) => api.get<ApiEnvelope<StudentDocumentRequest[]>>('/school/documents/requests', { params: { status } });
export const reviewSchoolDocumentRequest = (requestId: string, action: 'APPROVE'|'REJECT', note?: string) => api.patch<ApiEnvelope<StudentDocumentRequest>>(`/school/documents/requests/${requestId}`, { action, note });
export const issueStudentDocument = (payload: {
  studentId: string; documentType: StudentDocumentType; title: string; academicYear?: string; validUntil?: string;
  notes?: string; payload?: Record<string, unknown>; requestId?: string;
}) => api.post<ApiEnvelope<StudentDocument>>('/school/documents/issue', payload);
export const revokeStudentDocument = (documentId: string, reason: string) => api.patch<ApiEnvelope<StudentDocument>>(`/school/documents/${documentId}/revoke`, { reason });

export const getMyDocuments = () => api.get<ApiEnvelope<StudentDocument[]>>('/student/documents');
export const getMyDocumentRequests = () => api.get<ApiEnvelope<StudentDocumentRequest[]>>('/student/documents/requests');
export const requestMyDocument = (payload: { documentType: StudentDocumentType; purpose: string }) => api.post<ApiEnvelope<StudentDocumentRequest>>('/student/documents/requests', payload);

export const getParentChildDocuments = (studentId: string) => api.get<ApiEnvelope<StudentDocument[]>>(`/parent/documents/children/${studentId}`);
export const getParentChildDocumentRequests = (studentId: string) => api.get<ApiEnvelope<StudentDocumentRequest[]>>(`/parent/documents/children/${studentId}/requests`);
export const requestParentChildDocument = (studentId: string, payload: { documentType: StudentDocumentType; purpose: string }) => api.post<ApiEnvelope<StudentDocumentRequest>>(`/parent/documents/children/${studentId}/requests`, payload);

export const verifyStudentDocument = (code: string) => api.get<ApiEnvelope<VerifiedDocument>>(`/public/documents/verify/${code}`);
