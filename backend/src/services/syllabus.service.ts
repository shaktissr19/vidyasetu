import type { PoolClient, QueryResultRow } from 'pg';
import { randomUUID } from 'crypto';
import { query, transaction } from '../config/db';
import { getStudentContext, canonicalGradeCode, resourceScopeSql } from './studentCanonicalLearning.service';
import { getLearningAccessContext } from './learningEntitlement.service';
const fail = (message:string,statusCode=400) => Object.assign(new Error(message),{statusCode});
interface TopicRow extends QueryResultRow {is_retired:boolean;id:string;concept_id:string;grade_code:string;title:string;chapter:string;subject_id:string;learning_outcome:string;}
interface ResourceRow extends QueryResultRow {concept_id:string;id:string;title:string;title_hi:string|null;resource_type:string;difficulty:string|null;access_requirement:string;completed:boolean;}
export interface SyllabusRow { gradeCode:string; subjectId:string; chapter:string; topic:string; topicHi?:string; learningOutcome:string; evidenceUrl:string; pageReference:string; }
export interface SyllabusImport { boardCode:string; academicYear:string; title:string; sourceUrl:string; rows:SyllabusRow[]; }
export async function syllabusReady() {
 const {rows:[r]}=await query("SELECT to_regclass('public.curriculum_topic_concepts') IS NOT NULL AS ready");
 if(!r?.ready) throw fail('Syllabus workspace requires migration 053',503);
}
export async function syllabusOptions() {
 await syllabusReady();
 const [boards,grades,subjects,versions,drafts]=await Promise.all([
 query('SELECT id,code,name FROM education_boards WHERE is_active=TRUE ORDER BY sort_order,name'),
 query('SELECT id,code,name FROM education_grade_levels WHERE is_active=TRUE ORDER BY sort_order'),
 query('SELECT id,code,name FROM subjects ORDER BY name'),
 query('SELECT cv.*,eb.code AS board_code,eb.name AS board_name FROM curriculum_versions cv JOIN education_boards eb ON eb.id=cv.board_id ORDER BY cv.academic_year DESC,eb.name'),
 query("SELECT lr.id,lr.title,lr.subject_id,ARRAY_AGG(g.code) FILTER(WHERE g.code IS NOT NULL) AS grade_codes FROM learning_resources lr LEFT JOIN learning_resource_grades rg ON rg.resource_id=lr.id LEFT JOIN education_grade_levels g ON g.id=rg.grade_id WHERE lr.review_status='DRAFT' AND lr.category='ACADEMIC' GROUP BY lr.id ORDER BY lr.updated_at DESC LIMIT 500")]);
 return {boards:boards.rows,grades:grades.rows,subjects:subjects.rows,versions:versions.rows,drafts:drafts.rows};
}
async function audit(client:PoolClient,actor:string,id:string,action:string,value:unknown) {
 await client.query("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,new_value) VALUES($1::uuid,$2,'curriculum_version',$3::uuid,$4::jsonb)",[actor,action,id,JSON.stringify(value)]);
}
export async function importSyllabus(input:SyllabusImport,actor:string) {
 await syllabusReady();
 return transaction(async client=>{
 const {rows:[board]}=await client.query('SELECT id FROM education_boards WHERE code=$1 AND is_active=TRUE',[input.boardCode]);
 if(!board) throw fail('Select an active board');
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`syllabus:${board.id}:${input.academicYear}`]);
 const {rows:[previous]}=await client.query('SELECT * FROM curriculum_versions WHERE board_id=$1 AND academic_year=$2 ORDER BY version_number DESC LIMIT 1 FOR UPDATE',[board.id,input.academicYear]);
 const versionNumber=previous ? Number(previous.version_number||1)+(previous.publication_status==='PUBLISHED'||previous.status==='ACTIVE'?1:0) : 1;
 const {rows:[version]}=await client.query(`INSERT INTO curriculum_versions(board_id,academic_year,title,status,source_url,version_number,publication_status,uploaded_by)
 VALUES($1,$2,$3,'DRAFT',$4,$5,'DRAFT',$6)
 ON CONFLICT(board_id,academic_year,version_number) DO UPDATE SET title=EXCLUDED.title,source_url=EXCLUDED.source_url,verified_at=NULL,verified_by=NULL,publication_status='DRAFT',uploaded_by=EXCLUDED.uploaded_by RETURNING id`,[board.id,input.academicYear,input.title,input.sourceUrl,versionNumber,actor]);
 for(const [index,row] of input.rows.entries()) {
 const {rows:[grade]}=await client.query('SELECT id,class_number FROM education_grade_levels WHERE code=$1 AND is_active=TRUE',[row.gradeCode]);
 const {rows:[subject]}=await client.query('SELECT id,code,name FROM subjects WHERE id=$1::uuid',[row.subjectId]);
 if(!grade || !subject) throw fail(`Row ${index+1}: invalid grade or subject`);
 const {rows:[cs]}=await client.query(`INSERT INTO curriculum_subjects(curriculum_version_id,subject_id,class_name,display_name,subject_code) VALUES($1,$2,$3,$4,$5)
 ON CONFLICT(curriculum_version_id,class_name,display_name) DO UPDATE SET subject_id=EXCLUDED.subject_id RETURNING id`,[version.id,subject.id,row.gradeCode,subject.name,subject.code]);
 const {rows:[unit]}=await client.query(`INSERT INTO curriculum_units(curriculum_subject_id,title,sort_order) VALUES($1,$2,$3) ON CONFLICT(curriculum_subject_id,title) DO UPDATE SET title=EXCLUDED.title RETURNING id`,[cs.id,row.chapter,index]);
 const {rows:[oldTopic]}=await client.query('SELECT learning_outcome FROM curriculum_topics WHERE curriculum_unit_id=$1 AND title=$2',[unit.id,row.topic]);
 const {rows:[topic]}=await client.query(`INSERT INTO curriculum_topics(curriculum_unit_id,title,title_hi,learning_outcome,evidence_url,page_reference,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7)
 ON CONFLICT(curriculum_unit_id,title) DO UPDATE SET title_hi=EXCLUDED.title_hi,learning_outcome=EXCLUDED.learning_outcome,evidence_url=EXCLUDED.evidence_url,page_reference=EXCLUDED.page_reference RETURNING id`,[unit.id,row.topic,row.topicHi || null,row.learningOutcome,row.evidenceUrl,row.pageReference,index]);
 const {rows:[mapped]}=await client.query('SELECT concept_id FROM curriculum_topic_concepts WHERE topic_id=$1',[topic.id]);
 if(!mapped || (oldTopic && oldTopic.learning_outcome!==row.learningOutcome)) {
 if(mapped) await client.query('DELETE FROM curriculum_topic_concepts WHERE topic_id=$1',[topic.id]);
 const {rows:[concept]}=await client.query(`INSERT INTO learning_concepts(code,name,name_hi,academic_year,grade_id,subject_id,subject_code,chapter_title,registry_source,registry_status,sequence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'DRAFT_FOR_ACADEMIC_REVIEW',$10) RETURNING id`,[`SYLLABUS_${randomUUID()}`,row.topic,row.topicHi || null,input.academicYear,grade.id,subject.id,subject.code,row.chapter,row.evidenceUrl.slice(0,220),index]);
 await client.query('INSERT INTO curriculum_topic_concepts(topic_id,concept_id) VALUES($1,$2)',[topic.id,concept.id]);
 } else await client.query("UPDATE learning_concepts SET name=$2,name_hi=$3,registry_status='DRAFT_FOR_ACADEMIC_REVIEW' WHERE id=$1",[mapped.concept_id,row.topic,row.topicHi || null]);
 }
 await audit(client,actor,version.id,'UPDATE',{operation:'IMPORT_SYLLABUS_DRAFT',...input});
 return version;
 });
}
export async function syllabusDetail(versionId:string) {
 await syllabusReady();
 const {rows:[version]}=await query('SELECT cv.*,eb.code AS board_code FROM curriculum_versions cv JOIN education_boards eb ON eb.id=cv.board_id WHERE cv.id=$1::uuid',[versionId]);
 if(!version) throw fail('Syllabus not found',404);
 const {rows:topics}=await query<TopicRow>(`SELECT ct.*,cu.title AS chapter,cs.subject_id,cs.display_name AS subject,cs.class_name AS grade_code,ctc.concept_id
 FROM curriculum_topics ct JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id
 LEFT JOIN curriculum_topic_concepts ctc ON ctc.topic_id=ct.id WHERE cs.curriculum_version_id=$1 AND cs.is_active=TRUE ORDER BY cs.class_name,cs.sort_order,cu.sort_order,ct.sort_order`,[versionId]);
 const {rows:counts}=await query(`SELECT ctc.topic_id,COUNT(DISTINCT lr.id)::int AS published_count,ARRAY_AGG(DISTINCT lr.resource_type::text) AS formats,ARRAY_AGG(DISTINCT to_jsonb(lr)->>'difficulty') AS difficulties FROM curriculum_topic_concepts ctc JOIN learning_resource_concepts lrc ON lrc.concept_id=ctc.concept_id JOIN learning_resources lr ON lr.id=lrc.resource_id AND lr.review_status='PUBLISHED' WHERE ctc.topic_id=ANY($1::uuid[]) GROUP BY ctc.topic_id`,[topics.map(t=>t.id)]);
 const {rows:history}=await query("SELECT action,created_at,new_value->>'operation' AS operation FROM audit_log WHERE entity_type='curriculum_version' AND entity_id=$1::uuid ORDER BY created_at DESC LIMIT 20",[versionId]);
 return {version,topics:topics.map(t=>({...t,coverage:counts.find(c=>c.topic_id===t.id)||{published_count:0,formats:[],difficulties:[]}})),history};
}
export async function changeSyllabusStatus(id:string,status:'DRAFT'|'ACTIVE'|'ARCHIVED',note:string,actor:string) {
 await syllabusReady();
 return transaction(async client=>{
 const {rows:[version]}=await client.query('SELECT * FROM curriculum_versions WHERE id=$1::uuid FOR UPDATE',[id]);
 if(!version) throw fail('Syllabus not found',404);
 if(status==='ACTIVE' || status==='PUBLISHED') {
 const {rows:[check]}=await client.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE ct.evidence_url IS NOT NULL AND LENGTH(ct.page_reference)>0 AND LENGTH(ct.learning_outcome)>0 AND ctc.concept_id IS NOT NULL)::int AS ready FROM curriculum_topics ct JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id LEFT JOIN curriculum_topic_concepts ctc ON ctc.topic_id=ct.id WHERE cs.curriculum_version_id=$1 AND cs.is_active=TRUE AND ct.is_retired=FALSE`,[id]);
 if(!version.source_url || !check.total || check.ready!==check.total) throw fail('Every topic needs source/page evidence, learning outcome and a concept mapping before approval');
 }
 const publicationStatus=status==='ACTIVE'||status==='PUBLISHED'?'PUBLISHED':status==='REVIEWED'?'REVIEWED':status==='ARCHIVED'?'ARCHIVED':'DRAFT';
 const legacyStatus=publicationStatus==='PUBLISHED'?'ACTIVE':publicationStatus==='ARCHIVED'?'ARCHIVED':'DRAFT';
 if(publicationStatus==='PUBLISHED') await client.query(`UPDATE curriculum_versions SET publication_status='ARCHIVED',status='ARCHIVED' WHERE board_id=$1 AND academic_year=$2 AND medium=$3 AND id<>$4 AND publication_status='PUBLISHED'`,[version.board_id,version.academic_year,version.medium,id]);
 await client.query(`UPDATE curriculum_versions SET status=$2,publication_status=$3,verified_at=CASE WHEN $3='PUBLISHED' THEN NOW() ELSE verified_at END,verified_by=CASE WHEN $3 IN ('REVIEWED','PUBLISHED') THEN $4::uuid ELSE verified_by END,reviewed_by=CASE WHEN $3='REVIEWED' THEN $4::uuid ELSE reviewed_by END,published_by=CASE WHEN $3='PUBLISHED' THEN $4::uuid ELSE published_by END,published_at=CASE WHEN $3='PUBLISHED' THEN NOW() ELSE published_at END,review_note=$5 WHERE id=$1::uuid`,[id,legacyStatus,publicationStatus,actor,note]);
 await client.query(`UPDATE learning_concepts SET registry_status=$2 WHERE id IN(SELECT ctc.concept_id FROM curriculum_topic_concepts ctc JOIN curriculum_topics ct ON ct.id=ctc.topic_id JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id WHERE cs.curriculum_version_id=$1 AND ct.is_retired=FALSE)`,[id,status==='ACTIVE'?'ACADEMICALLY_VERIFIED':'DRAFT_FOR_ACADEMIC_REVIEW']);
 await audit(client,actor,id,'UPDATE',{operation:'SYLLABUS_STATUS',from:version.publication_status||version.status,to:publicationStatus,note});
 return {id,status};
 });
}
export async function saveLearningPreference(userId:string,input:{boardCode:string;gradeCode:string;academicYear:string;language:string}) {
 await syllabusReady();
 const student=await getStudentContext(userId);
 if(student.school_id && (student.board_code!==input.boardCode || canonicalGradeCode(student)!==input.gradeCode)) throw fail('School-linked students use their school-assigned board and class',403);
 const {rows:[board]}=await query('SELECT id FROM education_boards WHERE code=$1 AND is_active=TRUE',[input.boardCode]);
 const {rows:[grade]}=await query('SELECT id FROM education_grade_levels WHERE code=$1 AND is_active=TRUE',[input.gradeCode]);
 if(!board || !grade) throw fail('Select an active board and class');
 await query(`INSERT INTO student_learning_preferences(student_id,board_id,grade_id,academic_year,language) VALUES($1,$2,$3,$4,$5) ON CONFLICT(student_id) DO UPDATE SET board_id=EXCLUDED.board_id,grade_id=EXCLUDED.grade_id,academic_year=EXCLUDED.academic_year,language=EXCLUDED.language,updated_at=NOW()`,[student.student_id,board.id,grade.id,input.academicYear,input.language]);
 return {saved:true};
}
export async function studentSyllabus(userId:string) {
 await syllabusReady();
 const [student,access]=await Promise.all([getStudentContext(userId),getLearningAccessContext(userId)]);
 const {rows:[preference]}=await query('SELECT academic_year,language FROM student_learning_preferences WHERE student_id=$1',[student.student_id]);
 const today=new Date();const start=today.getUTCMonth()<3?today.getUTCFullYear()-1:today.getUTCFullYear();
 const year=preference?.academic_year || `${start}-${String(start+1).slice(-2)}`;
 const grade=canonicalGradeCode(student);const board=student.board_code;
 const options=await syllabusOptions();
 const {rows:[version]}=await query("SELECT * FROM curriculum_versions WHERE board_id=(SELECT id FROM education_boards WHERE code=$1) AND academic_year=$2 AND publication_status='PUBLISHED' AND verified_at IS NOT NULL",[board,year]);
 const profile={boardCode:board,gradeCode:grade,academicYear:year,language:preference?.language || 'en',schoolLinked:Boolean(student.school_id)};
 const studentOptions={boards:options.boards,grades:options.grades,subjects:options.subjects,years:[...new Set([year,...options.versions.filter(v=>v.status==='ACTIVE'&&v.verified_at).map(v=>v.academic_year)])]};
 if(!version) return {profile,options:studentOptions,version:null,topics:[],summary:null};
 const detail=await syllabusDetail(version.id);
 const topics=detail.topics.filter(t=>t.grade_code===grade && !t.is_retired);
 const ids=topics.map(t=>t.concept_id).filter(Boolean);
 const {rows:resources}=ids.length?await query<ResourceRow>(`SELECT lrc.concept_id,lr.id,lr.title,lr.title_hi,lr.resource_type,to_jsonb(lr)->>'difficulty' AS difficulty,lr.access_requirement,COALESCE(p.is_completed,FALSE) AS completed FROM learning_resource_concepts lrc JOIN learning_resources lr ON lr.id=lrc.resource_id LEFT JOIN student_learning_resource_progress p ON p.resource_id=lr.id AND p.student_id=$1 WHERE lrc.concept_id=ANY($2::uuid[]) AND lr.review_status='PUBLISHED' AND lr.visibility IN('PUBLIC','REGISTERED','CLASS_ONLY') AND ${resourceScopeSql(3,4,5)}`,[student.student_id,ids,board,grade,/^CLASS_/.test(grade)?Number(grade.slice(6)):null]):{rows:[]};
 const {rows:mastery}=ids.length?await query('SELECT concept_id,state,mastery_attempts,mastery_pct FROM student_concept_progress WHERE student_id=$1 AND concept_id=ANY($2::uuid[])',[student.student_id,ids]):{rows:[]};
 const result=topics.map(t=>{
 const material=resources.filter(r=>r.concept_id===t.concept_id).map(r=>({...r,locked:r.access_requirement==='SUBSCRIBER'&&!access.subscriberAccess}));
 const available=material.filter(r=>!r.locked);const completed=available.filter(r=>r.completed).length;
 const evidence=mastery.find(m=>m.concept_id===t.concept_id);
 return {...t,resources:material,completedResources:completed,availableResources:available.length,learningComplete:available.length>0&&completed===available.length,mastered:evidence?.state==='MASTERED'&&evidence.mastery_attempts>0,masteryPct:evidence && evidence.mastery_attempts>0?evidence.mastery_pct:null};
 });
 return {profile,options:studentOptions,version:{id:version.id,title:version.title,academic_year:version.academic_year,source_url:version.source_url},topics:result,summary:{totalTopics:result.length,coveredTopics:result.filter(t=>t.resources.length>0).length,completedTopics:result.filter(t=>t.learningComplete).length,masteredTopics:result.filter(t=>t.mastered).length}};
}

export async function linkTopicResource(topicId:string,resourceId:string,actor:string) {
 await syllabusReady();
 return transaction(async client=>{
 const {rows:[topic]}=await client.query(`SELECT ctc.concept_id,cs.subject_id,cs.class_name,cv.board_id,cv.id AS version_id FROM curriculum_topic_concepts ctc JOIN curriculum_topics ct ON ct.id=ctc.topic_id JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id JOIN curriculum_versions cv ON cv.id=cs.curriculum_version_id WHERE ct.id=$1::uuid AND cv.status='ACTIVE' AND cv.verified_at IS NOT NULL AND ct.is_retired=FALSE FOR SHARE OF cv`,[topicId]);
 if(!topic) throw fail('Choose a topic from a verified active syllabus');
 const {rows:[resource]}=await client.query('SELECT * FROM learning_resources WHERE id=$1::uuid FOR UPDATE',[resourceId]);
 if(!resource || resource.subject_id!==topic.subject_id) throw fail('Resource must have the same canonical subject');
 if(resource.review_status==='PUBLISHED') throw fail('Return published content to DRAFT in Library before changing curriculum mapping',409);
 if(resource.review_status!=='DRAFT') throw fail('Only draft resources can be mapped; re-review content after changing its mapping');
 const {rows:[scope]}=await client.query(`SELECT 1 FROM learning_resource_grades rg JOIN education_grade_levels g ON g.id=rg.grade_id WHERE rg.resource_id=$1 AND g.code=$2`,[resourceId,topic.class_name]);
 if(!scope) throw fail('Resource grade must match the syllabus topic');
 const {rows:[board]}=await client.query("SELECT 1 FROM learning_resource_boards rb JOIN education_boards b ON b.id=rb.board_id WHERE rb.resource_id=$1 AND (rb.board_id=$2 OR b.code='COMMON')",[resourceId,topic.board_id]);
 if(!board) throw fail('Resource board must match the syllabus or use approved common-board scope');
 const {rows:previousConcepts}=await client.query('SELECT * FROM learning_resource_concepts WHERE resource_id=$1',[resourceId]);
 await client.query(`INSERT INTO learning_resource_revisions(resource_id,actor_id,snapshot) VALUES($1,$2,$3::jsonb)`,[resourceId,actor,JSON.stringify({operation:'SYLLABUS_MAPPING',resource,relations:{concepts:previousConcepts},topicId})]);
 await client.query(`INSERT INTO learning_resource_concepts(resource_id,concept_id,journey_stage) VALUES($1,$2,'UNDERSTAND') ON CONFLICT DO NOTHING`,[resourceId,topic.concept_id]);
 await client.query("UPDATE learning_quality_gate_reviews SET status='PENDING',note='Syllabus mapping changed; review again',reviewer_id=NULL,reviewed_at=NULL WHERE entity_type='RESOURCE' AND entity_id=$1",[resourceId]);
 await audit(client,actor,topic.version_id,'UPDATE',{operation:'LINK_DRAFT_RESOURCE',topicId,resourceId});
 return {mapped:true};
 });
}

export async function retireSyllabusTopic(topicId:string,retired:boolean,note:string,actor:string) {
 await syllabusReady();
 return transaction(async client=>{
 const {rows:[topic]}=await client.query(`SELECT cv.id AS version_id,cv.status,ctc.concept_id FROM curriculum_topics ct JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id JOIN curriculum_versions cv ON cv.id=cs.curriculum_version_id LEFT JOIN curriculum_topic_concepts ctc ON ctc.topic_id=ct.id WHERE ct.id=$1::uuid FOR UPDATE OF cv`,[topicId]);
 if(!topic) throw fail('Syllabus topic not found',404);
 if(topic.status!=='DRAFT') throw fail('Return the syllabus to draft before removing or restoring topics',409);
 await client.query('UPDATE curriculum_topics SET is_retired=$2 WHERE id=$1',[topicId,retired]);
 await client.query("UPDATE learning_concepts SET is_active=$2,registry_status='DRAFT_FOR_ACADEMIC_REVIEW' WHERE id=$1",[topic.concept_id,!retired]);
 await audit(client,actor,topic.version_id,'UPDATE',{operation:retired?'RETIRE_TOPIC':'RESTORE_TOPIC',topicId,note});
 return {topicId,retired};
 });
}
