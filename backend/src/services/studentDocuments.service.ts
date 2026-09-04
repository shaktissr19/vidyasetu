import { randomUUID } from 'crypto';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import { saveNotification } from './notification.service';

export type StudentDocumentType =
  | 'BONAFIDE_CERTIFICATE'
  | 'STUDY_CERTIFICATE'
  | 'CHARACTER_CERTIFICATE'
  | 'TRANSFER_CERTIFICATE'
  | 'ENROLLMENT_CERTIFICATE'
  | 'OTHER';
export type StudentDocumentStatus = 'ISSUED' | 'REVOKED';
export type StudentDocumentRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED' | 'CANCELLED';

export interface DocumentRequestInput {
  documentType: StudentDocumentType;
  purpose: string;
}
export interface RequestReviewInput {
  action: 'APPROVE' | 'REJECT';
  note?: string | null;
}
export interface IssueDocumentInput {
  studentId: UUID;
  documentType: StudentDocumentType;
  title: string;
  academicYear?: string | null;
  validUntil?: string | null;
  notes?: string | null;
  payload?: Record<string, unknown>;
  requestId?: UUID | null;
}

interface StudentContextRow extends QueryResultRow {
  id: UUID;
  user_id: UUID;
  school_id: UUID;
  student_code: string;
  student_name: string;
  class_name: string | null;
  section: string | null;
  school_name: string;
  admin_user_id: UUID | null;
}
interface DocumentRow extends QueryResultRow {
  id: UUID; school_id: UUID; student_id: UUID; document_type: StudentDocumentType; document_number: string;
  verification_code: UUID; title: string; academic_year: string | null; status: StudentDocumentStatus;
  issued_at: string | Date; valid_until: string | null; notes: string | null; payload: Record<string, unknown>;
  student_name_snapshot: string; student_code_snapshot: string; class_label_snapshot: string | null; school_name_snapshot: string;
  issued_by: UUID; revoked_at: string | Date | null; revoked_by: UUID | null; revocation_reason: string | null;
}
interface RequestRow extends QueryResultRow {
  id: UUID; school_id: UUID; student_id: UUID; requested_by_user_id: UUID; requested_by_role: string;
  document_type: StudentDocumentType; purpose: string; status: StudentDocumentRequestStatus;
  reviewed_by: UUID | null; reviewed_at: string | Date | null; review_note: string | null; document_id: UUID | null;
  created_at: string | Date; student_name?: string; student_code?: string; class_name?: string | null; section?: string | null;
  requester_name?: string;
}
interface RecipientRow extends QueryResultRow { user_id: UUID; }

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}
function clean(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}
function documentNumber(): string {
  return `VS-${new Date().getUTCFullYear()}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}

export async function documentSchemaReady(): Promise<boolean> {
  const { rows: [row] } = await query<{ ready: boolean } & QueryResultRow>(
    `SELECT to_regclass('public.student_documents') IS NOT NULL
        AND to_regclass('public.student_document_requests') IS NOT NULL AS ready`,
  );
  return Boolean(row?.ready);
}
async function requireSchema(): Promise<void> {
  if (!await documentSchemaReady()) throw httpError('Student Records & Certificates is not initialized yet', 503);
}

async function studentInSchool(schoolId: UUID, studentId: UUID): Promise<StudentContextRow> {
  const { rows: [row] } = await query<StudentContextRow>(
    `SELECT s.id,s.user_id,s.school_id,s.student_code,u.name AS student_name,
            sc.class_name,sc.section,sch.name AS school_name,sch.admin_user_id
     FROM students s
     JOIN users u ON u.id=s.user_id
     JOIN schools sch ON sch.id=s.school_id
     LEFT JOIN school_classes sc ON sc.id=s.class_id
     WHERE s.id=$1 AND s.school_id=$2 AND s.status='ACTIVE' AND s.school_link_status='APPROVED' LIMIT 1`,
    [studentId, schoolId],
  );
  if (!row) throw httpError('Active enrolled Student not found in this School', 404);
  return row;
}
async function studentForUser(userId: UUID): Promise<StudentContextRow> {
  const { rows: [row] } = await query<StudentContextRow>(
    `SELECT s.id,s.user_id,s.school_id,s.student_code,u.name AS student_name,
            sc.class_name,sc.section,sch.name AS school_name,sch.admin_user_id
     FROM students s
     JOIN users u ON u.id=s.user_id
     JOIN schools sch ON sch.id=s.school_id
     LEFT JOIN school_classes sc ON sc.id=s.class_id
     WHERE s.user_id=$1 AND s.status='ACTIVE' AND s.school_link_status='APPROVED' AND s.school_id IS NOT NULL LIMIT 1`,
    [userId],
  );
  if (!row) throw httpError('An approved active School enrollment is required', 403);
  return row;
}
async function parentLinkedStudent(parentUserId: UUID, studentId: UUID): Promise<StudentContextRow> {
  const { rows: [row] } = await query<StudentContextRow>(
    `SELECT s.id,s.user_id,s.school_id,s.student_code,u.name AS student_name,
            sc.class_name,sc.section,sch.name AS school_name,sch.admin_user_id
     FROM parent_student_links psl
     JOIN students s ON s.id=psl.student_id
     JOIN users u ON u.id=s.user_id
     JOIN schools sch ON sch.id=s.school_id
     LEFT JOIN school_classes sc ON sc.id=s.class_id
     WHERE psl.parent_user_id=$1 AND s.id=$2 AND s.status='ACTIVE'
       AND s.school_link_status='APPROVED' AND s.school_id IS NOT NULL LIMIT 1`,
    [parentUserId, studentId],
  );
  if (!row) throw httpError('You are not linked to this Student', 403);
  return row;
}

function documentSelect(where: string): string {
  return `SELECT id,school_id,student_id,document_type,document_number,verification_code,title,academic_year,status,
    issued_at,valid_until::text,notes,payload,student_name_snapshot,student_code_snapshot,class_label_snapshot,
    school_name_snapshot,issued_by,revoked_at,revoked_by,revocation_reason
    FROM student_documents WHERE ${where}`;
}
function requestSelect(where: string): string {
  return `SELECT r.*,u.name AS student_name,s.student_code,sc.class_name,sc.section,ru.name AS requester_name
    FROM student_document_requests r
    JOIN students s ON s.id=r.student_id
    JOIN users u ON u.id=s.user_id
    LEFT JOIN school_classes sc ON sc.id=s.class_id
    JOIN users ru ON ru.id=r.requested_by_user_id
    WHERE ${where}`;
}

export async function listSchoolDocuments(schoolId: UUID, status?: StudentDocumentStatus): Promise<DocumentRow[]> {
  await requireSchema();
  const params: unknown[] = [schoolId];
  const where = status ? 'school_id=$1 AND status=$2' : 'school_id=$1';
  if (status) params.push(status);
  const { rows } = await query<DocumentRow>(`${documentSelect(where)} ORDER BY issued_at DESC`, params);
  return rows;
}
export async function listSchoolRequests(schoolId: UUID, status?: StudentDocumentRequestStatus): Promise<RequestRow[]> {
  await requireSchema();
  const params: unknown[] = [schoolId];
  const where = status ? 'r.school_id=$1 AND r.status=$2' : 'r.school_id=$1';
  if (status) params.push(status);
  const { rows } = await query<RequestRow>(`${requestSelect(where)} ORDER BY r.created_at DESC`, params);
  return rows;
}

async function createRequest(student: StudentContextRow, requesterUserId: UUID, requesterRole: 'STUDENT' | 'PARENT', input: DocumentRequestInput): Promise<RequestRow> {
  try {
    const { rows: [row] } = await query<RequestRow>(
      `INSERT INTO student_document_requests
         (school_id,student_id,requested_by_user_id,requested_by_role,document_type,purpose)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [student.school_id, student.id, requesterUserId, requesterRole, input.documentType, input.purpose.trim()],
    );
    if (!row) throw new Error('Document request insert returned no row');
    if (student.admin_user_id) {
      await saveNotification({
        userId: student.admin_user_id, schoolId: student.school_id, type: 'DOCUMENT_REQUESTED',
        title: `Certificate request · ${student.student_name}`,
        body: `${student.student_name} requested ${input.documentType.replace(/_/g, ' ').toLowerCase()}.`,
        refId: row.id, refType: 'STUDENT_DOCUMENT_REQUEST',
      });
    }
    return row;
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === '23505') throw httpError('A pending request for this document type already exists', 409);
    throw error;
  }
}
export async function createStudentRequest(userId: UUID, input: DocumentRequestInput): Promise<RequestRow> {
  await requireSchema();
  return createRequest(await studentForUser(userId), userId, 'STUDENT', input);
}
export async function createParentRequest(parentUserId: UUID, studentId: UUID, input: DocumentRequestInput): Promise<RequestRow> {
  await requireSchema();
  return createRequest(await parentLinkedStudent(parentUserId, studentId), parentUserId, 'PARENT', input);
}
export async function listStudentRequests(userId: UUID): Promise<RequestRow[]> {
  await requireSchema();
  const student = await studentForUser(userId);
  const { rows } = await query<RequestRow>(`${requestSelect('r.student_id=$1')} ORDER BY r.created_at DESC`, [student.id]);
  return rows;
}
export async function listParentChildRequests(parentUserId: UUID, studentId: UUID): Promise<RequestRow[]> {
  await requireSchema();
  await parentLinkedStudent(parentUserId, studentId);
  const { rows } = await query<RequestRow>(`${requestSelect('r.student_id=$1')} ORDER BY r.created_at DESC`, [studentId]);
  return rows;
}

export async function reviewRequest(schoolId: UUID, actorId: UUID, requestId: UUID, input: RequestReviewInput): Promise<RequestRow> {
  await requireSchema();
  const nextStatus: StudentDocumentRequestStatus = input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  const { rows: [row] } = await query<RequestRow>(
    `UPDATE student_document_requests
     SET status=$4,reviewed_by=$3,reviewed_at=NOW(),review_note=$5,updated_at=NOW()
     WHERE id=$1 AND school_id=$2 AND status='PENDING'
     RETURNING *`,
    [requestId, schoolId, actorId, nextStatus, clean(input.note)],
  );
  if (!row) throw httpError('Pending document request not found', 404);
  await saveNotification({
    userId: row.requested_by_user_id, schoolId, type: 'DOCUMENT_REQUESTED',
    title: `Certificate request ${nextStatus.toLowerCase()}`,
    body: input.action === 'APPROVE' ? 'Your School approved the certificate request and can now issue the document.' : `Your School rejected the certificate request${input.note ? `: ${input.note}` : '.'}`,
    refId: row.id, refType: 'STUDENT_DOCUMENT_REQUEST',
  });
  return row;
}

async function documentRecipients(studentId: UUID): Promise<RecipientRow[]> {
  const { rows } = await query<RecipientRow>(
    `SELECT s.user_id FROM students s WHERE s.id=$1
     UNION SELECT psl.parent_user_id FROM parent_student_links psl WHERE psl.student_id=$1`,
    [studentId],
  );
  return rows;
}
export async function issueDocument(schoolId: UUID, actorId: UUID, input: IssueDocumentInput): Promise<DocumentRow> {
  await requireSchema();
  const student = await studentInSchool(schoolId, input.studentId);
  const classLabel = student.class_name ? `Class ${student.class_name}${student.section ? `-${student.section}` : ''}` : null;
  const row = await transaction<DocumentRow>(async (client) => {
    if (input.requestId) {
      const request = await client.query<RequestRow>(
        `SELECT * FROM student_document_requests WHERE id=$1 AND school_id=$2 AND student_id=$3 AND status IN ('PENDING','APPROVED') FOR UPDATE`,
        [input.requestId, schoolId, student.id],
      );
      if (!request.rows[0]) throw httpError('Open document request not found for this Student', 404);
      if (request.rows[0].document_type !== input.documentType) throw httpError('Issued document type must match the request', 400);
    }
    const inserted = await client.query<DocumentRow>(
      `INSERT INTO student_documents
        (school_id,student_id,document_type,document_number,title,academic_year,valid_until,notes,payload,
         student_name_snapshot,student_code_snapshot,class_label_snapshot,school_name_snapshot,issued_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id,school_id,student_id,document_type,document_number,verification_code,title,academic_year,status,
         issued_at,valid_until::text,notes,payload,student_name_snapshot,student_code_snapshot,class_label_snapshot,
         school_name_snapshot,issued_by,revoked_at,revoked_by,revocation_reason`,
      [schoolId, student.id, input.documentType, documentNumber(), input.title.trim(), clean(input.academicYear), clean(input.validUntil),
       clean(input.notes), input.payload || {}, student.student_name, student.student_code, classLabel, student.school_name, actorId],
    );
    const document = inserted.rows[0];
    if (!document) throw new Error('Document insert returned no row');
    if (input.requestId) {
      await client.query(
        `UPDATE student_document_requests
         SET status='FULFILLED',document_id=$2,reviewed_by=COALESCE(reviewed_by,$3),reviewed_at=COALESCE(reviewed_at,NOW()),updated_at=NOW()
         WHERE id=$1`,
        [input.requestId, document.id, actorId],
      );
    }
    return document;
  });
  const recipients = await documentRecipients(student.id);
  await Promise.all(recipients.map((recipient) => saveNotification({
    userId: recipient.user_id, schoolId, type: 'DOCUMENT_ISSUED', title: `Document issued · ${student.student_name}`,
    body: `${student.school_name} issued ${row.title} (${row.document_number}).`, refId: row.id, refType: 'STUDENT_DOCUMENT',
  })));
  return row;
}

export async function revokeDocument(schoolId: UUID, actorId: UUID, documentId: UUID, reason: string): Promise<DocumentRow> {
  await requireSchema();
  const { rows: [row] } = await query<DocumentRow>(
    `UPDATE student_documents SET status='REVOKED',revoked_at=NOW(),revoked_by=$3,revocation_reason=$4,updated_at=NOW()
     WHERE id=$1 AND school_id=$2 AND status='ISSUED'
     RETURNING id,school_id,student_id,document_type,document_number,verification_code,title,academic_year,status,
       issued_at,valid_until::text,notes,payload,student_name_snapshot,student_code_snapshot,class_label_snapshot,
       school_name_snapshot,issued_by,revoked_at,revoked_by,revocation_reason`,
    [documentId, schoolId, actorId, reason.trim()],
  );
  if (!row) throw httpError('Issued document not found', 404);
  const recipients = await documentRecipients(row.student_id);
  await Promise.all(recipients.map((recipient) => saveNotification({
    userId: recipient.user_id, schoolId, type: 'DOCUMENT_REVOKED', title: `Document revoked · ${row.student_name_snapshot}`,
    body: `${row.title} (${row.document_number}) was revoked by the School.`, refId: row.id, refType: 'STUDENT_DOCUMENT',
  })));
  return row;
}

export async function listStudentDocuments(userId: UUID): Promise<DocumentRow[]> {
  await requireSchema();
  const student = await studentForUser(userId);
  const { rows } = await query<DocumentRow>(`${documentSelect("student_id=$1 AND status IN ('ISSUED','REVOKED')")} ORDER BY issued_at DESC`, [student.id]);
  return rows;
}
export async function listParentChildDocuments(parentUserId: UUID, studentId: UUID): Promise<DocumentRow[]> {
  await requireSchema();
  await parentLinkedStudent(parentUserId, studentId);
  const { rows } = await query<DocumentRow>(`${documentSelect("student_id=$1 AND status IN ('ISSUED','REVOKED')")} ORDER BY issued_at DESC`, [studentId]);
  return rows;
}

export async function verifyDocument(code: UUID): Promise<Record<string, unknown>> {
  await requireSchema();
  const { rows: [row] } = await query<DocumentRow>(`${documentSelect('verification_code=$1')} LIMIT 1`, [code]);
  if (!row) throw httpError('Document verification code not found', 404);
  const expired = Boolean(row.valid_until && row.valid_until < new Date().toISOString().slice(0, 10));
  return {
    verified: row.status === 'ISSUED' && !expired,
    status: expired && row.status === 'ISSUED' ? 'EXPIRED' : row.status,
    documentNumber: row.document_number,
    documentType: row.document_type,
    title: row.title,
    studentName: row.student_name_snapshot,
    studentCode: row.student_code_snapshot,
    classLabel: row.class_label_snapshot,
    schoolName: row.school_name_snapshot,
    academicYear: row.academic_year,
    issuedAt: row.issued_at,
    validUntil: row.valid_until,
    revocationReason: row.status === 'REVOKED' ? row.revocation_reason : null,
  };
}
