import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import { getDownloadUrl, getUploadUrl } from '../config/s3';

interface MembershipRow extends QueryResultRow {
  group_id: UUID;
  user_id: UUID;
  group_status: string;
}

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

async function assertActiveGroupMember(groupId: UUID, userId: UUID): Promise<void> {
  const { rows: [row] } = await query<MembershipRow>(
    `SELECT gm.group_id, gm.user_id, g.status AS group_status
     FROM collaboration_group_members gm
     JOIN collaboration_groups g ON g.id = gm.group_id
     WHERE gm.group_id = $1 AND gm.user_id = $2 AND gm.status = 'ACTIVE'`,
    [groupId, userId],
  );
  if (!row) throw httpError('You are not an active member of this Group', 403);
  if (row.group_status !== 'ACTIVE') throw httpError('Group is not active', 409);
}

function safeFileName(fileName: string): string {
  const cleaned = fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(-120);
  if (!cleaned) throw httpError('Invalid file name', 400);
  return cleaned;
}

export async function getGroupUploadUrl(
  groupId: UUID,
  userId: UUID,
  fileName: string,
  contentType: string,
) {
  await assertActiveGroupMember(groupId, userId);
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw httpError('Unsupported Group attachment type. Use image, PDF, text, Word or PowerPoint files.', 400);
  }
  const key = `groups/${groupId}/${userId}/${Date.now()}_${safeFileName(fileName)}`;
  return {
    uploadUrl: await getUploadUrl(key, contentType, 300),
    key,
    expiresIn: 300,
  };
}

export async function getGroupDownloadUrl(groupId: UUID, userId: UUID, key: string) {
  await assertActiveGroupMember(groupId, userId);
  const prefix = `groups/${groupId}/`;
  if (!key.startsWith(prefix)) throw httpError('Attachment does not belong to this Group', 403);
  return {
    url: await getDownloadUrl(key, 3600),
    expiresIn: 3600,
  };
}
