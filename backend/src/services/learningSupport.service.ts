import type { QueryResultRow } from 'pg';
import type { UserRole, UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import { saveNotification } from './notification.service';
import * as learningVisibility from './learningVisibility.service';
import * as diagnosticVisibility from './diagnosticVisibility.service';

export type InterventionPriority = 'HIGH' | 'FOCUS' | 'ROUTINE';
export type InterventionStatus = 'OPEN' | 'PARENT_ACKNOWLEDGED' | 'IN_PROGRESS' | 'PTM_REQUESTED' | 'RESOLVED' | 'CLOSED';
export type InterventionStudentStatus = 'ASSIGNED' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'REMOVED';

export interface CreateInterventionInput {
  classId: UUID;
  subjectCode: string;
  conceptId?: UUID | null;
  studentIds: UUID[];
  teacherId?: UUID | null;
  title: string;
  reason: string;
  priority?: InterventionPriority;
  dueAt?: string | null;
  actionPlan?: {
    actionType?: string;
    instructions?: string;
    resourceId?: UUID | null;
    assessmentId?: UUID | null;
    estimatedMinutes?: number | null;
  } | null;
}

export interface UpdateInterventionInput {
  status: InterventionStatus;
  outcomeNote?: string | null;
}

export interface UpdateInterventionStudentInput {
  status: Extract<InterventionStudentStatus, 'IN_PROGRESS' | 'RESOLVED' | 'REMOVED'>;
  outcomeNote?: string | null;
}

interface IdRow extends QueryResultRow { id: UUID; }
interface TeacherRow extends QueryResultRow { id: UUID; user_id: UUID; name: string; }
interface StudentUserRow extends QueryResultRow { id: UUID; user_id: UUID; name: string; }
interface ParentRecipientRow extends QueryResultRow { user_id: UUID; }
interface EvidenceRow extends QueryResultRow {
  student_id: UUID;
  concept_id: UUID;
  proficiency_score: number | string;
  confidence_score: number | string;
  confidence_level: string;
  evidence_count: number | string;
  retention_status: string;
  dominant_misconception_code: string | null;
}
interface InterventionRow extends QueryResultRow {
  id: UUID;
  school_id: UUID;
  class_id: UUID;
  subject_code: string;
  concept_id: UUID | null;
  teacher_id: UUID;
  created_by: UUID;
  title: string;
  reason: string;
  priority: InterventionPriority;
  status: InterventionStatus;
  evidence_snapshot: Record<string, unknown>;
  action_plan: Record<string, unknown>;
  due_at: string | Date | null;
  resolved_at: string | Date | null;
  outcome_note: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  teacher_name?: string;
  concept_code?: string | null;
  concept_name?: string | null;
  concept_name_hi?: string | null;
  participant_count?: number | string;
  acknowledgement_count?: number | string;
  resolved_count?: number | string;
  community_group_id?: UUID | null;
}
interface InterventionStudentRow extends QueryResultRow {
  id: UUID;
  intervention_id: UUID;
  student_id: UUID;
  status: InterventionStudentStatus;
  parent_acknowledged_at: string | Date | null;
  parent_acknowledged_by: UUID | null;
  parent_note: string | null;
  resolved_at: string | Date | null;
  outcome_note: string | null;
  student_name?: string;
  student_code?: string;
}

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function clean(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

export async function learningSupportSchemaReady(): Promise<boolean> {
  const { rows: [row] } = await query<{ ready: boolean } & QueryResultRow>(
    `SELECT to_regclass('public.learning_interventions') IS NOT NULL
        AND to_regclass('public.learning_intervention_students') IS NOT NULL AS ready`,
  );
  return Boolean(row?.ready);
}

async function requireSchema(): Promise<void> {
  if (!await learningSupportSchemaReady()) throw httpError('Learning Support 2.0 is not initialized yet', 503);
}

async function teacherForScope(
  schoolId: UUID,
  userId: UUID,
  role: UserRole,
  classId: UUID,
  subjectCode: string,
  requestedTeacherId?: UUID | null,
): Promise<TeacherRow> {
  const normalizedSubject = subjectCode.trim().toUpperCase();
  if (role === 'TEACHER') {
    const { rows: [teacher] } = await query<TeacherRow>(
      `SELECT t.id,t.user_id,u.name
       FROM teachers t
       JOIN users u ON u.id=t.user_id
       JOIN teacher_assignments ta ON ta.teacher_id=t.id AND ta.school_id=t.school_id
       WHERE t.user_id=$1 AND t.school_id=$2 AND t.status='ACTIVE'
         AND ta.class_id=$3 AND ta.subject_code=$4
       ORDER BY ta.academic_year DESC LIMIT 1`,
      [userId, schoolId, classId, normalizedSubject],
    );
    if (!teacher) throw httpError('Teachers can create interventions only for their assigned class and subject', 403);
    return teacher;
  }

  if (role !== 'SCHOOL_ADMIN' && role !== 'SUPER_ADMIN') throw httpError('Teacher or School Admin access is required', 403);
  if (!requestedTeacherId) throw httpError('teacherId is required when a School Admin creates an intervention', 400);
  const { rows: [teacher] } = await query<TeacherRow>(
    `SELECT t.id,t.user_id,u.name
     FROM teachers t
     JOIN users u ON u.id=t.user_id
     JOIN teacher_assignments ta ON ta.teacher_id=t.id AND ta.school_id=t.school_id
     WHERE t.id=$1 AND t.school_id=$2 AND t.status='ACTIVE'
       AND ta.class_id=$3 AND ta.subject_code=$4
     ORDER BY ta.academic_year DESC LIMIT 1`,
    [requestedTeacherId, schoolId, classId, normalizedSubject],
  );
  if (!teacher) throw httpError('Selected Teacher is not assigned to this class and subject', 400);
  return teacher;
}

async function parentLinkedStudent(parentUserId: UUID, studentId: UUID): Promise<StudentUserRow> {
  const { rows: [student] } = await query<StudentUserRow>(
    `SELECT s.id,s.user_id,u.name
     FROM parent_student_links psl
     JOIN students s ON s.id=psl.student_id AND s.status='ACTIVE'
     JOIN users u ON u.id=s.user_id
     WHERE psl.parent_user_id=$1 AND s.id=$2 LIMIT 1`,
    [parentUserId, studentId],
  );
  if (!student) throw httpError('Access denied to this Student', 403);
  return student;
}

async function familyRecipients(studentIds: UUID[]): Promise<UUID[]> {
  if (!studentIds.length) return [];
  const { rows } = await query<ParentRecipientRow>(
    `SELECT DISTINCT user_id FROM (
       SELECT s.user_id FROM students s WHERE s.id=ANY($1::uuid[])
       UNION
       SELECT psl.parent_user_id AS user_id FROM parent_student_links psl WHERE psl.student_id=ANY($1::uuid[])
     ) x`,
    [studentIds],
  );
  return rows.map((row) => row.user_id);
}

function interventionSelect(where: string): string {
  return `SELECT li.*,tu.name AS teacher_name,lc.code AS concept_code,lc.name AS concept_name,lc.name_hi AS concept_name_hi,
    (SELECT COUNT(*) FROM learning_intervention_students lis WHERE lis.intervention_id=li.id AND lis.status<>'REMOVED')::int AS participant_count,
    (SELECT COUNT(*) FROM learning_intervention_students lis WHERE lis.intervention_id=li.id AND lis.parent_acknowledged_at IS NOT NULL AND lis.status<>'REMOVED')::int AS acknowledgement_count,
    (SELECT COUNT(*) FROM learning_intervention_students lis WHERE lis.intervention_id=li.id AND lis.status='RESOLVED')::int AS resolved_count,
    (SELECT cg.id FROM collaboration_groups cg WHERE cg.intervention_id=li.id AND cg.status<>'ARCHIVED' ORDER BY cg.created_at DESC LIMIT 1) AS community_group_id
    FROM learning_interventions li
    JOIN teachers t ON t.id=li.teacher_id JOIN users tu ON tu.id=t.user_id
    LEFT JOIN learning_concepts lc ON lc.id=li.concept_id
    WHERE ${where}`;
}

export async function getTeacherAcademicWorkspace(
  schoolId: UUID,
  userId: UUID,
  role: UserRole,
  classId: UUID,
  subjectCode: string,
  teacherIdInput?: UUID | null,
) {
  await requireSchema();
  const normalizedSubject = subjectCode.trim().toUpperCase();
  const [learning, diagnostics] = await Promise.all([
    learningVisibility.getSchoolLearningOverview(schoolId, userId, role, classId, normalizedSubject, teacherIdInput || null),
    diagnosticVisibility.getSchoolDiagnosticOverview(schoolId, userId, role, classId, normalizedSubject, teacherIdInput || null),
  ]);
  const params: unknown[] = [schoolId, classId, normalizedSubject];
  let where = 'li.school_id=$1 AND li.class_id=$2 AND li.subject_code=$3';
  if (role === 'TEACHER') {
    const teacher = await teacherForScope(schoolId, userId, role, classId, normalizedSubject, teacherIdInput);
    params.push(teacher.id);
    where += ` AND li.teacher_id=$${params.length}`;
  }
  const { rows: interventions } = await query<InterventionRow>(
    `${interventionSelect(where)} ORDER BY CASE li.status WHEN 'OPEN' THEN 0 WHEN 'PARENT_ACKNOWLEDGED' THEN 1 WHEN 'IN_PROGRESS' THEN 2 WHEN 'PTM_REQUESTED' THEN 3 ELSE 4 END,
      CASE li.priority WHEN 'HIGH' THEN 0 WHEN 'FOCUS' THEN 1 ELSE 2 END,li.created_at DESC LIMIT 100`,
    params,
  );
  return {
    scope: learning.scope,
    learning,
    diagnostics,
    interventions,
    actionSummary: {
      openInterventions: interventions.filter((item) => ['OPEN','PARENT_ACKNOWLEDGED','IN_PROGRESS','PTM_REQUESTED'].includes(item.status)).length,
      highPriority: interventions.filter((item) => item.priority === 'HIGH' && !['RESOLVED','CLOSED'].includes(item.status)).length,
      parentAcknowledged: interventions.filter((item) => Number(item.acknowledgement_count || 0) > 0).length,
      ptmRequested: interventions.filter((item) => item.status === 'PTM_REQUESTED').length,
    },
  };
}

export async function createLearningIntervention(
  schoolId: UUID,
  actorId: UUID,
  role: UserRole,
  input: CreateInterventionInput,
) {
  await requireSchema();
  const subjectCode = input.subjectCode.trim().toUpperCase();
  if (!input.studentIds?.length) throw httpError('Select at least one Student', 400);
  if (input.studentIds.length > 100) throw httpError('An intervention can include at most 100 Students', 400);
  const uniqueStudentIds = [...new Set(input.studentIds)] as UUID[];

  // Reuse the existing Learning Visibility boundary so intervention actions can
  // never widen Teacher/School access beyond the academic insight scope.
  const overview = await learningVisibility.getSchoolLearningOverview(
    schoolId, actorId, role, input.classId, subjectCode, role === 'TEACHER' ? null : input.teacherId || null,
  );
  const teacher = await teacherForScope(schoolId, actorId, role, input.classId, subjectCode, input.teacherId);
  const allowedStudents = new Set(overview.students.map((student) => student.studentId));
  const invalidStudent = uniqueStudentIds.find((id) => !allowedStudents.has(id));
  if (invalidStudent) throw httpError('Every selected Student must be active in the selected class', 400);
  if (input.conceptId && !overview.concepts.some((concept) => concept.conceptId === input.conceptId)) {
    throw httpError('Selected concept is not mapped to this class and subject', 400);
  }

  const evidence = input.conceptId
    ? (await query<EvidenceRow>(
        `SELECT student_id,concept_id,proficiency_score::float,confidence_score::float,
                confidence_level,evidence_count,retention_status,dominant_misconception_code
         FROM student_concept_intelligence
         WHERE student_id=ANY($1::uuid[]) AND concept_id=$2`,
        [uniqueStudentIds, input.conceptId],
      )).rows
    : [];
  const evidenceByStudent = new Map(evidence.map((row) => [row.student_id, row]));
  const evidenceSnapshot = uniqueStudentIds.map((studentId) => {
    const learningStudent = overview.students.find((item) => item.studentId === studentId);
    const conceptState = input.conceptId
      ? learningStudent?.concepts.find((item) => item.conceptId === input.conceptId)
      : undefined;
    const diagnostic = evidenceByStudent.get(studentId);
    return {
      studentId,
      masteryState: conceptState?.state || null,
      resourceCompletionPct: conceptState?.resourceCompletionPct ?? null,
      practiceBestPct: conceptState?.practiceBestPct ?? null,
      masteryPct: conceptState?.masteryPct ?? null,
      proficiencyScore: diagnostic ? Number(diagnostic.proficiency_score || 0) : null,
      confidenceScore: diagnostic ? Number(diagnostic.confidence_score || 0) : null,
      confidenceLevel: diagnostic?.confidence_level || null,
      evidenceCount: diagnostic ? Number(diagnostic.evidence_count || 0) : 0,
      retentionStatus: diagnostic?.retention_status || null,
      misconceptionCode: diagnostic?.dominant_misconception_code || null,
    };
  });

  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (dueAt && !Number.isFinite(dueAt.getTime())) throw httpError('dueAt is invalid', 400);
  const priority = input.priority || 'FOCUS';
  const intervention = await transaction(async (client) => {
    const { rows: [created] } = await client.query<InterventionRow>(
      `INSERT INTO learning_interventions
        (school_id,class_id,subject_code,concept_id,teacher_id,created_by,title,reason,priority,evidence_snapshot,action_plan,due_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12)
       RETURNING *`,
      [schoolId,input.classId,subjectCode,input.conceptId || null,teacher.id,actorId,input.title.trim(),input.reason.trim(),priority,
       JSON.stringify({ capturedAt: new Date().toISOString(), students: evidenceSnapshot }),JSON.stringify(input.actionPlan || {}),dueAt?.toISOString() || null],
    );
    if (!created) throw new Error('Learning intervention insert returned no row');
    for (const studentId of uniqueStudentIds) {
      await client.query(
        `INSERT INTO learning_intervention_students(intervention_id,student_id)
         VALUES($1,$2) ON CONFLICT(intervention_id,student_id) DO NOTHING`,
        [created.id, studentId],
      );
    }
    return created;
  });

  const recipients = await familyRecipients(uniqueStudentIds);
  await Promise.all(recipients.map((recipientId) => saveNotification({
    userId: recipientId,
    schoolId,
    type: 'LEARNING_INTERVENTION_ASSIGNED',
    title: `Learning support · ${intervention.title}`,
    body: 'A Teacher has recommended a focused VidyaSetu learning-support action. Open Learning Support to review it.',
    refId: intervention.id,
    refType: 'LEARNING_INTERVENTION',
  })));
  return getInterventionForTeacher(schoolId, actorId, role, intervention.id, teacher.id);
}

export async function getInterventionForTeacher(
  schoolId: UUID,
  userId: UUID,
  role: UserRole,
  interventionId: UUID,
  teacherIdInput?: UUID | null,
) {
  await requireSchema();
  const { rows: [intervention] } = await query<InterventionRow>(
    `${interventionSelect('li.id=$1 AND li.school_id=$2')} LIMIT 1`,
    [interventionId, schoolId],
  );
  if (!intervention) throw httpError('Learning intervention not found', 404);
  if (role === 'TEACHER') {
    const teacher = await teacherForScope(schoolId, userId, role, intervention.class_id, intervention.subject_code, teacherIdInput);
    if (teacher.id !== intervention.teacher_id) throw httpError('Teachers can open only their own interventions', 403);
  } else if (role !== 'SCHOOL_ADMIN' && role !== 'SUPER_ADMIN') {
    throw httpError('Teacher or School Admin access is required', 403);
  }
  const { rows: students } = await query<InterventionStudentRow>(
    `SELECT lis.*,u.name AS student_name,s.student_code
     FROM learning_intervention_students lis
     JOIN students s ON s.id=lis.student_id JOIN users u ON u.id=s.user_id
     WHERE lis.intervention_id=$1 ORDER BY u.name`,
    [interventionId],
  );
  return { ...intervention, students };
}

export async function updateLearningIntervention(
  schoolId: UUID,
  actorId: UUID,
  role: UserRole,
  interventionId: UUID,
  input: UpdateInterventionInput,
) {
  const current = await getInterventionForTeacher(schoolId, actorId, role, interventionId);
  const transitions: Record<InterventionStatus, InterventionStatus[]> = {
    OPEN: ['PARENT_ACKNOWLEDGED','IN_PROGRESS','PTM_REQUESTED','RESOLVED','CLOSED'],
    PARENT_ACKNOWLEDGED: ['IN_PROGRESS','PTM_REQUESTED','RESOLVED','CLOSED'],
    IN_PROGRESS: ['PTM_REQUESTED','RESOLVED','CLOSED'],
    PTM_REQUESTED: ['IN_PROGRESS','RESOLVED','CLOSED'],
    RESOLVED: ['CLOSED'],
    CLOSED: [],
  };
  if (!transitions[current.status].includes(input.status)) {
    throw httpError(`Intervention cannot move from ${current.status} to ${input.status}`, 409);
  }
  await transaction(async (client) => {
    await client.query(
      `UPDATE learning_interventions SET status=$2,outcome_note=$3,
         resolved_at=CASE WHEN $2='RESOLVED' THEN NOW() ELSE resolved_at END
       WHERE id=$1`,
      [interventionId,input.status,clean(input.outcomeNote)],
    );
    if (input.status === 'RESOLVED') {
      await client.query(
        `UPDATE learning_intervention_students SET status='RESOLVED',resolved_at=NOW(),outcome_note=COALESCE($2,outcome_note)
         WHERE intervention_id=$1 AND status<>'REMOVED'`,
        [interventionId,clean(input.outcomeNote)],
      );
    }
  });
  const studentIds = current.students.filter((row) => row.status !== 'REMOVED').map((row) => row.student_id);
  await Promise.all((await familyRecipients(studentIds)).map((recipientId) => saveNotification({
    userId: recipientId, schoolId, type: 'LEARNING_INTERVENTION_UPDATED', title: `Learning support updated · ${current.title}`,
    body: input.status === 'RESOLVED' ? 'The Teacher marked this learning-support action as resolved.' : `Status: ${input.status.replaceAll('_',' ')}`,
    refId: interventionId, refType: 'LEARNING_INTERVENTION',
  })));
  return getInterventionForTeacher(schoolId, actorId, role, interventionId);
}

export async function updateInterventionStudent(
  schoolId: UUID,
  actorId: UUID,
  role: UserRole,
  interventionId: UUID,
  studentId: UUID,
  input: UpdateInterventionStudentInput,
) {
  await getInterventionForTeacher(schoolId, actorId, role, interventionId);
  const { rows: [row] } = await query<InterventionStudentRow>(
    `UPDATE learning_intervention_students SET status=$3,outcome_note=$4,
       resolved_at=CASE WHEN $3='RESOLVED' THEN NOW() ELSE resolved_at END
     WHERE intervention_id=$1 AND student_id=$2 RETURNING *`,
    [interventionId,studentId,input.status,clean(input.outcomeNote)],
  );
  if (!row) throw httpError('Student is not part of this intervention', 404);
  return row;
}

function parentBrief(learning: Awaited<ReturnType<typeof learningVisibility.getParentLearningInsight>>, diagnostics: Awaited<ReturnType<typeof diagnosticVisibility.getParentDiagnosticInsight>>) {
  const parts: string[] = [];
  if (diagnostics.summary.strongConcepts) parts.push(`Evidence is strong in ${diagnostics.summary.strongConcepts} concept${diagnostics.summary.strongConcepts === 1 ? '' : 's'}.`);
  if (diagnostics.summary.reviewDue) parts.push(`${diagnostics.summary.reviewDue} previously learned concept${diagnostics.summary.reviewDue === 1 ? '' : 's'} need short revision.`);
  if (diagnostics.summary.needsSupport) parts.push(`${diagnostics.summary.needsSupport} concept${diagnostics.summary.needsSupport === 1 ? '' : 's'} currently need extra support or stronger evidence.`);
  if (diagnostics.summary.misconceptionSignals) parts.push(`VidyaSetu has detected ${diagnostics.summary.misconceptionSignals} repeated misunderstanding signal${diagnostics.summary.misconceptionSignals === 1 ? '' : 's'} worth addressing.`);
  if (!parts.length) parts.push(learning.headline || 'Learning evidence is still building through regular VidyaSetu activity.');
  return parts.join(' ');
}

export async function getParentLearningSupport(parentUserId: UUID, studentId: UUID) {
  await requireSchema();
  await parentLinkedStudent(parentUserId, studentId);
  const [learning, diagnostics] = await Promise.all([
    learningVisibility.getParentLearningInsight(parentUserId, studentId),
    diagnosticVisibility.getParentDiagnosticInsight(parentUserId, studentId),
  ]);
  const { rows: interventions } = await query<InterventionRow & InterventionStudentRow>(
    `SELECT li.*,lis.status AS student_status,lis.parent_acknowledged_at,lis.parent_note,lis.resolved_at AS student_resolved_at,
            lis.outcome_note AS student_outcome_note,tu.name AS teacher_name,lc.code AS concept_code,lc.name AS concept_name,lc.name_hi AS concept_name_hi,
            (SELECT cg.id FROM collaboration_groups cg WHERE cg.intervention_id=li.id AND cg.status<>'ARCHIVED' ORDER BY cg.created_at DESC LIMIT 1) AS community_group_id
     FROM learning_intervention_students lis
     JOIN learning_interventions li ON li.id=lis.intervention_id
     JOIN teachers t ON t.id=li.teacher_id JOIN users tu ON tu.id=t.user_id
     LEFT JOIN learning_concepts lc ON lc.id=li.concept_id
     WHERE lis.student_id=$1 AND lis.status<>'REMOVED'
     ORDER BY CASE li.status WHEN 'OPEN' THEN 0 WHEN 'PARENT_ACKNOWLEDGED' THEN 1 WHEN 'IN_PROGRESS' THEN 2 WHEN 'PTM_REQUESTED' THEN 3 ELSE 4 END,li.created_at DESC`,
    [studentId],
  );
  const supportCards = [
    ...diagnostics.misconceptionSignals.slice(0, 2).map((item) => ({
      type: 'MISCONCEPTION',
      title: `Clarify ${item.conceptName}`,
      titleHi: item.conceptNameHi ? `${item.conceptNameHi} को स्पष्ट करें` : null,
      text: 'A repeated misunderstanding is showing in learning evidence. Encourage the recommended lesson or short practice rather than repeating a full test.',
    })),
    ...learning.nextActions.slice(0, 3).map((action) => ({
      type: 'NEXT_ACTION', title: action.title, titleHi: null, text: `${action.reason} About ${action.estimatedMinutes} minutes.`,
    })),
  ].slice(0, 4);
  return {
    student: learning.student,
    weeklyBrief: parentBrief(learning, diagnostics),
    learning,
    diagnostics,
    supportCards,
    interventions,
    interventionSummary: {
      active: interventions.filter((item) => !['RESOLVED','CLOSED'].includes(item.status)).length,
      awaitingAcknowledgement: interventions.filter((item) => !item.parent_acknowledged_at && !['RESOLVED','CLOSED'].includes(item.status)).length,
      ptmRequested: interventions.filter((item) => item.status === 'PTM_REQUESTED').length,
      resolved: interventions.filter((item) => item.status === 'RESOLVED' || item.student_status === 'RESOLVED').length,
    },
  };
}

export async function acknowledgeParentIntervention(
  parentUserId: UUID,
  studentId: UUID,
  interventionId: UUID,
  note?: string | null,
) {
  await requireSchema();
  await parentLinkedStudent(parentUserId, studentId);
  const updated = await transaction(async (client) => {
    const { rows: [row] } = await client.query<InterventionStudentRow>(
      `SELECT * FROM learning_intervention_students WHERE intervention_id=$1 AND student_id=$2 FOR UPDATE`,
      [interventionId,studentId],
    );
    if (!row || row.status === 'REMOVED') throw httpError('Learning intervention is not available for this Student', 404);
    if (row.status === 'RESOLVED') throw httpError('This learning intervention is already resolved', 409);
    const { rows: [next] } = await client.query<InterventionStudentRow>(
      `UPDATE learning_intervention_students
       SET status=CASE WHEN status='ASSIGNED' THEN 'ACKNOWLEDGED' ELSE status END,
           parent_acknowledged_at=COALESCE(parent_acknowledged_at,NOW()),
           parent_acknowledged_by=COALESCE(parent_acknowledged_by,$3),parent_note=$4
       WHERE intervention_id=$1 AND student_id=$2 RETURNING *`,
      [interventionId,studentId,parentUserId,clean(note)],
    );
    if (!next) throw new Error('Parent acknowledgement update returned no row');
    const { rows: [pending] } = await client.query<{ count: number | string } & QueryResultRow>(
      `SELECT COUNT(*)::int AS count FROM learning_intervention_students
       WHERE intervention_id=$1 AND status<>'REMOVED' AND parent_acknowledged_at IS NULL`,
      [interventionId],
    );
    if (Number(pending?.count || 0) === 0) {
      await client.query(
        `UPDATE learning_interventions SET status='PARENT_ACKNOWLEDGED'
         WHERE id=$1 AND status='OPEN'`,
        [interventionId],
      );
    }
    return next;
  });
  const { rows: [intervention] } = await query<InterventionRow & { teacher_user_id: UUID }>(
    `SELECT li.*,t.user_id AS teacher_user_id FROM learning_interventions li JOIN teachers t ON t.id=li.teacher_id WHERE li.id=$1`,
    [interventionId],
  );
  if (intervention) {
    await saveNotification({
      userId: intervention.teacher_user_id, schoolId: intervention.school_id,
      type: 'LEARNING_INTERVENTION_ACKNOWLEDGED', title: 'Parent acknowledged learning support',
      body: 'A Parent has reviewed the recommended learning-support action.', refId: interventionId, refType: 'LEARNING_INTERVENTION',
    });
  }
  return updated;
}

export async function createInterventionCommunity(
  schoolId: UUID,
  actorId: UUID,
  role: UserRole,
  interventionId: UUID,
  name?: string | null,
) {
  const intervention = await getInterventionForTeacher(schoolId, actorId, role, interventionId);
  if (intervention.community_group_id) throw httpError('This intervention already has a Community', 409);
  const kind = 'MIXED';
  const { rows: [group] } = await query<QueryResultRow>(
    `INSERT INTO collaboration_groups
      (name,description,kind,scope,school_id,class_id,created_by,owner_id,max_members,learning_purpose,subject_code,concept_id,intervention_id)
     VALUES($1,$2,$3,'CLASS',$4,$5,$6,$6,$7,'INTERVENTION',$8,$9,$10)
     RETURNING *`,
    [clean(name) || `Learning support · ${intervention.title}`,
     `Moderated learning-support Community linked to intervention: ${intervention.reason}`,
     kind,schoolId,intervention.class_id,actorId,Math.max(10,Math.min(150,intervention.students.length + 10)),
     intervention.subject_code,intervention.concept_id,interventionId],
  );
  if (!group?.id) throw new Error('Learning Community insert returned no row');
  await query(
    `INSERT INTO collaboration_group_members(group_id,user_id,role,status,approved_by)
     VALUES($1,$2,'OWNER','ACTIVE',$2)`,
    [group.id,actorId],
  );
  // The Community deliberately remains PENDING. Platform moderation/approval
  // and recipient consent continue to apply through the existing Group flow.
  return group;
}
