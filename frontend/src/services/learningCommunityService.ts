import api from './api';
import type { ApiEnvelope } from '@/types/api';

export type LearningCommunityPurpose='CONCEPT_SUPPORT'|'INTERVENTION'|'COMPETITION_PREP'|'TEACHER_LED';
export interface LearningCommunity {
  id:string;name:string;description?:string|null;kind:string;scope:string;school_id?:string|null;class_id?:string|null;owner_id:string;status:string;max_members:number;
  learning_purpose:LearningCommunityPurpose;subject_code?:string|null;concept_id?:string|null;competition_exam_id?:string|null;intervention_id?:string|null;
  concept_code?:string|null;concept_name?:string|null;concept_name_hi?:string|null;member_count?:number|string|null;membership_role?:string|null;
}
export const getLearningCommunities=(search='')=>api.get<ApiEnvelope<LearningCommunity[]>>('/learning-communities',{params:{search}});
export const createLearningCommunity=(payload:{name:string;description?:string|null;classId:string;subjectCode:string;conceptId?:string|null;purpose:'CONCEPT_SUPPORT'|'COMPETITION_PREP'|'TEACHER_LED';maxMembers?:number})=>api.post<ApiEnvelope<LearningCommunity>>('/learning-communities',payload);
export const createLearningCommunityPost=(groupId:string,payload:{body:string;conceptId?:string|null;resourceId?:string|null;assessmentId?:string|null;label?:string|null})=>api.post<ApiEnvelope<Record<string,unknown>>>(`/learning-communities/${groupId}/learning-posts`,payload);
