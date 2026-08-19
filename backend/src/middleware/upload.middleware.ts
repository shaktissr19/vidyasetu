import multer, { type Options } from 'multer';
import type { RequestHandler } from 'express';

const ALLOWED_MIME = new Set([
  'video/mp4',
  'video/webm',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_SIZE_MB = Number.parseInt(process.env.CONTENT_MAX_SIZE_MB || '500', 10);
const storage = multer.memoryStorage();

const fileFilter: NonNullable<Options['fileFilter']> = (_req, file, callback) => {
  if (ALLOWED_MIME.has(file.mimetype)) {
    callback(null, true);
    return;
  }
  callback(Object.assign(new Error(`File type ${file.mimetype} not allowed`), { status: 400 }));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

export function uploadSingle(field: string): RequestHandler {
  return upload.single(field);
}

export function uploadMultiple(field: string, max = 10): RequestHandler {
  return upload.array(field, max);
}
