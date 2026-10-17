import api from './api';
import type { ApiEnvelope } from '@/types/api';

export interface GovernanceAsset {asset_id:string;resource_id:string;title:string;resource_type:string;review_status:string;subject_id:string|null;rights_status:string;version_number:number;mapped_topics:number;checklist:Record<string,string>;moderation_state:string;}
export interface GovernanceTopic {topic_id:string;topic:string;board_code:string;academic_year:string;medium:string;class_name:string;subject:string;chapter:string;formats:Record<string,number>;}
export interface TopicAnalytics {topic_id:string;topic:string;subject:string;starts:number;watch_time_secs:number;completion_rate:number|null;quiz_average:number|null;doubts:number;}
const base='/admin/learning/governance';
export const getGovernanceAssets=()=>api.get<ApiEnvelope<GovernanceAsset[]>>(`${base}/assets`);
export const getGovernanceOptions=()=>api.get<ApiEnvelope<{subjects:Array<{id:string;code:string;name:string}>;reviewers:Array<{id:string;name:string|null}>}>>(`${base}/options`);
export const getGovernanceCoverage=()=>api.get<ApiEnvelope<GovernanceTopic[]>>(`${base}/assets/coverage`);
export const getTopicAnalytics=()=>api.get<ApiEnvelope<TopicAnalytics[]>>(`${base}/assets/analytics`);
export const mapTopicAsset=(assetId:string,input:{topicId:string;medium:'en'|'hi';visibility:'PUBLIC'|'CLASS_RESTRICTED'|'SCHOOL_PRIVATE';schoolId?:string|null})=>api.post(`${base}/assets/${assetId}/mappings`,input);
export interface AssetMapImportRow {fileName:string;topicId:string;medium:'en'|'hi';visibility:'PUBLIC'|'CLASS_RESTRICTED'|'SCHOOL_PRIVATE';schoolId?:string|null}
export const previewAssetMapImport=(rows:AssetMapImportRow[])=>api.post(`${base}/assets/map-import/preview`,{rows});
export const commitAssetMapImport=(rows:AssetMapImportRow[])=>api.post(`${base}/assets/map-import/commit`,{rows});
export const setAssetReviewer=(subjectId:string,reviewerId:string)=>api.put(`${base}/reviewer-assignments`,{subjectId,reviewerId});
export const setAssetChecklist=(assetId:string,gateCode:string,status:'PASS'|'NOT_APPLICABLE'|'FAIL',note='Reviewed')=>api.put(`/school/learning-reviews/${assetId}/checklist/${gateCode}`,{status,note});
export const setAssetTakedown=(assetId:string,reason:string)=>api.post(`${base}/assets/${assetId}/takedown`,{reason});
export const restoreAsset=(assetId:string,reason:string)=>api.post(`${base}/assets/${assetId}/restore`,{reason});
export const getAssetHistory=(assetId:string)=>api.get(`${base}/assets/${assetId}/history`);
export const saveAssetVersion=(assetId:string)=>api.post(`${base}/assets/${assetId}/snapshot`,{});
export const getReviewerQueue=()=>api.get<ApiEnvelope<Array<{asset_id:string;title:string;resource_type:string;subject_id:string;rights_status:string;checklist:Record<string,string>}>>>('/school/learning-reviews/queue');
export const getReviewerWorkspace=()=>api.get<ApiEnvelope<Array<{class_id:string;class_name:string;section:string|null;subject_code:string;subject_name:string;topic_id:string;topic:string;chapter:string|null;teacher_status:'NOT_COVERED'|'IN_PROGRESS'|'COVERED'}>>>('/school/learning-reviews/workspace');
export const markClassCoverage=(classId:string,topicId:string,status:'NOT_COVERED'|'IN_PROGRESS'|'COVERED')=>api.put('/school/learning-reviews/class-coverage',{classId,topicId,status});
