import type { QueryResultRow } from 'pg';
import { query, transaction } from '../config/db';
import { getStudentContext, canonicalGradeCode } from './studentCanonicalLearning.service';

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const gates = ['ACADEMIC_ACCURACY','AGE_APPROPRIATENESS','ACCESSIBILITY','TECHNICAL_READINESS','SAFETY'] as const;

export interface AssetNodeInput {
  topicId: string; medium: 'en'|'hi'; visibility: 'PUBLIC'|'CLASS_RESTRICTED'|'SCHOOL_PRIVATE'; schoolId?: string|null;
}
export interface BulkAssetNodeInput extends AssetNodeInput { fileName: string; }

export async function mapAsset(assetId: string, input: AssetNodeInput, actorId: string) {
  return transaction(async client => {
    const { rows: [row] } = await client.query(`
      SELECT a.id AS asset_id,lr.id AS resource_id,lr.subject_id,cs.subject_id AS curriculum_subject_id,cs.class_name,cv.board_id,cv.medium,
             cv.id AS version_id,ct.id AS topic_id,cv.publication_status,ct.is_retired
      FROM learning_content_assets a JOIN learning_resources lr ON lr.asset_id=a.id
      JOIN curriculum_topics ct ON ct.id=$2::uuid
      JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id
      JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id
      JOIN curriculum_versions cv ON cv.id=cs.curriculum_version_id
      WHERE a.id=$1::uuid AND ct.is_retired=FALSE`, [assetId,input.topicId]);
    if (!row) throw fail('Asset or curriculum topic was not found',404);
    if (row.publication_status!=='PUBLISHED') throw fail('Assets can only be mapped to a published framework topic',409);
    if (row.medium!==input.medium) throw fail('Asset language must match the framework medium',409);
    if (row.subject_id!==row.curriculum_subject_id) throw fail('Resource subject must match the selected syllabus topic',409);
    const { rows: [scope] } = await client.query(`
      SELECT EXISTS(SELECT 1 FROM learning_resource_grades rg JOIN education_grade_levels g ON g.id=rg.grade_id WHERE rg.resource_id=$1 AND g.code=$2) AS grade_ok,
             EXISTS(SELECT 1 FROM learning_resource_boards rb WHERE rb.resource_id=$1 AND rb.board_id=$3) AS board_ok`,
      [row.resource_id,row.class_name,row.board_id]);
    if (!scope.grade_ok || !scope.board_ok) throw fail('Resource board and class must match the selected syllabus topic',409);
    if (input.visibility==='SCHOOL_PRIVATE' && !input.schoolId) throw fail('School-private mappings require a school');
    if (input.visibility!=='SCHOOL_PRIVATE' && input.schoolId) throw fail('A school is only allowed for school-private mappings');
    await client.query(`INSERT INTO learning_asset_nodes(asset_id,topic_id,board_id,grade_code,subject_id,medium,visibility,school_id,created_by)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,$6,$7,$8::uuid,$9::uuid)
      ON CONFLICT DO NOTHING`,[assetId,input.topicId,row.board_id,row.class_name,row.subject_id,input.medium,input.visibility,input.schoolId||null,actorId]);
    await client.query(`INSERT INTO learning_asset_moderation(asset_id) VALUES($1::uuid) ON CONFLICT DO NOTHING`,[assetId]);
    await audit(client,assetId,actorId,'TOPIC_MAPPED',{topicId:input.topicId,visibility:input.visibility,medium:input.medium});
    return {mapped:true};
  });
}

export async function bulkMapAssets(rows: BulkAssetNodeInput[], actorId: string, commit = false) {
  if (!rows.length || rows.length > 1000) throw fail('Import between 1 and 1,000 mapping rows');
  return transaction(async client => {
    const resolved: Array<{row:BulkAssetNodeInput;assetId:string}> = [];
    const errors: Array<{row:number;message:string}> = [];
    for (const [index,row] of rows.entries()) {
      const {rows:assets}=await client.query('SELECT id FROM learning_content_assets WHERE lower(original_file_name)=lower($1) ORDER BY created_at DESC LIMIT 2',[row.fileName.trim()]);
      if (assets.length!==1) { errors.push({row:index+1,message:assets.length?'File name is ambiguous; rename uploads to be unique':'Uploaded file name was not found'}); continue; }
      const {rows:[topic]}=await client.query(`SELECT ct.id,ct.is_retired,cv.board_id,cv.medium,cv.publication_status,cs.class_name,cs.subject_id
        FROM curriculum_topics ct JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id JOIN curriculum_versions cv ON cv.id=cs.curriculum_version_id WHERE ct.id=$1::uuid`,[row.topicId]);
      if(!topic || topic.is_retired || topic.publication_status!=='PUBLISHED') { errors.push({row:index+1,message:'Topic ID must belong to a published framework'}); continue; }
      if(topic.medium!==row.medium) { errors.push({row:index+1,message:'Mapping language does not match the framework medium'}); continue; }
      if(row.visibility==='SCHOOL_PRIVATE'&&!row.schoolId) { errors.push({row:index+1,message:'School-private mappings require schoolId'}); continue; }
      if(row.visibility!=='SCHOOL_PRIVATE'&&row.schoolId) { errors.push({row:index+1,message:'schoolId is only valid for school-private mappings'}); continue; }
      const {rows:[scope]}=await client.query(`SELECT EXISTS(SELECT 1 FROM learning_resources lr JOIN learning_resource_grades rg ON rg.resource_id=lr.id JOIN education_grade_levels g ON g.id=rg.grade_id WHERE lr.asset_id=$1::uuid AND g.code=$2) AS grade_ok,
        EXISTS(SELECT 1 FROM learning_resources lr JOIN learning_resource_boards rb ON rb.resource_id=lr.id WHERE lr.asset_id=$1::uuid AND rb.board_id=$3::uuid) AS board_ok,
        EXISTS(SELECT 1 FROM learning_resources lr WHERE lr.asset_id=$1::uuid AND lr.subject_id=$4::uuid) AS subject_ok`,[assets[0].id,topic.class_name,topic.board_id,topic.subject_id]);
      if(!scope.grade_ok||!scope.board_ok||!scope.subject_ok) { errors.push({row:index+1,message:'Uploaded resource board, class and subject must match topic'}); continue; }
      resolved.push({row,assetId:assets[0].id});
    }
    if(commit&&!errors.length) for(const {row,assetId} of resolved) {
      await client.query(`INSERT INTO learning_asset_nodes(asset_id,topic_id,board_id,grade_code,subject_id,medium,visibility,school_id,created_by)
        SELECT $1::uuid,ct.id,cv.board_id,cs.class_name,cs.subject_id,$3,$4,$5::uuid,$6::uuid
        FROM curriculum_topics ct JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id JOIN curriculum_versions cv ON cv.id=cs.curriculum_version_id
        WHERE ct.id=$2::uuid ON CONFLICT DO NOTHING`,[assetId,row.topicId,row.medium,row.visibility,row.schoolId||null,actorId]);
      await client.query('INSERT INTO learning_asset_moderation(asset_id) VALUES($1::uuid) ON CONFLICT DO NOTHING',[assetId]);
      await audit(client,assetId,actorId,'TOPIC_MAPPED',{topicId:row.topicId,bulkImport:true});
    }
    return {valid:errors.length===0,rowCount:rows.length,mappedCount:resolved.length,errors,committed:commit&&!errors.length};
  });
}

async function audit(client: {query: (sql:string,params?:unknown[])=>Promise<unknown>},assetId:string,actorId:string,action:string,details:unknown) {
  await client.query('INSERT INTO learning_asset_governance_audit(asset_id,actor_id,action,details) VALUES($1::uuid,$2::uuid,$3,$4::jsonb)',[assetId,actorId,action,JSON.stringify(details)]);
}

export async function assignReviewer(subjectId:string,reviewerId:string,actorId:string) {
  const {rows:[user]}=await query("SELECT id FROM users WHERE id=$1::uuid AND role='TEACHER' AND status='ACTIVE'",[reviewerId]);
  if(!user) throw fail('Reviewer must be an active teacher account');
  await query(`INSERT INTO learning_asset_review_assignments(subject_id,reviewer_id,assigned_by,active)
    VALUES($1::uuid,$2::uuid,$3::uuid,TRUE) ON CONFLICT(subject_id,reviewer_id) DO UPDATE SET active=TRUE,assigned_by=EXCLUDED.assigned_by`,[subjectId,reviewerId,actorId]);
  return {assigned:true};
}

export async function reviewQueue(reviewerId:string,isAdmin=false) {
  const {rows}=await query(`SELECT DISTINCT a.id AS asset_id,lr.id AS resource_id,lr.title,lr.resource_type,lr.subject_id,
      a.rights_status,a.version_number,lr.review_status,
      COALESCE(jsonb_object_agg(c.gate_code,c.status) FILTER(WHERE c.gate_code IS NOT NULL),'{}'::jsonb) AS checklist
    FROM learning_content_assets a JOIN learning_resources lr ON lr.asset_id=a.id
    LEFT JOIN learning_asset_checklist c ON c.asset_id=a.id
    LEFT JOIN learning_asset_review_assignments ra ON ra.subject_id=lr.subject_id AND ra.active=TRUE AND ra.reviewer_id=$1::uuid
    WHERE ($2::boolean OR ra.reviewer_id IS NOT NULL) AND a.rights_status='VERIFIED' AND lr.review_status IN('SUBMITTED','ACADEMIC_REVIEW')
      AND COALESCE((SELECT state FROM learning_asset_moderation WHERE asset_id=a.id),'ACTIVE')='ACTIVE'
    GROUP BY a.id,lr.id ORDER BY lr.updated_at`,[reviewerId,isAdmin]);
  return rows;
}

export async function setChecklist(assetId:string,gateCode:string,status:string,note:string|null,reviewerId:string,isAdmin=false) {
  if(!gates.includes(gateCode as typeof gates[number])) throw fail('Unknown review checklist item');
  return transaction(async client=>{
    const {rows:[asset]}=await client.query(`SELECT a.id,lr.subject_id FROM learning_content_assets a JOIN learning_resources lr ON lr.asset_id=a.id WHERE a.id=$1::uuid FOR UPDATE OF a`,[assetId]);
    if(!asset) throw fail('Asset not found',404);
    if(!isAdmin) {
      const {rows:[assignment]}=await client.query('SELECT 1 FROM learning_asset_review_assignments WHERE subject_id=$1 AND reviewer_id=$2::uuid AND active=TRUE',[asset.subject_id,reviewerId]);
      if(!assignment) throw fail('You are not assigned to review this subject',403);
    }
    await client.query(`INSERT INTO learning_asset_checklist(asset_id,gate_code,status,note,reviewer_id,reviewed_at)
      VALUES($1::uuid,$2,$3,$4,$5::uuid,NOW()) ON CONFLICT(asset_id,gate_code) DO UPDATE SET status=EXCLUDED.status,note=EXCLUDED.note,reviewer_id=EXCLUDED.reviewer_id,reviewed_at=NOW()`,[assetId,gateCode,status,note,reviewerId]);
    await audit(client,assetId,reviewerId,'CHECKLIST_UPDATED',{gateCode,status,note});
    return {saved:true};
  });
}

export async function assertReadyForAcademicReview(resourceId:string) {
  const {rows:[asset]}=await query('SELECT id,rights_status FROM learning_content_assets WHERE resource_id=$1::uuid',[resourceId]);
  if(!asset) return; // Preserve the existing Library path for resources with no uploaded asset.
  if(asset.rights_status!=='VERIFIED') throw fail('Rights must be verified before academic review',409);
  const {rows:[result]}=await query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status IN('PASS','NOT_APPLICABLE'))::int AS ready FROM learning_asset_checklist WHERE asset_id=$1::uuid`,[asset.id]);
  if(result.total!==gates.length || result.ready!==gates.length) throw fail('Complete all five asset review checklist items before academic review',409);
}

export async function setTakedown(assetId:string,state:'ACTIVE'|'TAKEN_DOWN',reason:string,actorId:string) {
  return transaction(async client=>{
    const {rows:[asset]}=await client.query('SELECT id FROM learning_content_assets WHERE id=$1::uuid FOR UPDATE',[assetId]);
    if(!asset) throw fail('Asset not found',404);
    await client.query(`INSERT INTO learning_asset_moderation(asset_id,state,reason,changed_by,changed_at) VALUES($1::uuid,$2,$3,$4::uuid,NOW())
      ON CONFLICT(asset_id) DO UPDATE SET state=EXCLUDED.state,reason=EXCLUDED.reason,changed_by=EXCLUDED.changed_by,changed_at=NOW()`,[assetId,state,reason.trim()||null,actorId]);
    await audit(client,assetId,actorId,state==='TAKEN_DOWN'?'TAKEDOWN':'RESTORED',{reason});
    return {assetId,state};
  });
}

export async function snapshotAsset(assetId:string,actorId:string) {
  return transaction(async client=>{
    const {rows:[asset]}=await client.query('SELECT * FROM learning_content_assets WHERE id=$1::uuid FOR UPDATE',[assetId]);
    if(!asset) throw fail('Asset not found',404);
    const next=Number(asset.version_number||1)+1;
    await client.query('INSERT INTO learning_asset_versions(asset_id,version_number,snapshot,changed_by) VALUES($1::uuid,$2,$3::jsonb,$4::uuid)',[assetId,asset.version_number,JSON.stringify(asset),actorId]);
    await client.query('UPDATE learning_content_assets SET version_number=$2,updated_at=NOW() WHERE id=$1::uuid',[assetId,next]);
    await audit(client,assetId,actorId,'VERSION_CREATED',{versionNumber:next});
    return {versionNumber:next};
  });
}

export async function assetHistory(assetId:string) {
  const [versions,auditRows]=await Promise.all([
    query('SELECT version_number,snapshot,changed_by,created_at FROM learning_asset_versions WHERE asset_id=$1::uuid ORDER BY version_number DESC',[assetId]),
    query('SELECT action,details,actor_id,created_at FROM learning_asset_governance_audit WHERE asset_id=$1::uuid ORDER BY created_at DESC LIMIT 100',[assetId]),
  ]);
  return {versions:versions.rows,audit:auditRows.rows};
}

export async function topicAnalytics() {
  const {rows}=await query(`SELECT ct.id AS topic_id,ct.title AS topic,cs.display_name AS subject,
    COUNT(*) FILTER(WHERE e.event_code IN('PLAY_START','AUDIO_PLAY'))::int AS starts,
    COALESCE(SUM(e.duration_secs) FILTER(WHERE e.event_code='WATCH_PROGRESS'),0)::int AS watch_time_secs,
    ROUND(100.0*COUNT(*) FILTER(WHERE e.event_code='COMPLETED')/NULLIF(COUNT(*) FILTER(WHERE e.event_code IN('PLAY_START','AUDIO_PLAY')),0),1) AS completion_rate,
    ROUND(AVG(e.result_pct) FILTER(WHERE e.event_code='QUIZ_RESULT'),1) AS quiz_average,
    COUNT(*) FILTER(WHERE e.event_code='DOUBT')::int AS doubts
    FROM curriculum_topics ct JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id
    LEFT JOIN learning_asset_usage_events e ON e.topic_id=ct.id AND e.created_at>NOW()-INTERVAL '90 days'
    GROUP BY ct.id,ct.title,cs.display_name ORDER BY cs.display_name,ct.sort_order LIMIT 1000`);
  return rows;
}

export async function assetLibrary() {
  const {rows}=await query(`SELECT a.id AS asset_id,a.asset_kind,a.language,a.duration_secs,a.difficulty,a.rights_status,
    a.ai_generated,a.version_number,lr.id AS resource_id,lr.title,lr.resource_type,lr.review_status,lr.subject_id,
    COUNT(DISTINCT n.topic_id)::int AS mapped_topics,
    COALESCE(jsonb_object_agg(c.gate_code,c.status) FILTER(WHERE c.gate_code IS NOT NULL),'{}'::jsonb) AS checklist,
    COALESCE((SELECT state FROM learning_asset_moderation WHERE asset_id=a.id),'ACTIVE') AS moderation_state
    FROM learning_content_assets a JOIN learning_resources lr ON lr.asset_id=a.id
    LEFT JOIN learning_asset_nodes n ON n.asset_id=a.id LEFT JOIN learning_asset_checklist c ON c.asset_id=a.id
    GROUP BY a.id,lr.id ORDER BY lr.updated_at DESC LIMIT 1000`);
  return rows;
}

export async function governanceOptions() {
  const [subjects,reviewers]=await Promise.all([
    query('SELECT id,code,name FROM subjects ORDER BY name'),
    query("SELECT id,name FROM users WHERE role='TEACHER' AND status='ACTIVE' ORDER BY name NULLS LAST"),
  ]);
  return {subjects:subjects.rows,reviewers:reviewers.rows};
}

export async function reviewerWorkspace(userId:string) {
  const {rows}=await query(`SELECT DISTINCT sc.id AS class_id,sc.class_name,sc.section,cs.subject_code,sub.name AS subject_name,
    ct.id AS topic_id,ct.title AS topic,cc.title AS chapter,COALESCE(scc.status,'NOT_COVERED') AS teacher_status
    FROM teachers t JOIN teacher_assignments ta ON ta.teacher_id=t.id AND ta.school_id=t.school_id
    JOIN school_classes sc ON sc.id=ta.class_id AND sc.school_id=ta.school_id AND sc.is_active=TRUE
    JOIN schools sch ON sch.id=t.school_id
    JOIN education_grade_levels egl ON upper(sc.class_name)=egl.code OR lower(trim(sc.class_name))=lower(egl.name)
    JOIN subjects sub ON sub.code=ta.subject_code
    JOIN curriculum_versions cv ON cv.board_id=sch.board_id AND cv.publication_status='PUBLISHED'
    JOIN curriculum_subjects cs ON cs.curriculum_version_id=cv.id AND cs.subject_id=sub.id AND cs.class_name=egl.code
    JOIN curriculum_units cu ON cu.curriculum_subject_id=cs.id JOIN curriculum_topics ct ON ct.curriculum_unit_id=cu.id AND ct.is_retired=FALSE
    LEFT JOIN curriculum_chapters cc ON cc.id=ct.chapter_id
    LEFT JOIN syllabus_class_coverage scc ON scc.school_id=sc.school_id AND scc.class_name=egl.code AND scc.section=COALESCE(sc.section,'') AND scc.topic_id=ct.id
    WHERE t.user_id=$1::uuid AND t.status='ACTIVE' ORDER BY sc.class_name,sc.section,subject_name,cu.sort_order,ct.sort_order`,[userId]);
  return rows;
}

export async function coverageHeatmap() {
  const {rows}=await query(`SELECT cv.board_id,eb.code AS board_code,cv.academic_year,cv.medium,cs.class_name,cs.display_name AS subject,
    cc.title AS chapter,ct.title AS topic,ct.id AS topic_id,
    COALESCE(jsonb_object_agg(f.format,COALESCE(k.asset_count,0)),'{}'::jsonb) AS formats
    FROM curriculum_versions cv JOIN education_boards eb ON eb.id=cv.board_id
    JOIN curriculum_subjects cs ON cs.curriculum_version_id=cv.id JOIN curriculum_units cu ON cu.curriculum_subject_id=cs.id
    JOIN curriculum_topics ct ON ct.curriculum_unit_id=cu.id LEFT JOIN curriculum_chapters cc ON cc.id=ct.chapter_id
    CROSS JOIN (VALUES('VIDEO'),('AUDIO'),('TEXT'),('PDF'),('QUIZ'),('INTERACTIVE'),('IMAGE')) f(format)
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT a.id)::int AS asset_count FROM learning_asset_nodes n JOIN learning_content_assets a ON a.id=n.asset_id
      JOIN learning_resources lr ON lr.asset_id=a.id AND lr.review_status='PUBLISHED'
      LEFT JOIN learning_asset_moderation m ON m.asset_id=a.id
      WHERE n.topic_id=ct.id AND n.medium=cv.medium AND a.rights_status='VERIFIED' AND COALESCE(m.state,'ACTIVE')='ACTIVE'
        AND CASE WHEN a.asset_kind IN('ARTICLE','DOCUMENT') THEN 'TEXT' WHEN a.asset_kind IN('WORKSHEET','QUESTION_PAPER') THEN 'PDF' ELSE a.asset_kind END=f.format
    ) k ON TRUE
    WHERE cv.publication_status='PUBLISHED' AND ct.is_retired=FALSE
    GROUP BY cv.id,eb.code,cs.id,cu.id,ct.id,cc.id ORDER BY eb.code,cv.academic_year,cs.class_name,subject,cu.sort_order,ct.sort_order`);
  return rows;
}

export async function setClassCoverage(input:{userId:string;role:string;classId:string;topicId:string;status:'NOT_COVERED'|'IN_PROGRESS'|'COVERED'}) {
  const {rows:[target]}=await query(`SELECT sc.id,sc.school_id,egl.code AS class_name,sc.section,cs.subject_code,ct.id AS topic_id,
    t.id AS teacher_id,s.admin_user_id
    FROM school_classes sc JOIN schools s ON s.id=sc.school_id
    JOIN curriculum_topics ct ON ct.id=$2::uuid JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id
    JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id
    JOIN education_grade_levels egl ON upper(sc.class_name)=egl.code OR lower(trim(sc.class_name))=lower(egl.name)
    LEFT JOIN teachers t ON t.user_id=$1::uuid AND t.school_id=sc.school_id AND t.status='ACTIVE'
    WHERE sc.id=$3::uuid AND ct.is_retired=FALSE AND cs.class_name=egl.code`,[input.userId,input.topicId,input.classId]);
  if(!target) throw fail('Topic does not match the selected class',404);
  if(input.role==='TEACHER') {
    const {rows:[assignment]}=await query(`SELECT 1 FROM teacher_assignments WHERE teacher_id=$1::uuid AND school_id=$2::uuid AND class_id=$3::uuid AND (subject_code=$4 OR subject_code='*')`,[target.teacher_id,target.school_id,target.id,target.subject_code]);
    if(!target.teacher_id||!assignment) throw fail('You are not assigned to teach this class and subject',403);
  } else if(input.role==='SCHOOL_ADMIN' && target.admin_user_id!==input.userId) throw fail('You cannot update another school’s class coverage',403);
  const teacherId=input.role==='TEACHER'?target.teacher_id:null;
  await query(`INSERT INTO syllabus_class_coverage(school_id,class_name,section,topic_id,teacher_id,status)
    VALUES($1::uuid,$2,COALESCE($3,''),$4::uuid,$5::uuid,$6)
    ON CONFLICT(school_id,class_name,section,topic_id) DO UPDATE SET teacher_id=EXCLUDED.teacher_id,status=EXCLUDED.status,updated_at=NOW()`,[target.school_id,target.class_name,target.section,target.topic_id,teacherId,input.status]);
  return {topicId:input.topicId,classId:input.classId,status:input.status};
}

export async function recordAssetEvent(userId:string,resourceId:string,eventCode:string,durationSecs:number|null) {
  if(!['PLAY_START','WATCH_PROGRESS','COMPLETED','AUDIO_PLAY'].includes(eventCode)) throw fail('Unsupported player event');
  const student=await getStudentContext(userId);
  const grade=canonicalGradeCode(student);
  const {rows}=await query<QueryResultRow>(`SELECT DISTINCT a.id,lr.id AS resource_id,n.topic_id
    FROM learning_content_assets a JOIN learning_resources lr ON lr.asset_id=a.id
    JOIN learning_asset_nodes n ON n.asset_id=a.id
    WHERE lr.id=$1::uuid AND lr.review_status='PUBLISHED'
      AND n.board_id=(SELECT id FROM education_boards WHERE code=$2)
      AND n.grade_code=$3 AND n.medium=$4
      AND (n.visibility='PUBLIC' OR n.visibility='CLASS_RESTRICTED' OR (n.visibility='SCHOOL_PRIVATE' AND n.school_id=$5::uuid))
      AND COALESCE((SELECT state FROM learning_asset_moderation WHERE asset_id=a.id),'ACTIVE')='ACTIVE'
      AND a.rights_status='VERIFIED'`,[resourceId,student.board_code,grade,student.language==='hi'?'hi':'en',student.school_id]);
  if(!rows.length) throw fail('Asset is not available for this student',404);
  const first=rows[0];
  await query(`INSERT INTO learning_asset_usage_events(asset_id,resource_id,topic_id,event_code,duration_secs)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5)`,[first.id,first.resource_id,first.topic_id,eventCode,durationSecs]);
  return {recorded:true};
}

export async function recordAssessmentResults(assessmentId:string,resultPct:number) {
  if(!Number.isFinite(resultPct)||resultPct<0||resultPct>100) return;
  await query(`INSERT INTO learning_asset_usage_events(asset_id,resource_id,topic_id,event_code,result_pct)
    SELECT DISTINCT ON(n.topic_id) a.id,lr.id,n.topic_id,'QUIZ_RESULT',$2
    FROM learning_assessment_concepts lac JOIN curriculum_topic_concepts ctc ON ctc.concept_id=lac.concept_id
    JOIN learning_asset_nodes n ON n.topic_id=ctc.topic_id JOIN learning_content_assets a ON a.id=n.asset_id
    JOIN learning_resources lr ON lr.asset_id=a.id AND lr.review_status='PUBLISHED'
    LEFT JOIN learning_asset_moderation m ON m.asset_id=a.id
    WHERE lac.assessment_id=$1::uuid AND COALESCE(m.state,'ACTIVE')='ACTIVE' AND a.rights_status='VERIFIED' ORDER BY n.topic_id,a.id`,[assessmentId,resultPct]);
}

export async function recordTopicDoubt(topicId:string) {
  await query(`INSERT INTO learning_asset_usage_events(asset_id,resource_id,topic_id,event_code)
    SELECT DISTINCT ON(n.topic_id) a.id,lr.id,n.topic_id,'DOUBT'
    FROM learning_asset_nodes n JOIN learning_content_assets a ON a.id=n.asset_id
    JOIN learning_resources lr ON lr.asset_id=a.id AND lr.review_status='PUBLISHED'
    LEFT JOIN learning_asset_moderation m ON m.asset_id=a.id
    WHERE n.topic_id=$1::uuid AND COALESCE(m.state,'ACTIVE')='ACTIVE' AND a.rights_status='VERIFIED' ORDER BY n.topic_id,a.id`,[topicId]);
}
