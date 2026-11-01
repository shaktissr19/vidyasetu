import multer, { type Options } from 'multer';
import { randomUUID } from 'crypto';
import { mkdir } from 'fs/promises';
import os from 'os';
import path from 'path';
import type { RequestHandler } from 'express';

export const HOMEPAGE_VIDEO_MAX_BYTES = 250 * 1024 * 1024;
const tempDirectory = path.join(os.tmpdir(), 'vidyasetu-homepage-video');
const acceptedTypes: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.ogv': 'video/ogg',
};

const fileFilter: NonNullable<Options['fileFilter']> = (_req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();
  // MIME metadata is supplied by the client/browser and may be blank or
  // platform-specific. The service validates the actual file signature.
  if (acceptedTypes[extension]) {
    callback(null, true);
    return;
  }
  callback(Object.assign(new Error('Upload an MP4, WebM or Ogg video file.'), { statusCode: 400 }));
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      void mkdir(tempDirectory, { recursive: true })
        .then(() => callback(null, tempDirectory))
        .catch((error: unknown) => callback(error as Error, tempDirectory));
    },
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  fileFilter,
  limits: { fileSize: HOMEPAGE_VIDEO_MAX_BYTES, files: 1 },
});

export const uploadHomepageVideo: RequestHandler = upload.single('video');
