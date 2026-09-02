import 'dotenv/config';
import fs = require('fs');
import path = require('path');
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { pool, query } from '../config/db';
import { createLearningResource } from '../services/adminLearning.service';
import { createAssessment, createQuestion } from '../services/adminLearningPractice.service';

const PACK_DIR = path.resolve(__dirname, '../../../content/class-8/science/force-and-pressure/atmospheric-pressure');
const PACK_ID = 'VS-C8-SCI-FP-ATMOSPHERIC-V1';
const RESOURCE_SLUG = 'class-8-science-atmospheric-pressure-v1';

type SequenceItem = { stage:string; assetId:string; type:string; titleEn:string; titleHi:string; questionIds?:string[] };
type Manifest = { packId:string; status:string; sourceCode:string; licence:string; gradeCodes:string[]; boardCodes:string[]; subject:string; topicLabel:string; languages:string[]; sequence:SequenceItem[] };
type Option = { key:string; text:string; textHi:string };
type PackQuestion = { publicCode:string; type:string; difficulty:string; prompt:string; promptHi:string; options?:Option[]; correctAnswer:unknown; explanation:string; explanationHi:string; marks:number; negativeMarks:number };
type Bank = { packId:string; status:string; sourceCode:string; licence:string; questions:PackQuestion[] };
interface IdStatusRow extends QueryResultRow { id: UUID; review_status: string }
interface UserRoleRow extends QueryResultRow { id: UUID; role: string }
interface SubjectRow extends QueryResultRow { id: UUID }

function readJson<T>(file:string):T { return JSON.parse(fs.readFileSync(path.join(PACK_DIR,file),'utf8')) as T; }
function arg(name:string):string|null {
  const args=process.argv.slice(2); const pref=args.find(v=>v.startsWith(`--${name}=`));
  if(pref) return pref.slice(name.length+3).trim()||null;
  const i=args.indexOf(`--${name}`); return i>=0 && args[i+1] && !args[i+1].startsWith('--') ? args[i+1].trim() : null;
}
function commitRequested():boolean { return process.argv.slice(2).includes('--commit'); }
function isUuid(v:string):boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); }
function splitLesson(){
  const raw=fs.readFileSync(path.join(PACK_DIR,'lesson-content.md'),'utf8');
  const en='# English lesson', hi='# हिंदी पाठ'; const a=raw.indexOf(en), b=raw.indexOf(hi);
  if(a<0||b<0||b<=a) throw new Error('lesson-content.md must contain English and Hindi sections');
  return { bodyEn:raw.slice(a+en.length,b).trim(), bodyHi:raw.slice(b+hi.length).trim() };
}
function validate(manifest:Manifest,bank:Bank){
  if(manifest.packId!==PACK_ID||bank.packId!==PACK_ID) throw new Error('Unexpected Atmospheric Pressure packId');
  if(manifest.status!=='DRAFT'||bank.status!=='DRAFT') throw new Error('Installer accepts DRAFT content only');
  if(manifest.sourceCode!=='VIDYASETU_ORIGINAL'||bank.sourceCode!=='VIDYASETU_ORIGINAL') throw new Error('Source must be VIDYASETU_ORIGINAL');
  if(manifest.licence!=='VIDYASETU_ORIGINAL'||bank.licence!=='VIDYASETU_ORIGINAL') throw new Error('Licence must be VIDYASETU_ORIGINAL');
  if(!manifest.languages.includes('en')||!manifest.languages.includes('hi')) throw new Error('English and Hindi are required');
  if(manifest.gradeCodes.length!==1||manifest.gradeCodes[0]!=='CLASS_8') throw new Error('Pack is locked to CLASS_8');
  if(manifest.boardCodes.length!==1||manifest.boardCodes[0]!=='COMMON') throw new Error('Pack is locked to COMMON');
  if(bank.questions.length!==12) throw new Error(`Expected 12 questions; found ${bank.questions.length}`);
  const codes=new Set<string>();
  for(const q of bank.questions){
    if(!q.publicCode||codes.has(q.publicCode)) throw new Error(`Invalid/duplicate question code ${q.publicCode}`); codes.add(q.publicCode);
    if(!q.prompt.trim()||!q.promptHi.trim()||!q.explanation.trim()||!q.explanationHi.trim()) throw new Error(`${q.publicCode}: incomplete bilingual text`);
    if(q.negativeMarks!==0) throw new Error(`${q.publicCode}: negative marking is not allowed`);
    if(['MCQ_SINGLE','TRUE_FALSE'].includes(q.type)){
      if(!q.options||q.options.length<2) throw new Error(`${q.publicCode}: options required`);
      const keys=new Set(q.options.map(o=>o.key)); const correct=(q.correctAnswer as {option?:string})?.option;
      if(!correct||!keys.has(correct)) throw new Error(`${q.publicCode}: invalid correct option`);
      if(q.options.some(o=>!o.text.trim()||!o.textHi.trim())) throw new Error(`${q.publicCode}: incomplete bilingual option`);
    }
  }
  for(const item of manifest.sequence.filter(x=>x.type==='QUIZ')) for(const code of item.questionIds||[]) if(!codes.has(code)) throw new Error(`${item.assetId}: unknown question ${code}`);
}
async function requireSuperAdmin(userId:UUID){
  const {rows:[user]}=await query<UserRoleRow>('SELECT id,role FROM users WHERE id=$1::uuid',[userId]);
  if(!user) throw new Error('Admin user does not exist'); if(user.role!=='SUPER_ADMIN') throw new Error(`Atmospheric Pressure installation requires SUPER_ADMIN; received ${user.role}`);
}
async function scienceSubject():Promise<UUID|null>{
  const {rows:[s]}=await query<SubjectRow>(`SELECT id FROM subjects WHERE UPPER(COALESCE(code,'')) IN ('SCI','SCIENCE') OR LOWER(name)='science' ORDER BY CASE WHEN UPPER(COALESCE(code,''))='SCIENCE' THEN 0 ELSE 1 END,id LIMIT 1`); return s?.id||null;
}
async function attachResourceGrade(id:UUID){ await query(`INSERT INTO learning_resource_grades(resource_id,grade_id) SELECT $1::uuid,id FROM education_grade_levels WHERE code='CLASS_8' AND is_active=TRUE ON CONFLICT DO NOTHING`,[id]); }
async function attachQuestionGrade(id:UUID){ await query(`INSERT INTO learning_question_grades(question_id,grade_id) SELECT $1::uuid,id FROM education_grade_levels WHERE code='CLASS_8' AND is_active=TRUE ON CONFLICT DO NOTHING`,[id]); }

async function ensureResource(m:Manifest,bodyEn:string,bodyHi:string,admin:UUID,subjectId:UUID|null):Promise<UUID>{
  const {rows:[existing]}=await query<IdStatusRow>('SELECT id,review_status FROM learning_resources WHERE public_slug=$1',[RESOURCE_SLUG]);
  let id:UUID;
  if(existing){ if(existing.review_status!=='DRAFT') throw new Error(`Existing ${RESOURCE_SLUG} is ${existing.review_status}; refusing overwrite`); id=existing.id; }
  else {
    const created=await createLearningResource({
      title:'Atmospheric pressure made simple', titleHi:'वायुमंडलीय दाब आसान तरीके से',
      summary:'Understand how air exerts pressure and how pressure differences explain straws, suction cups and a safe inverted-cup activity.',
      summaryHi:'समझें कि वायु दाब कैसे डालती है और दाब-अंतर स्ट्रॉ, सक्शन कप तथा सुरक्षित उल्टे-कप प्रयोग को कैसे समझाता है।',
      bodyMarkdown:bodyEn, bodyMarkdownHi:bodyHi, resourceType:'ARTICLE', category:'ACADEMIC', visibility:'PUBLIC', reviewStatus:'DRAFT', language:'en',
      classMin:8,classMax:8,sourceCode:m.sourceCode,sourceItemId:m.packId,licence:m.licence,
      attributionText:'VidyaSetu Original — Class 8 Science Atmospheric Pressure learning pack',isOfflineReady:true,isFeaturedPublic:false,boardCodes:m.boardCodes,publicSlug:RESOURCE_SLUG
    },admin); id=created.id;
  }
  await query(`UPDATE learning_resources SET subject_id=$2::uuid,subject_label=$3,topic_label=$4 WHERE id=$1::uuid AND review_status='DRAFT'`,[id,subjectId,m.subject,m.topicLabel]);
  await attachResourceGrade(id); return id;
}

async function ensureQuestions(m:Manifest,bank:Bank,admin:UUID,subjectId:UUID|null){
  const ids=new Map<string,UUID>();
  for(const q of bank.questions){
    const {rows:[existing]}=await query<IdStatusRow>('SELECT id,review_status FROM learning_questions WHERE public_code=$1',[q.publicCode]);
    let id:UUID;
    if(existing){ if(existing.review_status!=='DRAFT') throw new Error(`Existing ${q.publicCode} is ${existing.review_status}; refusing overwrite`); id=existing.id; }
    else {
      const created=await createQuestion({publicCode:q.publicCode,prompt:q.prompt,promptHi:q.promptHi,questionType:q.type,difficulty:q.difficulty,explanation:q.explanation,explanationHi:q.explanationHi,correctAnswer:q.correctAnswer,marks:q.marks,negativeMarks:q.negativeMarks,classMin:8,classMax:8,subjectId,sourceCode:m.sourceCode,licence:m.licence,attributionText:'VidyaSetu Original — Class 8 Science Atmospheric Pressure learning pack',visibility:'REGISTERED',reviewStatus:'DRAFT',boardCodes:m.boardCodes,options:(q.options||[]).map(o=>({key:o.key,text:o.text,textHi:o.textHi}))},admin); id=created.id;
    }
    await query(`UPDATE learning_questions SET subject_label=$2,topic_label=$3 WHERE id=$1::uuid AND review_status='DRAFT'`,[id,m.subject,m.topicLabel]); await attachQuestionGrade(id); ids.set(q.publicCode,id);
  }
  return ids;
}
function assessmentSlug(assetId:string){ return assetId==='VS-AP-PRACTICE-01'?'class-8-science-atmospheric-pressure-practice-v1':'class-8-science-atmospheric-pressure-mastery-v1'; }
async function ensureAssessments(m:Manifest,admin:UUID,subjectId:UUID|null,qids:Map<string,UUID>){
  const results:Array<{id:UUID;slug:string}>=[];
  for(const item of m.sequence.filter(x=>x.type==='QUIZ')){
    const slug=assessmentSlug(item.assetId); const ids=(item.questionIds||[]).map(code=>{const id=qids.get(code);if(!id)throw new Error(`${item.assetId}: missing ${code}`);return id;});
    const {rows:[existing]}=await query<IdStatusRow>('SELECT id,review_status FROM learning_assessments WHERE public_slug=$1',[slug]); let id:UUID;
    if(existing){ if(existing.review_status!=='DRAFT') throw new Error(`Existing ${slug} is ${existing.review_status}; refusing overwrite`); id=existing.id; }
    else { const mastery=item.assetId==='VS-AP-MASTERY-01'; const created=await createAssessment({publicSlug:slug,title:item.titleEn,titleHi:item.titleHi,summary:mastery?'Mastery check on atmospheric pressure, pressure differences, evidence and application.':'Low-stakes practice on air pressure and pressure-difference reasoning.',assessmentType:'PRACTICE',visibility:'REGISTERED',reviewStatus:'DRAFT',classMin:8,classMax:8,subjectId,timeLimitMins:mastery?15:12,passingPct:mastery?70:60,maxAttempts:mastery?3:null,shuffleQuestions:false,isFeaturedPublic:false,boardCodes:m.boardCodes,questionIds:ids},admin); id=created.id; }
    results.push({id,slug});
  }
  return results;
}

async function main(){
  const manifest=readJson<Manifest>('pack-manifest.json'), bank=readJson<Bank>('question-bank.json'), {bodyEn,bodyHi}=splitLesson(); validate(manifest,bank);
  console.log(`Atmospheric Pressure pack validated: ${manifest.packId}`);
  console.log(`Learner lesson: English ${bodyEn.length} chars; Hindi ${bodyHi.length} chars`);
  console.log(`Question bank: ${bank.questions.length} bilingual questions`);
  console.log(`Quiz assets: ${manifest.sequence.filter(x=>x.type==='QUIZ').length}`);
  if(!commitRequested()){ console.log('DRY RUN ONLY — no database writes were made.'); console.log('To stage as DRAFT, rerun with --commit --admin-user-id <SUPER_ADMIN_UUID>.'); return; }
  const raw=arg('admin-user-id'); if(!raw||!isUuid(raw)) throw new Error('--commit requires a valid --admin-user-id UUID'); const admin=raw as UUID;
  await requireSuperAdmin(admin); const subjectId=await scienceSubject(); const resourceId=await ensureResource(manifest,bodyEn,bodyHi,admin,subjectId); const qids=await ensureQuestions(manifest,bank,admin,subjectId); const assessments=await ensureAssessments(manifest,admin,subjectId,qids);
  console.log('ATMOSPHERIC PRESSURE PACK STAGED SUCCESSFULLY — DRAFT ONLY'); console.log(`Resource: ${RESOURCE_SLUG} (${resourceId})`); console.log(`Questions: ${qids.size}`); for(const a of assessments) console.log(`Assessment: ${a.slug} (${a.id})`); console.log('No resource, question or assessment was published.');
}

main().catch((e)=>{console.error('Atmospheric Pressure pack installer failed:',e);process.exitCode=1;}).finally(async()=>{await pool.end().catch(()=>undefined);});
