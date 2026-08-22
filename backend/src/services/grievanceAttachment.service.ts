import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import { getDownloadUrl, getUploadUrl } from '../config/s3';
import * as notifications from './notification.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
]);

interface GrievanceAccessRow extends QueryResultRow {
  id: UUID;
  parent_user_id: UUID;
  school_id: UUID;
  assigned_to: UUID | null;
  ticket_number: string;
  status: string;
}

export interface GrievanceAttachmentRow extends QueryResultRow {
  id: UUID;
  grievance_id: UUID;
  uploaded_by: UUID;
  file_name: string;
  content_type: string;
  file_size: number | string | null;
  created_at: string | Date;
  uploader_name: string;
  uploader_role: string;
}

interface StoredAttachmentRow extends GrievanceAttachmentRow {
  object_key: string;
}

export interface ConfirmAttachmentInput {
  key: string;
  fileName: string;
  contentType: string;
  fileSize: number;
}

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function safeFileName(fileName: string): string {
  const cleaned = fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(-160);
  if (!cleaned) throw appError('Invalid evidence file name', 400);
  return cleaned;
}

function validateEvidence(contentType: string, fileSize: number): void {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw appError('Unsupported evidence type. Use JPG, PNG, WebP, PDF or plain text.', 400);
  }
  if (!Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
    throw appError('Evidence file must be larger than 0 bytes and no more than 10 MB.', 400);
  }
}

async function parentAccess(grievanceId: UUID, parentUserId: UUID): Promise<GrievanceAccessRow> {
  const { rows: [row] } = await query<GrievanceAccessRow>(
    `SELECT id, parent_user_id, school_id, assigned_to, ticket_number, status::text AS status
     FROM parent_grievances
     WHERE id=$1 AND parent_user_id=$2`,
    [grievanceId, parentUserId],
  );
  if (!row) throw appError('Concern not found', 404);
  return row;
}

async function schoolAccess(grievanceId: UUID, schoolAdminUserId: UUID): Promise<GrievanceAccessRow> {
  const { rows: [row] } = await query<GrievanceAccessRow>(
    `SELECT g.id, g.parent_user_id, g.school_id, g.assigned_to, g.ticket_number, g.status::text AS status
     FROM parent_grievances g
     JOIN schools s ON s.id=g.school_id
     WHERE g.id=$1 AND s.admin_user_id=$2`,
    [grievanceId, schoolAdminUserId],
  );
  if (!row) throw appError('Concern not found', 404);
  return row;
}

async function adminAccess(grievanceId: UUID): Promise<GrievanceAccessRow> {
  const { rows: [row] } = await query<GrievanceAccessRow>(
    `SELECT id, parent_user_id, school_id, assigned_to, ticket_number, status::text AS status
     FROM parent_grievances WHERE id=$1`,
    [grievanceId],
  );
  if (!row) throw appError('Concern not found', 404);
  return row;
}

async function listAttachments(grievanceId: UUID): Promise<GrievanceAttachmentRow[]> {
  const { rows } = await query<GrievanceAttachmentRow>(
    `SELECT ga.id, ga.grievance_id, ga.uploaded_by, ga.file_name, ga.content_type,
            ga.file_size, ga.created_at, u.name AS uploader_name, u.role::text AS uploader_role
     FROM grievance_attachments ga
     JOIN users u ON u.id=ga.uploaded_by
     WHERE ga.grievance_id=$1
     ORDER BY ga.created_at ASC`,
    [grievanceId],
  );
  return rows;
}

async function storedAttachment(grievanceId: UUID, attachmentId: UUID): Promise<StoredAttachmentRow> {
  const { rows: [row] } = await query<StoredAttachmentRow>(
    `SELECT ga.id, ga.grievance_id, ga.uploaded_by, ga.object_key, ga.file_name, ga.content_type,
            ga.file_size, ga.created_at, u.name AS uploader_name, u.role::text AS uploader_role
     FROM grievance_attachments ga
     JOIN users u ON u.id=ga.uploaded_by
     WHERE ga.grievance_id=$1 AND ga.id=$2`,
    [grievanceId, attachmentId],
  );
  if (!row) throw appError('Evidence attachment not found', 404);
  return row;
}

export async function parentUploadUrl(
  grievanceId: UUID,
  parentUserId: UUID,
  fileName: string,
  contentType: string,
  fileSize: number,
) {
  const grievance = await parentAccess(grievanceId, parentUserId);
  if (grievance.status === 'CLOSED') {
    throw appError('Closed concerns cannot receive new evidence. Reopen or escalate the concern first.', 409);
  }
  validateEvidence(contentType, fileSize);
  const name = safeFileName(fileName);
  const key = `grievances/${grievanceId}/${parentUserId}/${Date.now()}_${name}`;
  return {
    uploadUrl: await getUploadUrl(key, contentType, 300),
    key,
    expiresIn: 300,
    maxFileSize: MAX_FILE_SIZE,
  };
}

export async function confirmParentAttachment(
  grievanceId: UUID,
  parentUserId: UUID,
  input: ConfirmAttachmentInput,
): Promise<GrievanceAttachmentRow> {
  const grievance = await parentAccess(grievanceId, parentUserId);
  if (grievance.status === 'CLOSED') {
    throw appError('Closed concerns cannot receive new evidence. Reopen or escalate the concern first.', 409);
  }
  validateEvidence(input.contentType, input.fileSize);
  const expectedPrefix = `grievances/${grievanceId}/${parentUserId}/`;
  if (!input.key.startsWith(expectedPrefix)) throw appError('Evidence object key does not belong to this concern', 403);
  const fileName = safeFileName(input.fileName);

  const { rows: [inserted] } = await query<StoredAttachmentRow>(
    `INSERT INTO grievance_attachments
       (grievance_id, uploaded_by, object_key, file_name, content_type, file_size)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (object_key) DO NOTHING
     RETURNING id, grievance_id, uploaded_by, object_key, file_name, content_type, file_size, created_at,
               ''::text AS uploader_name, 'PARENT'::text AS uploader_role`,
    [grievanceId, parentUserId, input.key, fileName, input.contentType, input.fileSize],
  );

  if (!inserted) {
    const existing = await storedAttachmentByKey(grievanceId, parentUserId, input.key);
    return stripObjectKey(existing);
  }

  await query(
    `INSERT INTO grievance_history (grievance_id, actor_user_id, action, from_status, to_status, note)
     VALUES ($1,$2,'ATTACHMENT_ADDED',$3::grievance_status,$3::grievance_status,$4)`,
    [grievanceId, parentUserId, grievance.status, fileName],
  );
  if (grievance.assigned_to) {
    await notifications.saveNotification({
      userId: grievance.assigned_to,
      schoolId: grievance.school_id,
      type: 'GRIEVANCE_UPDATED',
      title: `Evidence added to ${grievance.ticket_number}`,
      body: `Parent attached ${fileName}`,
      refId: grievanceId,
      refType: 'GRIEVANCE',
    });
  }

  const saved = await storedAttachment(grievanceId, inserted.id);
  return stripObjectKey(saved);
}

async function storedAttachmentByKey(grievanceId: UUID, parentUserId: UUID, key: string): Promise<StoredAttachmentRow> {
  const { rows: [row] } = await query<StoredAttachmentRow>(
    `SELECT ga.id, ga.grievance_id, ga.uploaded_by, ga.object_key, ga.file_name, ga.content_type,
            ga.file_size, ga.created_at, u.name AS uploader_name, u.role::text AS uploader_role
     FROM grievance_attachments ga
     JOIN users u ON u.id=ga.uploaded_by
     WHERE ga.grievance_id=$1 AND ga.uploaded_by=$2 AND ga.object_key=$3`,
    [grievanceId, parentUserId, key],
  );
  if (!row) throw appError('Evidence confirmation could not be completed', 409);
  return row;
}

function stripObjectKey(row: StoredAttachmentRow): GrievanceAttachmentRow {
  const { object_key: _objectKey, ...visible } = row;
  return visible;
}

export async function listForParent(grievanceId: UUID, parentUserId: UUID): Promise<GrievanceAttachmentRow[]> {
  await parentAccess(grievanceId, parentUserId);
  return listAttachments(grievanceId);
}

export async function listForSchool(grievanceId: UUID, schoolAdminUserId: UUID): Promise<GrievanceAttachmentRow[]> {
  await schoolAccess(grievanceId, schoolAdminUserId);
  return listAttachments(grievanceId);
}

export async function listForAdmin(grievanceId: UUID): Promise<GrievanceAttachmentRow[]> {
  await adminAccess(grievanceId);
  return listAttachments(grievanceId);
}

export async function downloadForParent(grievanceId: UUID, attachmentId: UUID, parentUserId: UUID) {
  await parentAccess(grievanceId, parentUserId);
  const attachment = await storedAttachment(grievanceId, attachmentId);
  return signedDownload(attachment);
}

export async function downloadForSchool(grievanceId: UUID, attachmentId: UUID, schoolAdminUserId: UUID) {
  await schoolAccess(grievanceId, schoolAdminUserId);
  const attachment = await storedAttachment(grievanceId, attachmentId);
  return signedDownload(attachment);
}

export async function downloadForAdmin(grievanceId: UUID, attachmentId: UUID) {
  await adminAccess(grievanceId);
  const attachment = await storedAttachment(grievanceId, attachmentId);
  return signedDownload(attachment);
}

async function signedDownload(attachment: StoredAttachmentRow) {
  return {
    url: await getDownloadUrl(attachment.object_key, 900),
    expiresIn: 900,
    fileName: attachment.file_name,
    contentType: attachment.content_type,
  };
}
