import api from './api';
import type { ApiEnvelope } from '@/types/api';
import type { LearningMediaUpload } from './learningMediaService';

export type PipelineMediaKind = 'ARTICLE' | 'VIDEO' | 'AUDIO' | 'IMAGE' | 'INTERACTIVE' | 'PDF' | 'WORKSHEET' | 'QUESTION_PAPER' | 'DOCUMENT' | 'EXTERNAL_LINK';
export type PipelineDeliveryMode = 'EXTERNAL_LINK' | 'OFFICIAL_EMBED' | 'LICENSED_REHOST' | 'VIDYASETU_ORIGINAL';
export type PipelineLicence = 'VIDYASETU_ORIGINAL' | 'CC_BY' | 'CC_BY_SA' | 'CC_BY_NC' | 'CC_BY_NC_SA' | 'CC_BY_ND' | 'CC_BY_NC_ND' | 'PUBLIC_DOMAIN' | 'EXTERNAL_LINK_ONLY' | 'PERMISSION_GRANTED' | 'OTHER';
export type PipelineCategory = 'ACADEMIC' | 'MOTIVATION' | 'STUDY_SKILLS' | 'WORK_ETHIC' | 'SOCIAL_RESPONSIBILITY' | 'LIFE_SKILLS' | 'WELLBEING' | 'CAREER_AWARENESS' | 'DIGITAL_CITIZENSHIP';
export type PipelineVisibility = 'PUBLIC' | 'REGISTERED' | 'CLASS_ONLY' | 'SCHOOL_ONLY';
export type PipelineAccess = 'PUBLIC' | 'REGISTERED' | 'SUBSCRIBER';

export interface PipelineGradeOption { code: string; name: string; short_name?: string | null; stage: string; class_number?: number | null; sort_order: number; }
export interface PipelineBoardOption { code: string; name: string; short_name?: string | null; board_type: string; state?: string | null; }
export interface PipelineSourceOption {
  code: string; name: string; source_kind: string; homepage_url?: string | null; default_license: string;
  attribution_required: boolean; allow_rehosting_default: boolean; allow_adaptation_default: boolean;
  requires_item_license_check: boolean; notes?: string | null;
}
export interface PipelineOptions {
  subjects: Array<{ id: string; name: string; code: string }>;
  concepts: Array<{ id: string; name: string; name_hi?: string; chapter_title?: string; subject_id?: string; grade_code: string }>;
  grades: PipelineGradeOption[];
  boards: PipelineBoardOption[];
  sources: PipelineSourceOption[];
  categories: Array<{ code: PipelineCategory; label: string }>;
  mediaKinds: PipelineMediaKind[];
  deliveryModes: Array<{ code: PipelineDeliveryMode; label: string; description: string }>;
  policy: string;
}

export interface PipelineQueueItem {
  id: string; title: string; source_url: string; source_item_id?: string | null; media_kind: PipelineMediaKind;
  category: PipelineCategory; delivery_mode: PipelineDeliveryMode; rights_status: string; licence_candidate?: PipelineLicence | null;
  licence_url?: string | null; attribution_text?: string | null; rights_evidence_url?: string | null;
  grade_code?: string | null; status: string; created_at: string; reviewed_at?: string | null;
  imported_resource_id?: string | null; source_code: string; source_name: string; asset_id?: string | null;
  metadata?: Partial<StagePipelinePayload>; embed_url?: string | null; discovered_media_kind?: string | null; discovered_embed_url?: string | null; discovered_thumbnail_url?: string | null; class_hint?: string | null; board_hint?: string | null; subject_hint?: string | null;
  storage_key?: string | null; mime_type?: string | null; byte_size?: number | null;
  processing_status?: string | null; asset_verified_at?: string | null; resource_id?: string | null;
}

export interface StagePipelinePayload {
  intakeId?: string;
  titleHi?: string | null; difficulty?: 'EASY' | 'MODERATE' | 'ADVANCED' | null; conceptIds?: string[];
  journeyStage?: 'SEE' | 'UNDERSTAND' | 'DO' | 'PRACTISE' | 'APPLY' | 'REVISE';
  transcript?: string | null; altText?: string | null;
  sourceCode: string; title: string; mediaKind: PipelineMediaKind; deliveryMode: PipelineDeliveryMode;
  sourceUrl?: string | null; sourceItemId?: string | null; embedUrl?: string | null; storageKey?: string | null;
  mimeType?: string | null; byteSize?: number | null; checksumSha256?: string | null;
  licenceCandidate?: PipelineLicence | null; licenceUrl?: string | null; attributionText?: string | null;
  rightsEvidenceUrl?: string | null; category: PipelineCategory; gradeCodes: string[]; boardCodes: string[]; subjectId?: string | null;
  subjectLabel?: string | null; chapterLabel?: string | null; topicLabel?: string | null; language?: string | null;
  visibility: PipelineVisibility; accessRequirement: PipelineAccess; bodyMarkdown?: string | null;
  bodyMarkdownHi?: string | null; summary?: string | null; summaryHi?: string | null; thumbnailUrl?: string | null;
  durationSecs?: number | null;
}

export interface VerifyPipelineRightsPayload {
  licenceCandidate: PipelineLicence; licenceUrl?: string | null; attributionText: string;
  rightsEvidenceUrl?: string | null; reviewerNote?: string | null;
}

const base = '/admin/learning/pipeline';
export const getLearningPipelineOptions = () => api.get<ApiEnvelope<PipelineOptions>>(`${base}/options`);
export const getLearningPipelineQueue = () => api.get<ApiEnvelope<PipelineQueueItem[]>>(`${base}/queue`);
export const stageLearningPipelineContent = (payload: StagePipelinePayload) => api.post<ApiEnvelope<{ intakeId: string; assetId: string; status: string; message: string }>>(`${base}/stage`, payload);
export const verifyLearningPipelineRights = (intakeId: string, payload: VerifyPipelineRightsPayload) => api.patch<ApiEnvelope<PipelineQueueItem>>(`${base}/intake/${intakeId}/rights`, payload);
export const approveLearningPipelineIntake = (intakeId: string, note?: string | null) => api.post<ApiEnvelope<PipelineQueueItem>>(`${base}/intake/${intakeId}/approve`, { note });
export const materialiseLearningPipelineIntake = (intakeId: string) => api.post<ApiEnvelope<{ resourceId: string; intakeId: string; reviewStatus: string; message: string }>>(`${base}/intake/${intakeId}/materialise`);

export async function uploadLearningPipelineFile(file: File): Promise<LearningMediaUpload & { byteSize: number }> {
  if (file.size > 500 * 1024 * 1024) throw new Error('Learning media must be 500 MB or smaller');
  const upload = await api.post<ApiEnvelope<LearningMediaUpload>>('/admin/learning/media/upload-url', {
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
  }).then((response) => response.data.data);
  const response = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!response.ok) throw new Error(`Media upload failed (${response.status})`);
  return { ...upload, byteSize: file.size };
}

export const updateLearningPipelineDraft = (resourceId: string,payload: StagePipelinePayload) => api.patch<ApiEnvelope<{ resourceId: string; message: string }>>(`${base}/resources/${resourceId}/details`,payload);
