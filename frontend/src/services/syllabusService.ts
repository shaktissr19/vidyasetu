import api from './api';
import type { ApiEnvelope } from '@/types/api';
export interface SyllabusRow {gradeCode:string;subjectId:string;unit?:string;chapter:string;topic:string;topicHi?:string;learningOutcome:string;evidenceUrl?:string|null;pageReference:string;}
export interface SyllabusVersion {id:string;board_code?:string;academic_year:string;medium?:'en'|'hi';title:string;status?:string;publication_status?:'DRAFT'|'REVIEWED'|'PUBLISHED'|'ARCHIVED';version_number?:number;source_url:string;verified_at?:string|null;}
export interface SyllabusTopic {is_retired?:boolean;coverage?:{published_count:number;formats:string[];difficulties:string[]};id:string;title:string;title_hi?:string;chapter:string;chapter_id?:string|null;unit?:string;unit_id?:string;subject:string;subject_id:string;grade_code:string;concept_id:string;learning_outcome:string;evidence_url:string|null;page_reference:string;sort_order?:number;studentStatus?:SyllabusProgressStatus;teacherStatus?:'NOT_COVERED'|'IN_PROGRESS'|'COVERED';resources?:{id:string;title:string;title_hi?:string;resource_type:string;difficulty?:string;locked:boolean;completed:boolean}[];assets?:Array<{id:string;asset_id:string;title:string;title_hi?:string;resource_type:string;asset_kind:string;locked:boolean;completed:boolean;rights_status:string;source_name?:string|null;reviewed_by_name?:string|null;reviewed_at?:string|null;transcript?:string|null;captions_url?:string|null;is_offline_ready?:boolean}>;assessments?:Array<{id:string;public_slug?:string|null;title:string;assessment_type:string;locked:boolean}>;availableResources?:number;completedResources?:number;learningComplete?:boolean;mastered?:boolean;masteryPct?:number|null;}
export interface SyllabusOptions {drafts:{id:string;title:string;subject_id:string;grade_codes:string[]}[];boards:{id:string;code:string;name:string}[];grades:{id:string;code:string;name:string}[];subjects:{id:string;code:string;name:string}[];versions:SyllabusVersion[];}
export interface StudentSyllabus {profile:{boardCode:string|null;gradeCode:string;academicYear:string;language:string;schoolLinked:boolean};options:{boards:SyllabusOptions['boards'];grades:SyllabusOptions['grades'];subjects:SyllabusOptions['subjects'];years:string[]};version:SyllabusVersion|null;topics:SyllabusTopic[];subjectProgress?:Record<string,{total:number;completed:number;percent:number}>;summary:{totalTopics:number;coveredTopics:number;completedTopics:number;masteredTopics:number}|null;}
export const getSyllabusOptions=()=>api.get<ApiEnvelope<SyllabusOptions>>('/admin/syllabus/options');
export const getSyllabusDetail=(id:string)=>api.get<ApiEnvelope<{version:SyllabusVersion;topics:SyllabusTopic[];history:{action:string;created_at:string;operation:string}[]}>>(`/admin/syllabus/${id}`);
export const importSyllabus=(input:{boardCode:string;academicYear:string;title:string;sourceUrl?:string|null;rows:SyllabusRow[]})=>api.post<ApiEnvelope<{id:string}>>('/admin/syllabus/import',input);
export const changeSyllabusStatus=(id:string,status:string,note:string)=>api.patch(`/admin/syllabus/${id}/status`,{status,note});
export const getMySyllabus=()=>api.get<ApiEnvelope<StudentSyllabus>>('/student/syllabus');
export const saveSyllabusProfile=(input:{boardCode:string;gradeCode:string;academicYear:string;language:string})=>api.put('/student/syllabus/profile',input);

export const linkSyllabusResource=(topicId:string,resourceId:string)=>api.post(`/admin/syllabus/topics/${topicId}/resources`,{resourceId});

export const retireSyllabusTopic=(id:string,retired:boolean,note:string)=>api.patch(`/admin/syllabus/topics/${id}`,{retired,note});

export interface StructuredOutlineRow {unit:string;chapter:string;topic:string;pageReference:string;confidence:'high'|'review';}
export interface SyllabusDocument {id:string;board_code:string;board_name?:string;academic_year:string;grade_code:string|null;grade_name:string|null;subject_id:string|null;subject_name:string|null;title:string;language:string;medium?:'en'|'hi';source_url:string;source_publisher:string|null;page_count:number;outline:{page:number;text:string}[];structured_outline?:StructuredOutlineRow[];original_filename?:string|null;detected_grade_code?:string|null;detected_subject?:string|null;topic_count?:number;status:string;redistribution_allowed:boolean;downloadUrl?:string|null;version_id?:string|null;publication_status?:string|null;review_note?:string|null;}
export const getSyllabusDocuments=(params:Record<string,string>,admin=false)=>api.get<ApiEnvelope<SyllabusDocument[]>>(`${admin?'/admin':'/student'}/syllabus/documents`,{params});
export const getSyllabusDocument=(id:string,admin=false)=>api.get<ApiEnvelope<SyllabusDocument>>(`${admin?'/admin':'/student'}/syllabus/documents/${id}`);
export const getSyllabusSources=()=>api.get<ApiEnvelope<{boardCode:string;name:string;url:string;note:string}[]>>('/admin/syllabus/documents/sources');
export interface SyllabusImportResult {documentId:string;versionId:string|null;detectedGradeCode:string|null;detectedSubject:string|null;requiresScope:boolean;structuredOutline:StructuredOutlineRow[];}
export const uploadSyllabusDocument=(form:FormData)=>api.post<ApiEnvelope<SyllabusImportResult>>('/admin/syllabus/documents/upload',form,{timeout:120000});
export const uploadSyllabusDocuments=(form:FormData)=>api.post<ApiEnvelope<{results:Array<{file:string;ok:boolean;data?:SyllabusImportResult;error?:string}>;successful:number;failed:number}>>('/admin/syllabus/documents/upload-batch',form,{timeout:180000});
export const importSyllabusDocument=(input:Record<string,string>)=>api.post<ApiEnvelope<SyllabusImportResult>>('/admin/syllabus/documents/import',input,{timeout:180000});
export const updateSyllabusDocument=(id:string,input:{gradeCode:string|null;subjectId:string|null;title:string;sourceUrl:string|null;language:'en'|'hi'})=>api.patch(`/admin/syllabus/documents/${id}`,input);
export const deleteSyllabusDocument=(id:string)=>api.delete(`/admin/syllabus/documents/${id}`);
export const reviewSyllabusDocument=(id:string,input:{status:'APPROVED'|'REJECTED';note:string;redistributionAllowed:boolean;redistributionEvidenceUrl?:string})=>api.patch(`/admin/syllabus/documents/${id}/review`,input);
export const updateSyllabusVersion=(id:string,input:{title?:string;sourceUrl?:string|null})=>api.patch(`/admin/syllabus/${id}`,input);
export const changeSyllabusScope=(id:string,input:{gradeCode:string;subjectId:string;retired:boolean;note:string})=>api.patch(`/admin/syllabus/${id}/scopes`,input);
export const updateSyllabusTopic=(id:string,input:{unit:string;chapter:string;topic:string;topicHi?:string|null;learningOutcome?:string|null;pageReference:string;sortOrder?:number})=>api.patch(`/admin/syllabus/topics/${id}/details`,input);
export const addSyllabusTopic=(versionId:string,input:{gradeCode:string;subjectId:string;unit:string;chapter:string;topic:string;topicHi?:string|null;learningOutcome?:string|null;pageReference:string;sortOrder?:number})=>api.post(`/admin/syllabus/versions/${versionId}/topics`,input);

export type SyllabusProgressStatus='NOT_STARTED'|'IN_PROGRESS'|'COMPLETED'|'REVISED';
export const getSyllabusProgress=()=>api.get<ApiEnvelope<{topic_id:string;student_status:SyllabusProgressStatus;updated_at:string}[]>>('/student/syllabus/progress');
export const updateSyllabusProgress=(topicId:string,status:SyllabusProgressStatus)=>api.put('/student/syllabus/topics/'+topicId+'/progress',{status});
export const getParentSyllabusProgress=(studentId:string)=>api.get<ApiEnvelope<{studentId:string;boardCode:string|null;gradeCode:string;academicYear?:string;subjects:Array<{subject:string;total_topics:number;completed_topics:number;progress_pct:number|null}>}>>(`/parent/learning-insights/${studentId}/syllabus`);

export interface FrameworkImportRow {boardCode:string;medium:'en'|'hi';academicYear:string;gradeCode:string;subjectCode:string;unit:string;chapter:string;topic:string;topicHi?:string;learningOutcome:string;sourceUrl:string;pageReference:string;sortOrder:number|string;}
export interface FrameworkPreview {valid:boolean;rowCount:number;boardCode:string;medium:string;academicYear:string;classes:string[];subjectScopes:number;errors:{row:number;message:string}[];}
export const previewFrameworkImport=(rows:FrameworkImportRow[])=>api.post<ApiEnvelope<FrameworkPreview>>('/admin/syllabus/framework/preview',{rows});
export const commitFrameworkImport=(rows:FrameworkImportRow[],sourceHashes?:string[])=>api.post('/admin/syllabus/framework/import',{rows,sourceHashes});
export interface FrameworkCoverageRow {board_code:string;academic_year:string;medium:string;grade_code:string;subject_code:string;unit_count:number;chapter_count:number;topic_count:number;publication_status:string;}
export const getFrameworkCoverage=()=>api.get<ApiEnvelope<FrameworkCoverageRow[]>>('/admin/syllabus/framework/coverage');

export const attachFrameworkEvidence=(versionId:string,documentId:string)=>api.post('/admin/syllabus/framework/'+versionId+'/evidence',{documentId});

export interface OfficialSyllabusDocument {title:string;url:string;sourceHost:string;classGuess:string|null;subjectGuess:string|null;}
export interface ExtractedSyllabusOutline {title:string;sourceUrl:string;sourceHash:string;pageCount:number;reviewRequired:true;notice:string;rows:{unit:string;chapter:string;topic:string;pageReference:string;confidence:'high'|'review'}[];}
export const discoverOfficialSyllabusDocuments=(input:{boardCode:string;sourceUrl:string;classCode?:string;subject?:string})=>api.post<ApiEnvelope<{sourceUrl:string;sourceHost:string;documents:OfficialSyllabusDocument[];message?:string}>>('/admin/syllabus/framework/discover',input,{timeout:30000});
export const extractOfficialSyllabusOutline=(boardCode:string,pdfUrl:string)=>api.post<ApiEnvelope<ExtractedSyllabusOutline>>('/admin/syllabus/framework/extract',{boardCode,pdfUrl},{timeout:90000});
