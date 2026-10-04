import api from './api';
import type { ApiEnvelope } from '@/types/api';
export interface SyllabusRow {gradeCode:string;subjectId:string;chapter:string;topic:string;topicHi?:string;learningOutcome:string;evidenceUrl:string;pageReference:string;}
export interface SyllabusVersion {id:string;board_code?:string;academic_year:string;title:string;status?:string;source_url:string;verified_at?:string|null;}
export interface SyllabusTopic {is_retired?:boolean;coverage?:{published_count:number;formats:string[];difficulties:string[]};id:string;title:string;title_hi?:string;chapter:string;subject:string;subject_id:string;grade_code:string;concept_id:string;learning_outcome:string;evidence_url:string;page_reference:string;resources?:{id:string;title:string;title_hi?:string;resource_type:string;difficulty?:string;locked:boolean;completed:boolean}[];availableResources?:number;completedResources?:number;learningComplete?:boolean;mastered?:boolean;masteryPct?:number|null;}
export interface SyllabusOptions {drafts:{id:string;title:string;subject_id:string;grade_codes:string[]}[];boards:{id:string;code:string;name:string}[];grades:{id:string;code:string;name:string}[];subjects:{id:string;code:string;name:string}[];versions:SyllabusVersion[];}
export interface StudentSyllabus {profile:{boardCode:string|null;gradeCode:string;academicYear:string;language:string;schoolLinked:boolean};options:{boards:SyllabusOptions['boards'];grades:SyllabusOptions['grades'];years:string[]};version:SyllabusVersion|null;topics:SyllabusTopic[];summary:{totalTopics:number;coveredTopics:number;completedTopics:number;masteredTopics:number}|null;}
export const getSyllabusOptions=()=>api.get<ApiEnvelope<SyllabusOptions>>('/admin/syllabus/options');
export const getSyllabusDetail=(id:string)=>api.get<ApiEnvelope<{version:SyllabusVersion;topics:SyllabusTopic[];history:{action:string;created_at:string;operation:string}[]}>>(`/admin/syllabus/${id}`);
export const importSyllabus=(input:{boardCode:string;academicYear:string;title:string;sourceUrl:string;rows:SyllabusRow[]})=>api.post<ApiEnvelope<{id:string}>>('/admin/syllabus/import',input);
export const changeSyllabusStatus=(id:string,status:string,note:string)=>api.patch(`/admin/syllabus/${id}/status`,{status,note});
export const getMySyllabus=()=>api.get<ApiEnvelope<StudentSyllabus>>('/student/syllabus');
export const saveSyllabusProfile=(input:{boardCode:string;gradeCode:string;academicYear:string;language:string})=>api.put('/student/syllabus/profile',input);

export const linkSyllabusResource=(topicId:string,resourceId:string)=>api.post(`/admin/syllabus/topics/${topicId}/resources`,{resourceId});

export const retireSyllabusTopic=(id:string,retired:boolean,note:string)=>api.patch(`/admin/syllabus/topics/${id}`,{retired,note});
