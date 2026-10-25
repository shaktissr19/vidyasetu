import { createHash, randomUUID } from 'crypto';
import { query, transaction } from '../config/db';
import { s3, BUCKET, getDownloadUrl, deleteObject } from '../config/s3';
import { downloadLicensedAsset, scanImportedAsset } from './learningSourceAcquisition.service';
import { getStudentContext, canonicalGradeCode } from './studentCanonicalLearning.service';
import { extractSyllabusPdfBytes, type ExtractedOutlineRow } from './syllabusAutoFetch.service';
import { importSyllabus, updateSyllabusVersion } from './syllabus.service';

const fail=(message:string,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const maxBytes=25*1024*1024;
export interface SyllabusPdfMetadata {boardCode:string;academicYear:string;gradeCode?:string|null;subjectId?:string|null;title?:string|null;language:string;sourceUrl?:string|null;sourcePublisher?:string|null;}
const safeName=(value:string)=>value.replace(/[^a-zA-Z0-9._ -]+/g,'_').replace(/\s+/g,' ').trim().slice(0,240)||'syllabus.pdf';

const officialSources=[
 {boardCode:'CBSE',name:'CBSE Academic curriculum (IX–XII)',url:'https://cbseacademic.nic.in/curriculum_2027.html',note:'Academic curriculum index for Classes 9–12. Classes 1–8 are not covered by this syllabus index.',supportedGrades:['CLASS_9','CLASS_10','CLASS_11','CLASS_12']},
 {boardCode:'CBSE',name:'CBSE Skill Education curriculum (VI–XII)',url:'https://cbseacademic.nic.in/skill-education-curriculum.html',note:'Official 2026–27 index includes grade-specific Kaushal Bodh PDFs for Classes 6–8 and skill subjects for Classes 9–12. This does not cover the full core curriculum for Classes 1–8.',supportedGrades:['CLASS_6','CLASS_7','CLASS_8','CLASS_9','CLASS_10','CLASS_11','CLASS_12']},
 {boardCode:'CISCE',name:'CISCE ICSE regulations and syllabus (IX–X)',url:'https://cisce.org/icse-regulations-and-syllabuses-2027/',note:'Official ICSE Year 2027 index for Classes 9–10.',supportedGrades:['CLASS_9','CLASS_10']},
 {boardCode:'CISCE',name:'CISCE ISC regulations and syllabus (XI–XII)',url:'https://cisce.org/isc-regulations-and-syllabuses-2027/',note:'Official ISC Year 2027 index for Classes 11–12.',supportedGrades:['CLASS_11','CLASS_12']},
 {boardCode:'UPMSP',name:'UPMSP syllabus (IX–XII)',url:'https://upmsp.edu.in/Board_Syllabus.aspx',note:'Official syllabus PDF index for Classes 9–12.',supportedGrades:['CLASS_9','CLASS_10','CLASS_11','CLASS_12']},
 {boardCode:'NIOS',name:'NIOS secondary course curriculum (IX–X)',url:'https://rchyderabad.nios.ac.in/secondary-courses-material.html',note:'Official NIOS secondary-course curriculum links for Classes 9–10.',supportedGrades:['CLASS_9','CLASS_10']},
 {boardCode:'NIOS',name:'NIOS senior secondary course curriculum (XI–XII)',url:'https://rcpune.nios.ac.in/senior-secondary-courses-material.html',note:'Official NIOS senior-secondary curriculum links for Classes 11–12.',supportedGrades:['CLASS_11','CLASS_12']},
];

async function subjectFromDetection(name:string|null){
 if(!name)return null;const aliases=name==='Mathematics'?['mathematics','maths','math']:name==='Social Science'?['social science','social studies']: [name.toLowerCase()];
 const {rows:[subject]}=await query(`SELECT id,name FROM subjects WHERE is_active=TRUE AND (LOWER(name)=ANY($1::text[]) OR LOWER(code)=ANY($1::text[])) ORDER BY CASE WHEN LOWER(name)=$2 THEN 0 ELSE 1 END LIMIT 1`,[aliases,name.toLowerCase()]);return subject||null;
}
async function subjectName(id:string|null|undefined){if(!id)return null;const {rows:[subject]}=await query('SELECT id,name FROM subjects WHERE id=$1::uuid AND is_active=TRUE',[id]);if(!subject)throw fail('Choose an active subject.');return subject;}
function sameSubject(selected:string,detected:string){const normalize=(value:string)=>value.toLowerCase().replace(/mathematics|maths/g,'math').replace(/social studies/g,'social science').replace(/[^a-z0-9]/g,'');return normalize(selected)===normalize(detected);}

async function createStructuredDraft(document:{id:string;board_code:string;academic_year:string;grade_code:string|null;subject_id:string|null;title:string;medium:string;source_url:string|null;checksum_sha256:string;structured_outline:ExtractedOutlineRow[]},actor:string){
 if(!document.grade_code||!document.subject_id||!document.structured_outline.length)return null;
 const rows=document.structured_outline.map((row,index)=>({gradeCode:document.grade_code!,subjectId:document.subject_id!,unit:row.unit,chapter:row.chapter,topic:row.topic,learningOutcome:'[AUTO_EXTRACTED] Verify this topic against the official source during academic review.',evidenceUrl:document.source_url,pageReference:row.pageReference,sortOrder:index+1}));
 const version=await importSyllabus({boardCode:document.board_code,academicYear:document.academic_year,title:document.title,sourceUrl:document.source_url,sourceHash:document.checksum_sha256,sourceDocumentId:document.id,medium:document.medium==='hi'?'hi':'en',rows},actor);
 return version.id as string;
}
async function removeLinkedDrafts(documentId:string,actor:string){
 return transaction(async client=>{
  const {rows:versions}=await client.query(`SELECT cv.id,COALESCE(cv.publication_status,cv.status) AS state FROM curriculum_versions cv WHERE cv.source_document_id=$1::uuid OR EXISTS(SELECT 1 FROM curriculum_version_evidence e WHERE e.curriculum_version_id=cv.id AND e.syllabus_document_id=$1::uuid) FOR UPDATE`,[documentId]);
  if(versions.some(version=>version.state!=='DRAFT'))throw fail('This document is linked to a reviewed or published syllabus. Archive that syllabus instead of deleting its evidence.',409);
  for(const version of versions){
   const {rows:affected}=await client.query('SELECT topic_id FROM curriculum_topic_evidence WHERE syllabus_document_id=$1::uuid',[documentId]);
   const affectedTopicIds=affected.map(item=>item.topic_id as string);
   await client.query('DELETE FROM curriculum_topic_evidence WHERE syllabus_document_id=$1::uuid',[documentId]);
   const {rows:orphaned}=affectedTopicIds.length?await client.query('SELECT id FROM curriculum_topics ct WHERE id=ANY($1::uuid[]) AND NOT EXISTS(SELECT 1 FROM curriculum_topic_evidence e WHERE e.topic_id=ct.id)',[affectedTopicIds]):{rows:[]};
   const orphanedTopicIds=orphaned.map(item=>item.id as string);
   const {rows:concepts}=orphanedTopicIds.length?await client.query('SELECT concept_id FROM curriculum_topic_concepts WHERE topic_id=ANY($1::uuid[])',[orphanedTopicIds]):{rows:[]};
   if(concepts.length)await client.query(`UPDATE learning_concepts SET is_active=FALSE,registry_status='DRAFT_FOR_ACADEMIC_REVIEW' WHERE id=ANY($1::uuid[])`,[concepts.map(item=>item.concept_id)]);
   if(orphanedTopicIds.length) await client.query('DELETE FROM curriculum_topics WHERE id=ANY($1::uuid[])',[orphanedTopicIds]);
   await client.query(`UPDATE curriculum_topics ct SET source_document_id=(SELECT e.syllabus_document_id FROM curriculum_topic_evidence e WHERE e.topic_id=ct.id ORDER BY e.attached_at,e.syllabus_document_id LIMIT 1) WHERE ct.source_document_id=$1::uuid AND EXISTS(SELECT 1 FROM curriculum_topic_evidence e WHERE e.topic_id=ct.id)`,[documentId]);
   await client.query(`DELETE FROM curriculum_chapters cc WHERE cc.curriculum_unit_id IN(SELECT cu.id FROM curriculum_units cu JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id WHERE cs.curriculum_version_id=$1::uuid) AND NOT EXISTS(SELECT 1 FROM curriculum_topics ct WHERE ct.chapter_id=cc.id)`,[version.id]);
   await client.query(`DELETE FROM curriculum_units cu WHERE cu.curriculum_subject_id IN(SELECT id FROM curriculum_subjects WHERE curriculum_version_id=$1::uuid) AND NOT EXISTS(SELECT 1 FROM curriculum_topics ct WHERE ct.curriculum_unit_id=cu.id)`,[version.id]);
   await client.query(`DELETE FROM curriculum_subjects cs WHERE cs.curriculum_version_id=$1::uuid AND NOT EXISTS(SELECT 1 FROM curriculum_units cu WHERE cu.curriculum_subject_id=cs.id)`,[version.id]);
   await client.query('DELETE FROM curriculum_version_evidence WHERE curriculum_version_id=$1::uuid AND syllabus_document_id=$2::uuid',[version.id,documentId]);
   const {rows:[remaining]}=await client.query('SELECT EXISTS(SELECT 1 FROM curriculum_subjects WHERE curriculum_version_id=$1::uuid) AS present',[version.id]);
   if(remaining.present)await client.query('UPDATE curriculum_versions SET source_document_id=NULL WHERE id=$1::uuid AND source_document_id=$2::uuid',[version.id,documentId]);
   else await client.query('DELETE FROM curriculum_versions WHERE id=$1::uuid',[version.id]);
  }
  await client.query(`INSERT INTO audit_log(actor_id,action,entity_type,entity_id,new_value) VALUES($1::uuid,'DELETE','syllabus_document',$2::uuid,$3::jsonb)`,[actor,documentId,JSON.stringify({operation:'REMOVE_LINKED_DRAFTS',versionIds:versions.map(item=>item.id)})]);
  return versions.map(item=>item.id as string);
 });
}

async function save(input:{boardCode:string;academicYear:string;gradeCode?:string|null;subjectId?:string|null;title?:string|null;language:string;sourceUrl?:string|null;bytes:Buffer;actor:string;originalFilename:string;sourcePublisher?:string|null}){
 if(input.bytes.length>maxBytes)throw fail('PDF exceeds the 25 MB syllabus document limit.');
 const originalFilename=safeName(input.originalFilename);const parsed=await extractSyllabusPdfBytes(input.bytes,input.sourceUrl||null,originalFilename);
 await scanImportedAsset(input.bytes);
 const {rows:[board]}=await query('SELECT id,code FROM education_boards WHERE code=$1 AND is_active=TRUE',[input.boardCode]);if(!board)throw fail('Choose an active education board.');
 const selectedSubject=await subjectName(input.subjectId);const detectedSubject=await subjectFromDetection(parsed.detectedSubject);
 if(input.gradeCode&&parsed.detectedGradeCode&&input.gradeCode!==parsed.detectedGradeCode)throw fail(`The PDF says ${parsed.detectedGradeCode.replace('CLASS_','Class ')}, but ${input.gradeCode.replace('CLASS_','Class ')} was selected. Correct the class before importing.`,409);
 if(selectedSubject&&parsed.detectedSubject&&!sameSubject(selectedSubject.name,parsed.detectedSubject))throw fail(`The PDF appears to be ${parsed.detectedSubject}, but ${selectedSubject.name} was selected. Correct the subject before importing.`,409);
 const gradeCode=input.gradeCode||parsed.detectedGradeCode;const subject=selectedSubject||detectedSubject;const title=(input.title||parsed.title||originalFilename.replace(/\.pdf$/i,'')).trim().slice(0,240);
 const checksum=createHash('sha256').update(input.bytes).digest('hex');const key=`syllabus/documents/${randomUUID()}-${originalFilename}`;
 await s3.putObject({Bucket:BUCKET,Key:key,Body:input.bytes,ContentType:'application/pdf',ContentDisposition:`inline; filename="${originalFilename.replace(/"/g,'')}"`,Metadata:{sha256:checksum}}).promise();
 try{
  const {rows:[row]}=await query(`INSERT INTO syllabus_documents(board_id,academic_year,grade_code,subject_id,title,language,medium,source_url,source_publisher,source_checked_at,storage_key,checksum_sha256,byte_size,page_count,extracted_text,outline,structured_outline,detected_grade_code,detected_subject,original_filename,redistribution_allowed,redistribution_evidence_url,rights_reviewed_by,rights_reviewed_at,uploaded_by)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17,$18,$19,FALSE,NULL,NULL,NULL,$20)
   ON CONFLICT DO NOTHING RETURNING id,status,page_count,created_at`,[board.id,input.academicYear,gradeCode||null,subject?.id||null,title,input.language,input.language.toLowerCase().startsWith('hi')?'hi':'en',input.sourceUrl||null,input.sourcePublisher||null,key,checksum,input.bytes.length,parsed.pageCount,'',JSON.stringify(parsed.outline),JSON.stringify(parsed.rows),parsed.detectedGradeCode,parsed.detectedSubject,originalFilename,input.actor]);
  if(!row){await deleteObject(key).catch(()=>undefined);throw fail('This exact document is already in the library for this board and year.',409);}
  let versionId:string|null=null;
  try{versionId=await createStructuredDraft({id:row.id,board_code:board.code,academic_year:input.academicYear,grade_code:gradeCode||null,subject_id:subject?.id||null,title,medium:input.language.toLowerCase().startsWith('hi')?'hi':'en',source_url:input.sourceUrl||null,checksum_sha256:checksum,structured_outline:parsed.rows},input.actor);}catch(error){await query('DELETE FROM syllabus_documents WHERE id=$1::uuid',[row.id]);throw fail(`The PDF was extracted, but its structured Draft could not be saved: ${(error as Error).message}`,500);}
  await query(`INSERT INTO audit_log(actor_id,action,entity_type,entity_id,new_value) VALUES($1::uuid,'CREATE','syllabus_document',$2::uuid,$3::jsonb)`,[input.actor,row.id,JSON.stringify({operation:'UPLOAD_AND_EXTRACT',versionId,gradeCode,subjectId:subject?.id||null,topicCount:parsed.rows.length})]);
  return {...row,documentId:row.id,versionId,outline:parsed.outline,structuredOutline:parsed.rows,detectedGradeCode:parsed.detectedGradeCode,detectedSubject:parsed.detectedSubject,requiresScope:!gradeCode||!subject,redistributionAllowed:false};
 }catch(error){await deleteObject(key).catch(()=>undefined);throw error;}
}

export async function uploadSyllabusPdf(file:Express.Multer.File,meta:SyllabusPdfMetadata,actor:string){if(!file)throw fail('Choose a PDF file.');if(file.mimetype!=='application/pdf'||file.buffer.subarray(0,5).toString()!=='%PDF-')throw fail('Upload a real PDF document.');return save({...meta,bytes:file.buffer,actor,originalFilename:file.originalname});}
export async function uploadSyllabusPdfs(files:Express.Multer.File[],meta:SyllabusPdfMetadata,actor:string){if(!files.length)throw fail('Choose at least one PDF file.');const results=[];for(const file of files){try{results.push({file:file.originalname,ok:true,data:await uploadSyllabusPdf(file,{...meta,title:files.length===1?meta.title:null},actor)});}catch(error){results.push({file:file.originalname,ok:false,error:(error as Error).message});}}return {results,successful:results.filter(item=>item.ok).length,failed:results.filter(item=>!item.ok).length};}
export async function importSyllabusPdf(meta:SyllabusPdfMetadata&{pdfUrl:string},actor:string){const hosts=process.env.SYLLABUS_IMPORT_ALLOWED_HOSTS||'cbseacademic.nic.in,cisce.org,upmsp.edu.in,ncert.nic.in,rchyderabad.nios.ac.in,rcpune.nios.ac.in';const asset=await downloadLicensedAsset(meta.pdfUrl,'QUESTION_PAPER',hosts);if(asset.mime!=='application/pdf')throw fail('The official link did not return a PDF file. Paste a direct PDF link.');return save({...meta,sourceUrl:meta.pdfUrl,bytes:asset.bytes,actor,originalFilename:decodeURIComponent(new URL(meta.pdfUrl).pathname.split('/').pop()||'official-syllabus.pdf')});}

export async function listSyllabusDocuments(filters:{boardCode?:string;gradeCode?:string;subjectId?:string;academicYear?:string;query?:string},student=false,studentUserId?:string){
 if(student){if(!studentUserId)throw fail('Student identity is required.',403);const context=await getStudentContext(studentUserId);if(!context.board_code)return [];filters={...filters,boardCode:context.board_code,gradeCode:canonicalGradeCode(context)};}
 const {rows}=await query(`SELECT d.id,eb.code AS board_code,eb.name AS board_name,d.academic_year,d.grade_code,g.name AS grade_name,d.subject_id,s.name AS subject_name,d.title,d.language,d.medium,d.source_url,d.source_publisher,d.source_published_at,d.page_count,d.original_filename,d.detected_grade_code,d.detected_subject,jsonb_array_length(d.structured_outline) AS topic_count,
  CASE WHEN $5::text IS NULL THEN '[]'::jsonb ELSE (SELECT COALESCE(jsonb_agg(hit.item),'[]'::jsonb) FROM (SELECT item FROM jsonb_array_elements(d.outline) AS e(item) WHERE item->>'text' ILIKE '%'||$5||'%' LIMIT 3) hit) END AS outline,
  d.status,d.redistribution_allowed,d.created_at,cv.id AS version_id,cv.publication_status
  FROM syllabus_documents d JOIN education_boards eb ON eb.id=d.board_id LEFT JOIN education_grade_levels g ON g.code=d.grade_code LEFT JOIN subjects s ON s.id=d.subject_id LEFT JOIN LATERAL(SELECT linked.id,linked.publication_status FROM curriculum_versions linked LEFT JOIN curriculum_version_evidence e ON e.curriculum_version_id=linked.id WHERE linked.source_document_id=d.id OR e.syllabus_document_id=d.id ORDER BY linked.created_at DESC LIMIT 1) cv ON TRUE
  WHERE d.deleted_at IS NULL AND ($1::text IS NULL OR eb.code=$1) AND ($2::text IS NULL OR d.grade_code IS NULL OR d.grade_code=$2) AND ($3::uuid IS NULL OR d.subject_id=$3) AND ($4::text IS NULL OR d.academic_year=$4) AND ($5::text IS NULL OR d.extracted_text ILIKE '%'||$5||'%' OR d.title ILIKE '%'||$5||'%') AND (NOT $6 OR d.status='APPROVED') AND d.status<>'REJECTED'
  ORDER BY eb.sort_order,d.academic_year DESC,d.grade_code NULLS FIRST,s.name NULLS FIRST,d.title LIMIT 500`,[filters.boardCode||null,filters.gradeCode||null,filters.subjectId||null,filters.academicYear||null,filters.query?.slice(0,160)||null,student]);return rows;
}
export async function syllabusDocumentDetail(id:string,admin=false,studentUserId?:string){
 const {rows:[doc]}=await query(`SELECT d.id,d.board_id,eb.code AS board_code,d.academic_year,d.grade_code,d.subject_id,d.title,d.language,d.medium,d.source_url,d.source_publisher,d.page_count,d.outline,d.structured_outline,d.detected_grade_code,d.detected_subject,d.original_filename,d.status,d.redistribution_allowed,d.redistribution_evidence_url,d.review_note,d.storage_key,cv.id AS version_id,cv.publication_status FROM syllabus_documents d JOIN education_boards eb ON eb.id=d.board_id LEFT JOIN LATERAL(SELECT linked.id,linked.publication_status FROM curriculum_versions linked LEFT JOIN curriculum_version_evidence e ON e.curriculum_version_id=linked.id WHERE linked.source_document_id=d.id OR e.syllabus_document_id=d.id ORDER BY linked.created_at DESC LIMIT 1) cv ON TRUE WHERE d.id=$1::uuid AND d.deleted_at IS NULL`,[id]);
 if(!doc)throw fail('Syllabus document not found.',404);if(!admin&&doc.status!=='APPROVED')throw fail('Syllabus document not found.',404);if(!admin){if(!studentUserId)throw fail('Student identity is required.',403);const context=await getStudentContext(studentUserId);if(!context.board_code||doc.board_code!==context.board_code||(doc.grade_code&&doc.grade_code!==canonicalGradeCode(context)))throw fail('Syllabus document not found.',404);}
 const {storage_key,...safeDoc}=doc;return {...safeDoc,downloadUrl:admin||doc.redistribution_allowed?await getDownloadUrl(storage_key,admin?600:300):null};
}
export async function updateSyllabusDocument(id:string,input:{gradeCode?:string|null;subjectId?:string|null;title:string;sourceUrl?:string|null;language:string},actor:string){
 const {rows:[doc]}=await query(`SELECT d.*,eb.code AS board_code,cv.id AS version_id FROM syllabus_documents d JOIN education_boards eb ON eb.id=d.board_id LEFT JOIN LATERAL(SELECT linked.id FROM curriculum_versions linked LEFT JOIN curriculum_version_evidence e ON e.curriculum_version_id=linked.id WHERE linked.source_document_id=d.id OR e.syllabus_document_id=d.id ORDER BY linked.created_at DESC LIMIT 1) cv ON TRUE WHERE d.id=$1::uuid AND d.deleted_at IS NULL`,[id]);if(!doc)throw fail('Syllabus document not found.',404);
 const selected=await subjectName(input.subjectId);if(input.gradeCode&&doc.detected_grade_code&&input.gradeCode!==doc.detected_grade_code)throw fail(`The PDF was detected as ${doc.detected_grade_code.replace('CLASS_','Class ')}. Correct the selected class.`,409);if(selected&&doc.detected_subject&&!sameSubject(selected.name,doc.detected_subject))throw fail(`The PDF was detected as ${doc.detected_subject}. Correct the selected subject.`,409);
 if(doc.version_id)await removeLinkedDrafts(id,actor);
 const {rows:[updated]}=await query(`UPDATE syllabus_documents SET grade_code=$2,subject_id=$3::uuid,title=$4,source_url=$5,language=$6,medium=$7 WHERE id=$1::uuid RETURNING *`,[id,input.gradeCode||null,input.subjectId||null,input.title,input.sourceUrl||null,input.language,input.language.toLowerCase().startsWith('hi')?'hi':'en']);
 const versionId=await createStructuredDraft({id,board_code:doc.board_code,academic_year:doc.academic_year,grade_code:updated.grade_code,subject_id:updated.subject_id,title:updated.title,medium:updated.medium,source_url:updated.source_url,checksum_sha256:updated.checksum_sha256,structured_outline:updated.structured_outline},actor);
 if(versionId&&input.sourceUrl)await updateSyllabusVersion(versionId,{title:input.title,sourceUrl:input.sourceUrl},actor);
 return {...updated,versionId};
}
export async function deleteSyllabusDocument(id:string,actor:string){const {rows:[doc]}=await query('SELECT id,storage_key,status FROM syllabus_documents WHERE id=$1::uuid AND deleted_at IS NULL',[id]);if(!doc)throw fail('Syllabus document not found.',404);if(doc.status==='APPROVED')throw fail('Approved evidence cannot be deleted. Reject it and archive its syllabus first.',409);await removeLinkedDrafts(id,actor);await query(`UPDATE syllabus_documents SET deleted_at=NOW(),deleted_by=$2::uuid,status='REJECTED',review_note='Deleted by platform administrator' WHERE id=$1::uuid`,[id,actor]);await deleteObject(doc.storage_key).catch(()=>undefined);return {id,deleted:true};}
export async function reviewSyllabusDocument(id:string,input:{status:'APPROVED'|'REJECTED';note:string;redistributionAllowed:boolean;redistributionEvidenceUrl?:string|null},actor:string){
 if(input.redistributionAllowed&&!input.redistributionEvidenceUrl)throw fail('Add evidence of redistribution rights before enabling student PDF downloads.');const {rows:[doc]}=await query('SELECT source_url FROM syllabus_documents WHERE id=$1::uuid AND deleted_at IS NULL',[id]);if(!doc)throw fail('Syllabus document not found.',404);if(input.status==='APPROVED'&&!doc.source_url)throw fail('Add the official source URL before approving this syllabus document.');
 const {rows:[r]}=await query(`UPDATE syllabus_documents SET status=$2,review_note=$3,reviewed_by=$4::uuid,reviewed_at=NOW(),redistribution_allowed=$5,redistribution_evidence_url=CASE WHEN $5 THEN $6 ELSE NULL END,rights_reviewed_by=CASE WHEN $5 THEN $4::uuid ELSE NULL END,rights_reviewed_at=CASE WHEN $5 THEN NOW() ELSE NULL END WHERE id=$1::uuid AND deleted_at IS NULL RETURNING id,status,reviewed_at,redistribution_allowed`,[id,input.status,input.note,actor,input.redistributionAllowed,input.redistributionEvidenceUrl||null]);if(!r)throw fail('Syllabus document not found.',404);await query("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,new_value) VALUES($1::uuid,'UPDATE','syllabus_document',$2::uuid,$3::jsonb)",[actor,id,JSON.stringify({status:r.status,note:input.note,redistributionAllowed:r.redistribution_allowed,rightsEvidenceUrl:input.redistributionAllowed?input.redistributionEvidenceUrl:null})]);return r;
}
export function syllabusSourceDirectory(){return officialSources;}
