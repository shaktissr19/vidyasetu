import type { QueryResultRow } from 'pg';
import type { UserRole, UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import * as learningVisibility from './learningVisibility.service';
import { discoverGroups } from './group.service';

export type LearningCommunityPurpose = 'CONCEPT_SUPPORT' | 'INTERVENTION' | 'COMPETITION_PREP' | 'TEACHER_LED';

export interface CreateLearningCommunityInput {
  name: string;
  description?: string | null;
  classId: UUID;
  subjectCode: string;
  conceptId?: UUID | null;
  purpose: Exclude<LearningCommunityPurpose, 'INTERVENTION'>;
  maxMembers?: number;
}

export interface CreateLearningPostInput {
  body: string;
  conceptId?: UUID | null;
  resourceId?: UUID | null;
  assessmentId?: UUID | null;
  label?: string | null;
}

interface GroupRow extends QueryResultRow {
  id: UUID;
  name: string;
  description: string | null;
  kind: string;
  scope: string;
  school_id: UUID | null;
  class_id: UUID | null;
  owner_id: UUID;
  status: string;
  max_members: number;
  learning_purpose: string;
  subject_code: string | null;
  concept_id: UUID | null;
  competition_exam_id: UUID | null;
  intervention_id: UUID | null;
  concept_code?: string | null;
  concept_name?: string | null;
  concept_name_hi?: string | null;
  member_count?: number | string | null;
  membership_role?: string | null;
}
interface MemberRow extends QueryResultRow { role: 'OWNER'|'MODERATOR'|'MEMBER'; }
interface ResourceRow extends QueryResultRow { id: UUID; title: string; }
interface AssessmentRow extends QueryResultRow { id: UUID; title: string; }

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}
function clean(value?: string | null): string | null { const v=value?.trim(); return v||null; }

export async function learningCommunitySchemaReady(): Promise<boolean> {
  const { rows:[row] }=await query<{ready:boolean}&QueryResultRow>(
    `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='collaboration_groups' AND column_name='learning_purpose') AS ready`,
  );
  return Boolean(row?.ready);
}
async function requireSchema(){if(!await learningCommunitySchemaReady())throw httpError('Communities 2.0 is not initialized yet',503);}

export async function listLearningCommunities(userId: UUID, role: UserRole, search='') {
  await requireSchema();
  const groups=await discoverGroups(userId,role,search);
  const learningIds=groups
    .filter((group)=>String((group as unknown as {learning_purpose?:string}).learning_purpose||'GENERAL')!=='GENERAL')
    .map((group)=>group.id);
  if(!learningIds.length)return [];
  const { rows }=await query<GroupRow>(
    `SELECT g.*,lc.code AS concept_code,lc.name AS concept_name,lc.name_hi AS concept_name_hi,
       gm.role AS membership_role,
       (SELECT COUNT(*) FROM collaboration_group_members x WHERE x.group_id=g.id AND x.status='ACTIVE')::int AS member_count
     FROM collaboration_groups g
     LEFT JOIN learning_concepts lc ON lc.id=g.concept_id
     LEFT JOIN collaboration_group_members gm ON gm.group_id=g.id AND gm.user_id=$2 AND gm.status='ACTIVE'
     WHERE g.id=ANY($1::uuid[])
     ORDER BY CASE g.learning_purpose WHEN 'INTERVENTION' THEN 0 WHEN 'CONCEPT_SUPPORT' THEN 1 WHEN 'TEACHER_LED' THEN 2 ELSE 3 END,g.updated_at DESC`,
    [learningIds,userId],
  );
  return rows;
}

export async function createLearningCommunity(
  schoolId: UUID,userId: UUID,role: UserRole,input: CreateLearningCommunityInput,
) {
  await requireSchema();
  if(!['TEACHER','SCHOOL_ADMIN','SUPER_ADMIN'].includes(role))throw httpError('Teacher or School Admin access is required',403);
  const subjectCode=input.subjectCode.trim().toUpperCase();
  const overview=await learningVisibility.getSchoolLearningOverview(schoolId,userId,role,input.classId,subjectCode,null);
  if(input.conceptId&&!overview.concepts.some((c)=>c.conceptId===input.conceptId))throw httpError('Selected concept is not mapped to this class and subject',400);
  if(input.purpose==='CONCEPT_SUPPORT'&&!input.conceptId)throw httpError('Concept Support Communities require a canonical concept',400);
  const maxMembers=Math.min(Math.max(input.maxMembers||Math.max(30,overview.scope.studentCount+10),2),150);
  const group=await transaction(async(client)=>{
    const { rows:[created] }=await client.query<GroupRow>(
      `INSERT INTO collaboration_groups
        (name,description,kind,scope,school_id,class_id,created_by,owner_id,max_members,learning_purpose,subject_code,concept_id)
       VALUES($1,$2,'MIXED','CLASS',$3,$4,$5,$5,$6,$7,$8,$9) RETURNING *`,
      [input.name.trim(),clean(input.description),schoolId,input.classId,userId,maxMembers,input.purpose,subjectCode,input.conceptId||null],
    );
    if(!created)throw new Error('Learning Community insert returned no row');
    await client.query(`INSERT INTO collaboration_group_members(group_id,user_id,role,status,approved_by) VALUES($1,$2,'OWNER','ACTIVE',$2)`,[created.id,userId]);
    return created;
  });
  return group;
}

async function assertLearningCommunityModerator(groupId: UUID,userId: UUID): Promise<GroupRow> {
  const { rows:[group] }=await query<GroupRow>(`SELECT * FROM collaboration_groups WHERE id=$1`,[groupId]);
  if(!group||group.learning_purpose==='GENERAL')throw httpError('Learning Community not found',404);
  if(group.status!=='ACTIVE')throw httpError('Learning Community must be approved and active before learning assets are posted',409);
  const { rows:[member] }=await query<MemberRow>(
    `SELECT role FROM collaboration_group_members WHERE group_id=$1 AND user_id=$2 AND status='ACTIVE'`,[groupId,userId],
  );
  if(!member||!['OWNER','MODERATOR'].includes(member.role))throw httpError('Owner or moderator permission is required to attach governed learning assets',403);
  return group;
}

export async function createLearningPost(groupId: UUID,userId: UUID,input: CreateLearningPostInput) {
  await requireSchema();
  const group=await assertLearningCommunityModerator(groupId,userId);
  const conceptId=input.conceptId||group.concept_id||null;
  if(group.concept_id&&conceptId&&group.concept_id!==conceptId)throw httpError('Post concept must match the Community concept',400);
  let resource:ResourceRow|undefined; let assessment:AssessmentRow|undefined;
  if(input.resourceId){
    ({rows:[resource]}=await query<ResourceRow>(
      `SELECT lr.id,lr.title FROM learning_resources lr
       WHERE lr.id=$1 AND lr.review_status='PUBLISHED'
         AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM learning_resource_concepts lrc WHERE lrc.resource_id=lr.id AND lrc.concept_id=$2))`,
      [input.resourceId,conceptId],
    ));
    if(!resource)throw httpError('Only a published learning resource mapped to this concept can be attached',400);
  }
  if(input.assessmentId){
    ({rows:[assessment]}=await query<AssessmentRow>(
      `SELECT la.id,la.title FROM learning_assessments la
       WHERE la.id=$1 AND la.review_status='PUBLISHED'
         AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM learning_assessment_concepts lac WHERE lac.assessment_id=la.id AND lac.concept_id=$2))`,
      [input.assessmentId,conceptId],
    ));
    if(!assessment)throw httpError('Only a published assessment mapped to this concept can be attached',400);
  }
  if(!resource&&!assessment&&!conceptId)throw httpError('Attach a canonical concept, published resource or published assessment',400);
  const { rows:[post] }=await query<QueryResultRow>(
    `INSERT INTO collaboration_group_posts
      (group_id,author_id,body,is_announcement,concept_id,learning_resource_id,learning_assessment_id,learning_label)
     VALUES($1,$2,$3,TRUE,$4,$5,$6,$7) RETURNING *`,
    [groupId,userId,input.body.trim(),conceptId,resource?.id||null,assessment?.id||null,clean(input.label)||resource?.title||assessment?.title||null],
  );
  if(!post)throw new Error('Learning Community post insert returned no row');
  return post;
}
