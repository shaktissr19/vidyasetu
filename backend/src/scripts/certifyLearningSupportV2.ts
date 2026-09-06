import 'dotenv/config';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { pool, query } from '../config/db';
import * as support from '../services/learningSupport.service';
import * as ptm from '../services/ptm.service';
import * as communities from '../services/learningCommunity.service';

interface FamilyRow extends QueryResultRow {
  parent_user_id: UUID; student_id: UUID; student_user_id: UUID; school_id: UUID; class_id: UUID;
}
interface TeacherRow extends QueryResultRow { teacher_id: UUID; teacher_user_id: UUID; }
interface AdminRow extends QueryResultRow { user_id: UUID; }
interface ConceptRow extends QueryResultRow { id: UUID; subject_code: string; }
interface CountRow extends QueryResultRow { count: number | string; }
interface StateRow extends QueryResultRow { payload: string; }

let stage = 'bootstrap';
function mark(next: string): void { stage = next; }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function expectStatus(work:()=>Promise<unknown>,status:number,label:string){try{await work();}catch(error:unknown){if((error as {statusCode?:number})?.statusCode===status)return;throw error;}throw new Error(`${label}: expected HTTP ${status}`);}
async function academicTruth(studentId:UUID,conceptId:UUID):Promise<string>{
  const { rows:[row] }=await query<StateRow>(
    `SELECT jsonb_build_object(
       'mastery',(SELECT to_jsonb(scp) - 'updated_at' FROM student_concept_progress scp WHERE scp.student_id=$1 AND scp.concept_id=$2),
       'diagnostic',(SELECT to_jsonb(sci) - 'updated_at' FROM student_concept_intelligence sci WHERE sci.student_id=$1 AND sci.concept_id=$2)
     )::text AS payload`,[studentId,conceptId],
  ); return row?.payload||'{}';
}

async function main(){
  if(process.env.NODE_ENV!=='test')throw new Error('Learning Support certification is test-only');
  mark('schema readiness');
  assert(await support.learningSupportSchemaReady(),'Learning Support schema is not ready');
  assert(await ptm.ptmSchemaReady(),'PTM schema is not ready');
  assert(await communities.learningCommunitySchemaReady(),'Communities 2.0 schema is not ready');

  mark('family fixture');
  const { rows:[family] }=await query<FamilyRow>(
    `SELECT psl.parent_user_id,psl.student_id,s.user_id AS student_user_id,s.school_id,s.class_id
     FROM parent_student_links psl JOIN students s ON s.id=psl.student_id JOIN school_classes sc ON sc.id=s.class_id
     WHERE s.status='ACTIVE' AND s.school_link_status='APPROVED' AND sc.class_name='8'
       AND s.school_id IS NOT NULL AND s.class_id IS NOT NULL ORDER BY psl.id LIMIT 1`,
  );
  assert(family,'No linked active Class 8 Parent/Student fixture');
  mark('concept fixture');
  const { rows:[concept] }=await query<ConceptRow>(
    `SELECT lc.id,sub.code AS subject_code FROM learning_concepts lc JOIN subjects sub ON sub.id=lc.subject_id WHERE lc.code='C8-SCI-05-C01'`,
  );
  assert(concept,'Force concept is missing');
  mark('admin fixture');
  const { rows:[admin] }=await query<AdminRow>('SELECT admin_user_id AS user_id FROM schools WHERE id=$1',[family.school_id]);
  assert(admin?.user_id,'School Admin fixture is missing');

  mark('teacher fixture and assignment');
  const { rows:[teacher] }=await query<TeacherRow>(
    `SELECT t.id AS teacher_id,t.user_id AS teacher_user_id FROM teachers t WHERE t.school_id=$1 AND t.status='ACTIVE' ORDER BY t.created_at LIMIT 1`,[family.school_id],
  );
  assert(teacher,'Active Teacher fixture is missing');
  await query(
    `INSERT INTO teacher_assignments(teacher_id,school_id,class_id,subject_code,academic_year,is_class_teacher)
     VALUES($1,$2,$3,$4,'2026-27',FALSE)
     ON CONFLICT(teacher_id,class_id,subject_code,academic_year) DO NOTHING`,
    [teacher.teacher_id,family.school_id,family.class_id,concept.subject_code],
  );

  mark('academic truth snapshot before intervention');
  const beforeTruth=await academicTruth(family.student_id,concept.id);
  mark('create Teacher learning intervention');
  const intervention=await support.createLearningIntervention(
    family.school_id,teacher.teacher_user_id,'TEACHER',{
      classId:family.class_id,subjectCode:concept.subject_code,conceptId:concept.id,studentIds:[family.student_id],
      title:'Force concept support',reason:'Certification: focused support from current learning evidence.',priority:'HIGH',
      actionPlan:{actionType:'FOCUSED_SUPPORT',instructions:'Review the worked example and complete short practice.',estimatedMinutes:20},
    },
  );
  assert(intervention.students.length===1,'Intervention did not contain exactly one Student');
  assert(intervention.evidence_snapshot && Object.keys(intervention.evidence_snapshot).length>0,'Intervention did not snapshot evidence');

  mark('Parent Learning Support before acknowledgement');
  const parentBefore=await support.getParentLearningSupport(family.parent_user_id,family.student_id);
  assert(parentBefore.interventions.some((item)=>item.id===intervention.id),'Parent Learning Support did not expose the intervention');
  assert(parentBefore.weeklyBrief.length>20,'Parent weekly brief was not generated');
  mark('Parent acknowledgement');
  await support.acknowledgeParentIntervention(family.parent_user_id,family.student_id,intervention.id,'Reviewed at home.');
  mark('Parent Learning Support after acknowledgement');
  const parentAfterAck=await support.getParentLearningSupport(family.parent_user_id,family.student_id);
  const acknowledged=parentAfterAck.interventions.find((item)=>item.id===intervention.id);
  assert(Boolean(acknowledged?.parent_acknowledged_at),'Parent acknowledgement was not persisted');

  mark('intervention Community creation');
  const interventionCommunity=await support.createInterventionCommunity(family.school_id,teacher.teacher_user_id,'TEACHER',intervention.id);
  assert(interventionCommunity.learning_purpose==='INTERVENTION','Intervention Community purpose is incorrect');
  assert(interventionCommunity.status==='PENDING','Intervention Community bypassed Platform approval');
  const { rows:[membersBeforeApproval] }=await query<CountRow>(`SELECT COUNT(*)::int AS count FROM collaboration_group_members WHERE group_id=$1 AND status='ACTIVE'`,[interventionCommunity.id]);
  assert(Number(membersBeforeApproval.count)===1,'Intervention Community auto-enrolled learners instead of requiring consent');

  mark('concept Community creation');
  const conceptCommunity=await communities.createLearningCommunity(family.school_id,teacher.teacher_user_id,'TEACHER',{
    name:'Force concept study circle',description:'Certification concept Community',classId:family.class_id,subjectCode:concept.subject_code,
    conceptId:concept.id,purpose:'CONCEPT_SUPPORT',maxMembers:40,
  });
  assert(conceptCommunity.status==='PENDING','Concept Community bypassed Platform approval');
  mark('concept Community approval and discovery');
  await query(`UPDATE collaboration_groups SET status='ACTIVE',approved_by=$2,approved_at=NOW() WHERE id=$1`,[conceptCommunity.id,admin.user_id]);
  const studentDiscovery=await communities.listLearningCommunities(family.student_user_id,'STUDENT');
  assert(studentDiscovery.some((item)=>item.id===conceptCommunity.id),'Student could not discover an approved class-scoped learning Community');
  const { rows:[studentMembership] }=await query<CountRow>(`SELECT COUNT(*)::int AS count FROM collaboration_group_members WHERE group_id=$1 AND user_id=$2 AND status='ACTIVE'`,[conceptCommunity.id,family.student_user_id]);
  assert(Number(studentMembership.count)===0,'Learning Community discovery incorrectly forced membership');

  const now=Date.now();
  const iso=(deltaMs:number)=>new Date(now+deltaMs).toISOString();
  mark('PTM session creation');
  const session=await ptm.createSession(family.school_id,admin.user_id,'SCHOOL_ADMIN',{
    title:'Learning Support PTM',description:'Certification intervention follow-up',bookingOpensAt:iso(-10*60_000),bookingClosesAt:iso(30*60_000),startsAt:iso(60*60_000),endsAt:iso(120*60_000),
  });
  mark('PTM Teacher slot creation');
  const slot=await ptm.createSlot(family.school_id,admin.user_id,'SCHOOL_ADMIN',session.id,{teacherId:teacher.teacher_id,startsAt:iso(70*60_000),endsAt:iso(85*60_000),location:'Room 8'});
  mark('PTM session open');
  await ptm.changeSessionStatus(family.school_id,'SCHOOL_ADMIN',session.id,{status:'OPEN'});
  mark('Parent PTM options');
  const options=await ptm.listParentOptions(family.parent_user_id,family.student_id);
  assert(options.some((item)=>item.id===slot.id),'Parent could not see assigned Teacher PTM slot');
  mark('Parent PTM booking');
  const booking=await ptm.bookParentSlot(family.parent_user_id,family.student_id,slot.id,{interventionId:intervention.id,parentNote:'Discuss concept support.'});
  assert(booking.intervention_id===intervention.id,'PTM booking did not retain intervention link');
  mark('duplicate PTM guard');
  await expectStatus(()=>ptm.bookParentSlot(family.parent_user_id,family.student_id,slot.id,{interventionId:intervention.id}),409,'Duplicate PTM booking');
  mark('intervention PTM state');
  const linked=await support.getInterventionForTeacher(family.school_id,teacher.teacher_user_id,'TEACHER',intervention.id,teacher.teacher_id);
  assert(linked.status==='PTM_REQUESTED','PTM booking did not move intervention to PTM_REQUESTED');

  mark('PTM outcome clock fixture');
  await query(`UPDATE ptm_slots SET starts_at=NOW()-INTERVAL '10 minutes',ends_at=NOW()+INTERVAL '5 minutes' WHERE id=$1`,[slot.id]);
  mark('PTM outcome');
  const outcome=await ptm.updateOutcome(family.school_id,teacher.teacher_user_id,'TEACHER',booking.id,{
    status:'COMPLETED',outcomeNote:'Reviewed evidence together.',agreedAction:'Complete short Force practice and review next week.',followUpAt:iso(7*24*60*60_000),
  });
  assert(outcome.agreed_action?.includes('Force practice'),'PTM agreed action was not stored');
  assert(Boolean(outcome.follow_up_at),'PTM follow-up date was not stored');
  mark('Student PTM read-only view');
  const studentMeetings=await ptm.listStudentBookings(family.student_user_id);
  assert(studentMeetings.some((item)=>item.id===booking.id),'Student read-only PTM view did not expose the meeting');

  mark('resolve Teacher intervention');
  await support.updateLearningIntervention(family.school_id,teacher.teacher_user_id,'TEACHER',intervention.id,{status:'RESOLVED',outcomeNote:'Follow-up evidence reviewed.'});
  mark('Parent resolved view');
  const parentResolved=await support.getParentLearningSupport(family.parent_user_id,family.student_id);
  assert(parentResolved.interventionSummary.resolved>=1,'Resolved intervention was not visible to Parent');

  mark('Parent-child isolation');
  const { rows:[otherParent] }=await query<AdminRow>(
    `SELECT u.id AS user_id FROM users u WHERE u.role='PARENT' AND u.id<>$1
       AND NOT EXISTS(SELECT 1 FROM parent_student_links psl WHERE psl.parent_user_id=u.id AND psl.student_id=$2)
     ORDER BY u.id LIMIT 1`,[family.parent_user_id,family.student_id],
  );
  if(otherParent)await expectStatus(()=>support.getParentLearningSupport(otherParent.user_id,family.student_id),403,'Parent-child isolation');

  mark('academic truth snapshot after support workflow');
  const afterTruth=await academicTruth(family.student_id,concept.id);
  assert(afterTruth===beforeTruth,'Learning Support workflow modified Mastery/Diagnostic academic truth');

  console.log('LEARNING SUPPORT 2.0 CERTIFIED');
  console.log(`Intervention: ${intervention.id}`);
  console.log(`PTM booking: ${booking.id}`);
  console.log(`Concept Community: ${conceptCommunity.id}`);
}

main().catch((error:unknown)=>{
  const pg=error as {message?:string;code?:string;detail?:string;hint?:string;where?:string;stack?:string};
  console.error(`LEARNING SUPPORT 2.0 CERTIFICATION FAILED [${stage}]: ${pg.message||String(error)}`);
  if(pg.code)console.error(`PostgreSQL code: ${pg.code}`);
  if(pg.detail)console.error(`Detail: ${pg.detail}`);
  if(pg.hint)console.error(`Hint: ${pg.hint}`);
  if(pg.where)console.error(`Where: ${pg.where}`);
  if(pg.stack)console.error(pg.stack);
  process.exitCode=1;
}).finally(async()=>pool.end());