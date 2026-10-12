import { createHash } from 'crypto';
import { query } from '../config/db';
import { importSyllabus, type SyllabusRow } from './syllabus.service';

export interface FrameworkCsvRow {
  boardCode:string; medium:'en'|'hi'; academicYear:string; gradeCode:string; subjectCode:string;
  unit:string; chapter:string; topic:string; topicHi?:string; learningOutcome:string; sourceUrl:string; pageReference:string; sortOrder:number;
}
const problem=(message:string,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const https=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};

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
  if(!/^20\\d{2}-\\d{2}$/.test(first.academicYear)||Number(first.academicYear.slice(5))!==(Number(first.academicYear.slice(0,4))+1)%100) errors.push({row:1,message:'Academic year must be consecutive, such as 2026-27.'});
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
    if(!r.pageReference?.trim()) errors.push({row:n,message:'Page or section reference is required.'});
    const key=[r.gradeCode,r.subjectCode,r.unit,r.chapter,r.topic].map(x=>x.trim().toLocaleLowerCase()).join('|');
    if(seen.has(key)) errors.push({row:n,message:'Duplicate class/subject/unit/chapter/topic row.'});
    seen.add(key);
    if(!Number.isInteger(r.sortOrder)||r.sortOrder<0) errors.push({row:n,message:'sort_order must be a non-negative integer.'});
  });
  const scopes=[...new Map(rows.map(r=>[`${r.gradeCode}|${r.subjectCode}`,{gradeCode:r.gradeCode,subjectCode:r.subjectCode}])).values()];
  return {valid:errors.length===0,rowCount:rows.length,boardCode:first.boardCode,medium:first.medium,academicYear:first.academicYear,classes:[...new Set(rows.map(r=>r.gradeCode))].sort(),subjectScopes:scopes.length,errors};
}

export async function commitFrameworkImport(rows:FrameworkCsvRow[],actor:string) {
  const preview=await previewFrameworkImport(rows);
  if(!preview.valid) throw problem('Framework import has validation errors. Correct the preview before saving.');
  const {rows:subjects}=await query<{code:string;id:string}>('SELECT code,id FROM subjects WHERE code=ANY($1::text[])',[[...new Set(rows.map(r=>r.subjectCode))]]);
  const byCode=new Map(subjects.map(s=>[s.code,s.id]));
  const syllabusRows:SyllabusRow[]=rows.map(r=>({gradeCode:r.gradeCode,subjectId:byCode.get(r.subjectCode)!,unit:r.unit,chapter:r.chapter,topic:r.topic,topicHi:r.topicHi,learningOutcome:r.learningOutcome,evidenceUrl:r.sourceUrl,pageReference:r.pageReference}));
  const hash=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const result=await importSyllabus({boardCode:rows[0].boardCode,academicYear:rows[0].academicYear,title:`${rows[0].boardCode} ${rows[0].academicYear} curriculum framework`,sourceUrl:rows[0].sourceUrl,sourceHash:hash,medium:rows[0].medium,rows:syllabusRows},actor);
  await query('UPDATE curriculum_versions SET medium=$2,source_hash=$3 WHERE id=$1::uuid',[result.id,rows[0].medium,hash]);
  return {...result,sourceHash:hash,importedRows:rows.length};
}
