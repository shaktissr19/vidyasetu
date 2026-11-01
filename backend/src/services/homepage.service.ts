import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { access, mkdir, rename, copyFile, unlink } from 'fs/promises';
import path from 'path';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import { BUCKET, getDownloadUrl, getUploadUrl, s3, verifyS3Credentials } from '../config/s3';
import { HOMEPAGE_VIDEO_MAX_BYTES } from '../middleware/homepageVideoUpload.middleware';

const internalLink = z.string().trim().min(1).max(300).regex(/^\/(?!\/)/, 'Use an internal VidyaSetu path');
const mediaUrl = z.string().trim().max(1200).refine((value) => {
  if (!value) return true;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}, 'Use a site path or secure HTTPS URL');
const videoUrl = mediaUrl.refine((value) => {
  if (!value) return true;
  try {
    const path = value.startsWith('/') ? value.split('?')[0] : new URL(value).pathname;
    return /\.(mp4|webm|ogg|ogv)$/i.test(path);
  } catch { return false; }
}, 'Use a direct MP4, WebM or Ogg video file URL');
const captionUrl = mediaUrl.refine((value) => !value || /\.vtt(?:$|\?)/i.test(value), 'Captions must be a WebVTT (.vtt) file');
const icon = z.enum(['graduation', 'school', 'family', 'book', 'trophy', 'link', 'shield', 'india', 'progress', 'device']);
const tone = z.enum(['orange', 'green', 'violet', 'blue', 'rose', 'teal']);
const text = (max: number) => z.string().trim().min(1).max(max);

export const homepageContentSchema = z.object({
  hero: z.object({ eyebrow: text(100), title: text(180), description: text(600) }),
  benefits: z.array(z.object({ icon, title: text(80), copy: text(220), tone })).min(1).max(6),
  modules: z.array(z.object({ title: text(80), copy: text(220), href: internalLink, imageUrl: mediaUrl, icon, tone })).min(1).max(12),
  video: z.object({ title: text(120), description: text(300), videoUrl, posterUrl: mediaUrl, captionsUrl: captionUrl, captionsLanguage: z.string().trim().regex(/^[a-z]{2}$/i), transcript: z.string().trim().max(12000), hindiTitle: z.string().trim().max(120).optional().default(''), hindiDescription: z.string().trim().max(300).optional().default(''), hindiCaptionsUrl: captionUrl.optional().default(''), hindiTranscript: z.string().trim().max(12000).optional().default('') }).superRefine((video, ctx) => {
    if (video.videoUrl && !video.captionsUrl && !video.hindiCaptionsUrl) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['captionsUrl'], message: 'Add English or Hindi captions before publishing the introduction video' });
    if (video.videoUrl && !video.transcript && !video.hindiTranscript) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['transcript'], message: 'Add an English or Hindi transcript before publishing the introduction video' });
  }),
  journey: z.array(z.object({ step: z.string().trim().min(1).max(8), icon, title: text(100), copy: text(300) })).min(1).max(8),
  trust: z.array(z.object({ icon, title: text(100), copy: text(320) })).min(1).max(10),
  finalCta: z.object({ eyebrow: text(100), title: text(220), copy: text(500) }),
});

export type HomepageContent = z.infer<typeof homepageContentSchema>;

export const DEFAULT_HOMEPAGE_CONTENT: HomepageContent = {
  hero: { eyebrow: 'INDIA’S CONNECTED EDUCATION ECOSYSTEM', title: 'One platform for learning, schools and families.', description: 'VidyaSetu connects students, schools, teachers and parents on one trusted platform to learn, manage, communicate and grow together.' },
  benefits: [
    { icon: 'graduation', title: 'Learn Better', copy: 'Quality content and practice for every learner', tone: 'orange' },
    { icon: 'school', title: 'Run Schools Better', copy: 'Smart tools for academics, operations and growth', tone: 'green' },
    { icon: 'family', title: 'Stay Connected', copy: 'Real-time communication and progress tracking', tone: 'violet' },
  ],
  modules: [
    { title: 'Students', copy: 'Learn, practice and track your progress', href: '/for-students', imageUrl: '/images/heroes/students-hero.png', icon: 'graduation', tone: 'blue' },
    { title: 'Schools', copy: 'Manage classes, teachers, attendance and more', href: '/for-schools', imageUrl: '/images/heroes/schools-hero.png', icon: 'school', tone: 'green' },
    { title: 'Parents', copy: 'Monitor progress and stay connected with schools', href: '/for-parents', imageUrl: '/images/home-cards/home-parents.png', icon: 'family', tone: 'violet' },
    { title: 'Learning', copy: 'Access public resources for all grades', href: '/learn', imageUrl: '/images/heroes/learn-hero.png', icon: 'book', tone: 'orange' },
    { title: 'Competitions', copy: 'Participate, compete and excel', href: '/competition', imageUrl: '/images/heroes/competition-hero.png', icon: 'trophy', tone: 'rose' },
    { title: 'Communities', copy: 'Connect, discuss and learn together', href: '/communities', imageUrl: '', icon: 'family', tone: 'teal' },
  ],
  video: { title: 'Discover VidyaSetu', description: 'See how students, schools and families learn and stay connected.', videoUrl: '', posterUrl: '/images/heroes/home-hero.png', captionsUrl: '', captionsLanguage: 'en', transcript: '', hindiTitle: '', hindiDescription: '', hindiCaptionsUrl: '', hindiTranscript: '' },
  journey: [
    { step: '01', icon: 'graduation', title: 'A student learns', copy: 'Discover resources, practise by class and build a visible learning journey.' },
    { step: '02', icon: 'school', title: 'The school supports', copy: 'School academics and everyday operations stay connected to the learner.' },
    { step: '03', icon: 'family', title: 'The family stays informed', copy: 'Parents can follow progress and school communication from one trusted space.' },
    { step: '04', icon: 'link', title: 'Growth continues beyond class', copy: 'Competitions and Communities extend participation, confidence and opportunity.' },
  ],
  trust: [
    { icon: 'shield', title: 'Safe by design', copy: 'Role-aware access keeps personal, school and family records inside protected workspaces.' },
    { icon: 'link', title: 'Connected, not fragmented', copy: 'Learning, school operations and family participation belong to the same education journey.' },
    { icon: 'india', title: 'Built for Indian education', copy: 'Cross-board learning and school workflows reflect Indian classrooms, families and institutions.' },
    { icon: 'progress', title: 'Progress with context', copy: 'Learning activity can sit alongside school-linked academic context instead of living in another silo.' },
    { icon: 'device', title: 'Made for everyday access', copy: 'Public discovery is simple and the role-based experience works across modern devices.' },
  ],
  finalCta: { eyebrow: 'START WITH THE PART YOU NEED', title: 'Learn publicly. Join when you are ready for the connected experience.', copy: 'Create an account for role-based learning, school workflows, parent visibility, Communities and participation history.' },
};

const HOMEPAGE_VIDEO_TYPES: Record<string, string> = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg', '.ogg': 'video/ogg' };
const videoStorageProvider = () => (process.env.HOMEPAGE_VIDEO_STORAGE || 'local').trim().toLowerCase();
const localVideoDirectory = () => process.env.HOMEPAGE_VIDEO_LOCAL_DIR || '/var/lib/vidyasetu/media/homepage-intro';

export async function createHomepageVideoUpload(fileName: string, contentType: string, fileSize: number) {
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > 500 * 1024 * 1024) {
    throw Object.assign(new Error('Choose a video file up to 500 MB'), { statusCode: 400 });
  }
  const extension = fileName.toLowerCase().match(/\.[a-z0-9]{1,8}$/)?.[0] || '';
  if (HOMEPAGE_VIDEO_TYPES[extension] !== contentType.toLowerCase()) {
    throw Object.assign(new Error('Upload an MP4, WebM or Ogg video file'), { statusCode: 400 });
  }
  await verifyS3Credentials();
  const key = `homepage-intro/${randomUUID()}${extension}`;
  const uploadUrl = await getUploadUrl(key, contentType.toLowerCase());
  return { uploadUrl, videoUrl: `/api/v1/public/homepage/videos/${key.split('/')[1]}`, contentType: contentType.toLowerCase(), maxBytes: 500 * 1024 * 1024 };
}

export async function storeHomepageVideo(filePath: string, fileName: string, contentType: string, fileSize: number) {
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > HOMEPAGE_VIDEO_MAX_BYTES) {
    throw Object.assign(new Error('Choose an introduction video up to 250 MB.'), { statusCode: 400 });
  }
  const extension = path.extname(fileName).toLowerCase();
  if (HOMEPAGE_VIDEO_TYPES[extension] !== contentType.toLowerCase()) {
    throw Object.assign(new Error('Upload an MP4, WebM or Ogg video file.'), { statusCode: 400 });
  }
  const provider = videoStorageProvider();
  if (provider !== 'local' && provider !== 's3') {
    throw Object.assign(new Error('HOMEPAGE_VIDEO_STORAGE must be set to local or s3.'), { statusCode: 503 });
  }

  const filename = `${randomUUID()}${extension}`;
  if (provider === 'local') {
    const directory = localVideoDirectory();
    await mkdir(directory, { recursive: true, mode: 0o750 });
    const targetPath = path.join(directory, filename);
    try {
      await rename(filePath, targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await copyFile(filePath, targetPath);
      await unlink(filePath);
    }
  } else {
    await verifyS3Credentials();
    await s3.upload({
      Bucket: BUCKET,
      Key: `homepage-intro/${filename}`,
      Body: createReadStream(filePath),
      ContentType: contentType.toLowerCase(),
    }).promise();
    await unlink(filePath);
  }

  return { videoUrl: `/api/v1/public/homepage/videos/${filename}` };
}

export async function getHomepageVideoDelivery(filename: string) {
  if (!/^[0-9a-f-]{36}\.(mp4|webm|ogg|ogv)$/i.test(filename)) throw Object.assign(new Error('Video not found'), { statusCode: 404 });
  if (videoStorageProvider() === 'local') {
    const filePath = path.join(localVideoDirectory(), filename);
    try { await access(filePath); }
    catch {
      // Preserve playback for videos uploaded by the older direct-to-S3 flow.
      return { type: 'redirect' as const, url: await getDownloadUrl(`homepage-intro/${filename}`) };
    }
    return { type: 'file' as const, filePath };
  }
  return { type: 'redirect' as const, url: await getDownloadUrl(`homepage-intro/${filename}`) };
}

interface HomepageRow {
  published_content: HomepageContent;
  draft_content: HomepageContent | null;
  updated_at: string;
  published_at: string;
  version: number;
}

export async function getPublishedHomepage(): Promise<HomepageContent> {
  const { rows: [row] } = await query<{ published_content: HomepageContent }>(
    'SELECT published_content FROM public_homepage_content WHERE singleton=TRUE',
  );
  return row?.published_content ? homepageContentSchema.parse(row.published_content) : DEFAULT_HOMEPAGE_CONTENT;
}

export async function getHomepageForOwner() {
  const { rows: [row] } = await query<HomepageRow>(
    `SELECT published_content,draft_content,updated_at,published_at,version
     FROM public_homepage_content WHERE singleton=TRUE`,
  );
  return {
    published: homepageContentSchema.parse(row?.published_content || DEFAULT_HOMEPAGE_CONTENT),
    draft: row?.draft_content ? homepageContentSchema.parse(row.draft_content) : null,
    updatedAt: row?.updated_at || null,
    publishedAt: row?.published_at || null,
    version: row?.version || 1,
  };
}

export async function saveHomepageDraft(input: unknown, actorId: UUID) {
  const draft = homepageContentSchema.parse(input);
  const { rows: [row] } = await query<{ version: number }>(
    `INSERT INTO public_homepage_content(singleton,published_content,draft_content,updated_by,updated_at)
     VALUES(TRUE,$1::jsonb,$1::jsonb,$2,NOW())
     ON CONFLICT(singleton) DO UPDATE SET draft_content=EXCLUDED.draft_content,updated_by=EXCLUDED.updated_by,updated_at=NOW()
     RETURNING version`,
    [JSON.stringify(draft), actorId],
  );
  return { saved: true, version: row?.version || 1 };
}

export async function publishHomepageDraft(actorId: UUID) {
  return transaction(async (client) => {
    const { rows: [current] } = await client.query<{ published_content: HomepageContent; draft_content: HomepageContent | null; version: number; published_by: UUID | null; published_at: string }>(
      'SELECT published_content,draft_content,version,published_by,published_at FROM public_homepage_content WHERE singleton=TRUE FOR UPDATE',
    );
    if (!current?.draft_content) throw Object.assign(new Error('Save a Home page draft before publishing it'), { statusCode: 409 });
    const content = homepageContentSchema.parse(current.draft_content);
    await client.query(
      `INSERT INTO public_content_revisions(page_slug,version,content,published_by,published_at)
       VALUES('homepage',$1,$2::jsonb,$3,$4) ON CONFLICT(page_slug,version) DO NOTHING`,
      [current.version, JSON.stringify(current.published_content), current.published_by, current.published_at],
    );
    const { rows: [published] } = await client.query(
      `UPDATE public_homepage_content SET published_content=$1::jsonb,draft_content=NULL,published_by=$2,
         published_at=NOW(),updated_by=$2,updated_at=NOW(),version=version+1
       WHERE singleton=TRUE RETURNING published_at,version`,
      [JSON.stringify(content), actorId],
    );
    await client.query(
      `INSERT INTO audit_log(actor_id,actor_role,action,entity_type,new_value)
       VALUES($1,'SUPER_ADMIN','HOMEPAGE_PUBLISHED','public_homepage_content',$2::jsonb)`,
      [actorId, JSON.stringify({ version: published.version })],
    );
    return { published: true, publishedAt: published.published_at, version: published.version };
  });
}

export async function getHomepageHistory() {
  const { rows } = await query<{ version: number; published_at: string; published_by_name: string | null }>(
    `SELECT r.version,r.published_at,u.name AS published_by_name
     FROM public_content_revisions r LEFT JOIN users u ON u.id=r.published_by
     WHERE r.page_slug='homepage' ORDER BY r.version DESC LIMIT 30`,
  );
  return rows;
}

export async function restoreHomepageVersion(version: number, actorId: UUID) {
  return transaction(async (client) => {
    const { rows: [revision] } = await client.query<{ content: HomepageContent }>(
      `SELECT content FROM public_content_revisions WHERE page_slug='homepage' AND version=$1`, [version],
    );
    if (!revision) throw Object.assign(new Error('Published version not found'), { statusCode: 404 });
    const draft = homepageContentSchema.parse(revision.content);
    await client.query(
      `UPDATE public_homepage_content SET draft_content=$1::jsonb,updated_by=$2,updated_at=NOW() WHERE singleton=TRUE`,
      [JSON.stringify(draft), actorId],
    );
    await client.query(
      `INSERT INTO audit_log(actor_id,actor_role,action,entity_type,new_value)
       VALUES($1,'SUPER_ADMIN','HOMEPAGE_VERSION_RESTORED','public_homepage_content',$2::jsonb)`,
      [actorId, JSON.stringify({ sourceVersion: version, stagedAsDraft: true })],
    );
    return { restored: true, sourceVersion: version, stagedAsDraft: true };
  });
}
