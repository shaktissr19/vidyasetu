import { createHash } from 'crypto';
import { query, transaction } from '../config/db';
import { importSyllabus, type SyllabusRow } from './syllabus.service';

export interface FrameworkCsvRow {
  boardCode:string; medium:'en'|'hi'; academicYear:string; gradeCode:string; subjectCode:string;
  unit:string; chapter:string; topic:string; topicHi?:string; learningOutcome:string; sourceUrl:string; pageReference:string; sortOrder:number|string;
}
const problem=(message:string,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const https=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const officialHost=(value:string)=>{
  try{
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password) return false;
    const hosts=(process.env.SYLLABUS_IMPORT_ALLOWED_HOSTS||'cbseacademic.nic.in,cisce.org,upmsp.edu.in,ncert.nic.in').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    const host=u.hostname.toLowerCase();
    return hosts.some(allowed=>host===allowed||host.endsWith('.'+allowed));
  }catch{return false;}
};

export async function previewFrameworkImport(rows:FrameworkCsvRow[]) {
  if(!rows.length) throw problem('The framework import has no topic rows.');
  if(rows.length>10000) throw problem('A single framework import is limited to 10,000 topic rows.');
  const errors:{row:number;message:string}[]=[];
  const first=rows[0];
  const boards=new Set(rows.map(r=>r.boardCode));
  const media=new Set(rows.map(r=>r.medium));
  const years=new Set(rows.map(r=>r.academicYear));
  if(boards.size!==1||media.size!==1||years.size!==1) errors.push({row:0,message:'One file must contain one board, medium and academic year. Include every class for that scope.'});
  const {rows:activeBoards}=await query<{code:string}>('SELECT code FROM education_boards WHERE is_active=TRUE');
  const boardSet=new Set(activeBoards.map(x=>x.code));
  if(!boardSet.has(first.boardCode)) errors.push({row:1,message:'Board code is not active or does not exist.'});
  if(!/^20\d{2}-\d{2}$/.test(first.academicYear)||Number(first.academicYear.slice(5))!==(Number(first.academicYear.slice(0,4))+1)%100) errors.push({row:1,message:'Academic year must be consecutive, such as 2026-27.'});
  if(!['en','hi'].includes(first.medium)) errors.push({row:1,message:'Medium must be en or hi.'});
  const gradeCodes=[...new Set(rows.map(r=>r.gradeCode))], subjectCodes=[...new Set(rows.map(r=>r.subjectCode))];
  const [grades,subjects]=await Promise.all([
    query<{code:string}>('SELECT code FROM education_grade_levels WHERE is_active=TRUE AND code=ANY($1::text[])',[gradeCodes]),
    query<{code:string;id:string}>('SELECT code,id FROM subjects WHERE is_active=TRUE AND code=ANY($1::text[])',[subjectCodes]),
  ]);
  const gradeSet=new Set(grades.rows.map(x=>x.code)), subjectMap=new Map(subjects.rows.map(x=>[x.code,x.id]));
  const seen=new Set<string>();
  rows.forEach((r,i)=>{
    const n=i+2;
    if(!gradeSet.has(r.gradeCode)) errors.push({row:n,message:`Unknown or inactive class code: ${r.gradeCode}`});
    if(!subjectMap.has(r.subjectCode)) errors.push({row:n,message:`Unknown or inactive subject code: ${r.subjectCode}`});
    if(!r.unit?.trim()||!r.chapter?.trim()||!r.topic?.trim()) errors.push({row:n,message:'Unit, chapter and topic are required.'});
    if(!r.learningOutcome?.trim()) errors.push({row:n,message:'Learning outcome is required.'});
    if(!https(r.sourceUrl)) errors.push({row:n,message:'Source URL must be HTTPS.'});
    else if(!officialHost(r.sourceUrl)) errors.push({row:n,message:'Source domain is not on the syllabus official-source allow-list. Configure SYLLABUS_IMPORT_ALLOWED_HOSTS for another board domain.'});
    if(!r.pageReference?.trim()) errors.push({row:n,message:'Page or section reference is required.'});
    const key=[r.gradeCode,r.subjectCode,r.unit,r.chapter,r.topic].map(x=>x.trim().toLocaleLowerCase()).join('|');
    if(seen.has(key)) errors.push({row:n,message:'Duplicate class/subject/unit/chapter/topic row.'});
    seen.add(key);
    const sortOrder=Number(r.sortOrder);
    if(!Number.isInteger(sortOrder)||sortOrder<0) errors.push({row:n,message:'sort_order must be a non-negative integer.'});
  });
  const scopes=[...new Map(rows.map(r=>[`${r.gradeCode}|${r.subjectCode}`,{gradeCode:r.gradeCode,subjectCode:r.subjectCode}])).values()];
  return {valid:errors.length===0,rowCount:rows.length,boardCode:first.boardCode,medium:first.medium,academicYear:first.academicYear,classes:[...new Set(rows.map(r=>r.gradeCode))].sort(),subjectScopes:scopes.length,errors};
}

export async function commitFrameworkImport(rows:FrameworkCsvRow[],actor:string) {
  const preview=await previewFrameworkImport(rows);
  if(!preview.valid) throw problem('Framework import has validation errors. Correct the preview before saving.');
  const {rows:subjects}=await query<{code:string;id:string}>('SELECT code,id FROM subjects WHERE code=ANY($1::text[])',[[...new Set(rows.map(r=>r.subjectCode))]]);
  const byCode=new Map(subjects.map(s=>[s.code,s.id]));
  const syllabusRows:SyllabusRow[]=rows.map(r=>({gradeCode:r.gradeCode,subjectId:byCode.get(r.subjectCode)!,unit:r.unit,chapter:r.chapter,sortOrder:Number(r.sortOrder),topic:r.topic,topicHi:r.topicHi,learningOutcome:r.learningOutcome,evidenceUrl:r.sourceUrl,pageReference:r.pageReference}));
  const hash=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const result=await importSyllabus({boardCode:rows[0].boardCode,academicYear:rows[0].academicYear,title:`${rows[0].boardCode} ${rows[0].academicYear} curriculum framework`,sourceUrl:rows[0].sourceUrl,sourceHash:hash,medium:rows[0].medium,rows:syllabusRows},actor);
  return {...result,sourceHash:hash,importedRows:rows.length};
}

export async function frameworkCoverage() {
  const {rows}=await query(`WITH academic_year AS (
    SELECT CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE)<4
      THEN (EXTRACT(YEAR FROM CURRENT_DATE)::int-1)::text||'-'||RIGHT((EXTRACT(YEAR FROM CURRENT_DATE)::int)::text,2)
      ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int::text||'-'||RIGHT((EXTRACT(YEAR FROM CURRENT_DATE)::int+1)::text,2)
    END AS year
  ), media AS (SELECT unnest(ARRAY['en','hi']::text[]) AS medium),
  scopes AS (
    SELECT b.id AS board_id,b.code AS board_code,ay.year AS academic_year,m.medium,
           g.code AS grade_code,s.id AS subject_id,s.code AS subject_code
    FROM education_boards b CROSS JOIN academic_year ay CROSS JOIN media m
    CROSS JOIN education_grade_levels g CROSS JOIN subjects s
    WHERE b.is_active=TRUE AND g.is_active=TRUE AND s.is_active=TRUE
  )
  SELECT sc.board_code,sc.academic_year,sc.medium,sc.grade_code,sc.subject_code,
         COUNT(DISTINCT cu.id)::int AS unit_count,COUNT(DISTINCT cc.id)::int AS chapter_count,
         COUNT(DISTINCT ct.id) FILTER(WHERE ct.is_retired=FALSE)::int AS topic_count,
         CASE WHEN cs.id IS NULL THEN 'MISSING' ELSE cv.publication_status END AS publication_status
  FROM scopes sc
  LEFT JOIN curriculum_versions cv ON cv.board_id=sc.board_id AND cv.academic_year=sc.academic_year AND cv.medium=sc.medium
  LEFT JOIN curriculum_subjects cs ON cs.curriculum_version_id=cv.id AND cs.class_name=sc.grade_code AND cs.subject_code=sc.subject_code AND cs.is_active=TRUE
  LEFT JOIN curriculum_units cu ON cu.curriculum_subject_id=cs.id
  LEFT JOIN curriculum_chapters cc ON cc.curriculum_unit_id=cu.id
  LEFT JOIN curriculum_topics ct ON ct.curriculum_unit_id=cu.id
  GROUP BY sc.board_code,sc.academic_year,sc.medium,sc.grade_code,sc.subject_code,cv.publication_status
  ORDER BY sc.board_code,sc.grade_code,sc.subject_code,sc.medium`);
  return rows;
}

export async function attachFrameworkEvidence(versionId:string,documentId:string,actor:string) {
  return transaction(async client=>{
    const {rows:[version]}=await client.query('SELECT id,board_id,academic_year FROM curriculum_versions WHERE id=$1::uuid FOR UPDATE',[versionId]);
    if(!version) throw problem('Curriculum framework version not found.',404);
    const {rows:[document]}=await client.query('SELECT id,board_id,academic_year,medium,status FROM syllabus_documents WHERE id=$1::uuid FOR SHARE',[documentId]);
    if(!document) throw problem('Syllabus PDF document not found.',404);
    if(document.board_id!==version.board_id||document.academic_year!==version.academic_year||document.medium!==version.medium) throw problem('Evidence PDF must match the framework board, academic year and medium.');
    if(document.status!=='APPROVED') throw problem('Review and approve the PDF in the syllabus document library before attaching it as official evidence.',409);
    await client.query(`INSERT INTO curriculum_version_evidence(curriculum_version_id,syllabus_document_id,attached_by)
      VALUES($1::uuid,$2::uuid,$3::uuid) ON CONFLICT(curriculum_version_id,syllabus_document_id) DO NOTHING`,[versionId,documentId,actor]);
    await client.query(`INSERT INTO audit_log(actor_id,action,entity_type,entity_id,new_value)
      VALUES($1::uuid,'UPDATE','curriculum_version',$2::uuid,$3::jsonb)`,[actor,versionId,JSON.stringify({operation:'ATTACH_OFFICIAL_EVIDENCE',documentId})]);
    return {versionId,documentId,attached:true};
  });
}
