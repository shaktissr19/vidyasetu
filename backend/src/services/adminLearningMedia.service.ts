import { randomUUID } from 'crypto';
import { getUploadUrl } from '../config/s3';

const ALLOWED_CONTENT_TYPES = new Set([
  'video/mp4',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function safeExtension(fileName: string): string {
  const match = fileName.toLowerCase().match(/(\.[a-z0-9]{1,8})$/);
  return match?.[1] || '';
}

export async function createLearningUploadUrl(fileName: string, contentType: string) {
  if (!ALLOWED_CONTENT_TYPES.has(contentType.toLowerCase())) {
    throw appError('Unsupported learning media type. Use MP4, MP3/M4A/WAV, PDF, PNG, JPEG or WebP.');
  }
  const extension = safeExtension(fileName);
  const now = new Date();
  const folder = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const key = `learning/${folder}/${randomUUID()}${extension}`;
  const uploadUrl = await getUploadUrl(key, contentType);
  return { uploadUrl, key, contentType, maxRecommendedBytes: 100 * 1024 * 1024 };
}
