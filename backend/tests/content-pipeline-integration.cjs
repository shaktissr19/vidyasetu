const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
let db, pipeline, factory, quality, admin, discovery, learner, publicLearning;
const adminId = '00000000-0000-0000-0000-000000000001';
const migrations = [
 '014_student_identity_enrollment.sql','020_learning_platform_foundation.sql','021_learning_original_academic_starter.sql',
 '022_learning_practice_personalization.sql','023_global_learning_bulk_importer.sql','024_student_global_grade_sync.sql',
 '026_learning_concepts_mastery.sql','027_student_concept_mastery_runtime.sql','028_grounded_ai_doubt_resolution.sql',
 '036_learning_content_quality_governance.sql','044_learning_entitlements_canonical_runtime.sql',
 '045_learning_ai_content_creator.sql','046_learning_creator_source_discovery.sql','047_learning_source_registry_video_discovery.sql',
 '048_learning_content_factory_foundation.sql','049_learning_source_library_handoff.sql','050_unified_registration_role_linking.sql',
 '051_learning_content_pipeline.sql','052_learning_content_integration.sql',
];
async function sqlFile(file) {
 let sql = fs.readFileSync(path.join(root, file),'utf8').replace(/^\\.*$/gm,'').replace(/CREATE EXTENSION IF NOT EXISTS[^;]+;/g,'');
 try {
   // Match psql autocommit for enum additions, before the migration's explicit BEGIN.
   for (const addition of sql.match(/ALTER TYPE [^;]+ADD VALUE IF NOT EXISTS[^;]+;/g) || []) { await db.exec(addition); sql=sql.replace(addition,''); }
   await db.exec(sql);
 } catch (e) { throw new Error(`${file}: ${e.message}`); }
}
before(async () => {
 db = new PGlite();
 await db.exec('CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE SQL AS $$ SELECT gen_random_uuid() $$;');
 await sqlFile('database/run_all_migrations.sql');
 await sqlFile('database/seeds/dev_seed.sql');
 for (const migration of migrations) await sqlFile(`database/migrations/${migration}`);
 await sqlFile('database/migrations/052_learning_content_integration.sql'); // idempotency
 const query = (sql, params=[]) => db.query(sql,params);
 const dbModule = require.resolve('../dist/config/db');
 require.cache[dbModule] = { id: dbModule,filename: dbModule,loaded: true,exports: {
   query,transaction: (fn) => db.transaction((tx) => fn({ query: (sql,params=[]) => tx.query(sql,params) })),
 }};
 const s3Module = require.resolve('../dist/config/s3');
 require.cache[s3Module] = {id:s3Module,filename:s3Module,loaded:true,exports:{getDownloadUrl: async (key) => `https://signed.invalid/${key}`}};
 pipeline = require('../dist/services/learningContentPipeline.service');
 factory = require('../dist/services/adminContentFactory.service');
 quality = require('../dist/services/learningQuality.service');
 admin = require('../dist/services/adminLearning.service');
 discovery = require('../dist/services/adminContentSourceDiscovery.service');
 learner = require('../dist/services/studentCanonicalLearning.service');
 publicLearning = require('../dist/services/publicLearning.service');
}, { timeout: 120000 });
after(async () => { if (db) await db.close(); });
const base = { sourceCode:'VIDYASETU_ORIGINAL',title:'Counting objects',titleHi:'वस्तुओं की गिनती',mediaKind:'ARTICLE',deliveryMode:'VIDYASETU_ORIGINAL',category:'LIFE_SKILLS',gradeCodes:['UKG'],boardCodes:['COMMON'],visibility:'PUBLIC',accessRequirement:'PUBLIC',bodyMarkdown:'# Count\n\nCount objects.',bodyMarkdownHi:'# गिनें\n\nवस्तुओं की गिनती करें।',summary:'Count together.',summaryHi:'साथ गिनें।',difficulty:'EASY' };
test('original early-years content materialises once and stays unpublished',async () => {
 const staged = await pipeline.stageContent(base,adminId);
 await pipeline.approveIntake(staged.intakeId,adminId);
 const first = await pipeline.materialiseIntake(staged.intakeId,adminId);
 const second = await pipeline.materialiseIntake(staged.intakeId,adminId);
 assert.equal(second.resourceId,first.resourceId);
 assert.equal(second.alreadyImported,true);
 const row=(await db.query('SELECT * FROM learning_resources WHERE id=$1',[first.resourceId])).rows[0];
 assert.equal(row.review_status,'DRAFT');assert.equal(row.title_hi,base.titleHi);assert.equal(row.difficulty,'EASY');
 await assert.rejects(pipeline.stageContent({...base,sourceUrl:row.source_url},adminId),/already in Content Library/);
 const readiness = await quality.getResourceReadiness(first.resourceId);
 assert.equal(readiness.checks.find((check)=>check.code==='CURRICULUM_SCOPE').passed,true);
});
test('discovered candidate can be configured, rights reviewed and materialised through one pipeline',async () => {
 const source=(await db.query("SELECT id FROM learning_content_sources WHERE code='DIKSHA'")).rows[0];
 const url='https://diksha.gov.in/play/content/integration-test-video';
 const intake=(await db.query("INSERT INTO learning_source_intake(source_id,title,source_url,created_by) VALUES($1,'Decimal video',$2,$3) RETURNING id",[source.id,url,adminId])).rows[0];
 await assert.rejects(pipeline.verifyRights(intake.id,{licenceCandidate:'CC_BY',attributionText:'Creator',rightsEvidenceUrl:url},adminId),/Complete delivery/);
 const staged = await pipeline.stageContent({...base,sourceCode:'DIKSHA',sourceUrl:url,title:'Decimal video',mediaKind:'VIDEO',deliveryMode:'OFFICIAL_EMBED',embedUrl:'https://player.vimeo.com/video/123456',licenceCandidate:'CC_BY',gradeCodes:['CLASS_6'],category:'ACADEMIC',accessRequirement:'SUBSCRIBER',visibility:'CLASS_ONLY'},adminId);
 assert.equal(staged.intakeId,intake.id);
 await assert.rejects(pipeline.approveIntake(intake.id,adminId),/verify rights/);
 await assert.rejects(pipeline.verifyRights(intake.id,{licenceCandidate:'CC_BY',attributionText:'Creator'},adminId),/evidence URL/);
 await pipeline.verifyRights(intake.id,{licenceCandidate:'CC_BY',attributionText:'Creator',rightsEvidenceUrl:url},adminId);
 await pipeline.approveIntake(intake.id,adminId);
 const result=await pipeline.materialiseIntake(intake.id,adminId);
 const row=(await db.query('SELECT * FROM learning_resources WHERE id=$1',[result.resourceId])).rows[0];
 assert.equal(row.delivery_mode,'OFFICIAL_EMBED');assert.equal(row.class_min,6);assert.equal(row.external_url,'https://player.vimeo.com/video/123456');
 assert.equal(row.access_requirement,'SUBSCRIBER');assert.equal(row.review_status,'DRAFT');
});
test('wrong media type, unsupported player and non-commercial subscription are blocked',async () => {
 await assert.rejects(pipeline.stageContent({...base,mediaKind:'VIDEO',storageKey:'learning/test.mp4',mimeType:'text/html'},adminId),/Unsupported video/);
 await assert.rejects(pipeline.stageContent({...base,sourceCode:'DIKSHA',sourceUrl:'https://diksha.gov.in/test',deliveryMode:'OFFICIAL_EMBED',embedUrl:'https://evil.example/player',licenceCandidate:'CC_BY'},adminId),/not approved/);
 await assert.rejects(pipeline.stageContent({...base,sourceCode:'DIKSHA',sourceUrl:'https://diksha.gov.in/test',deliveryMode:'OFFICIAL_EMBED',embedUrl:'https://player.vimeo.com/video/456',licenceCandidate:'CC_BY_NC',accessRequirement:'SUBSCRIBER',visibility:'REGISTERED'},adminId),/Non-commercial/);
});
test('DOCX asset persists as a document and motivation needs no academic subject',async () => {
 const staged=await pipeline.stageContent({...base,title:'Study planning document',category:'MOTIVATION',mediaKind:'DOCUMENT',storageKey:'learning/test.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},adminId);
 await pipeline.approveIntake(staged.intakeId,adminId);
 const result=await pipeline.materialiseIntake(staged.intakeId,adminId);
 const row=(await db.query('SELECT * FROM learning_resources WHERE id=$1',[result.resourceId])).rows[0];
 assert.equal(row.resource_type,'DOCUMENT');assert.equal(row.category,'MOTIVATION');
});
test('changing Library access cannot bypass external licence policy',async () => {
 const staged=await pipeline.stageContent({...base,sourceCode:'DIKSHA',sourceUrl:'https://diksha.gov.in/nc-test',deliveryMode:'EXTERNAL_LINK',licenceCandidate:'CC_BY_NC',mediaKind:'EXTERNAL_LINK'},adminId);
 await pipeline.verifyRights(staged.intakeId,{licenceCandidate:'CC_BY_NC',attributionText:'Creator',rightsEvidenceUrl:'https://diksha.gov.in/nc-test'},adminId);
 await pipeline.approveIntake(staged.intakeId,adminId);
 const result=await pipeline.materialiseIntake(staged.intakeId,adminId);
 await assert.rejects(admin.updateLearningResourceAccessPolicy(result.resourceId,'REGISTERED','SUBSCRIBER'),/commercial-use/);
});

test('YouTube embedding stays free regardless of content licence',async () => {
 await assert.rejects(pipeline.stageContent({...base,sourceCode:'DIKSHA',sourceUrl:'https://diksha.gov.in/youtube',mediaKind:'VIDEO',deliveryMode:'OFFICIAL_EMBED',embedUrl:'https://www.youtube-nocookie.com/embed/abc',licenceCandidate:'CC_BY',accessRequirement:'SUBSCRIBER',visibility:'REGISTERED'},adminId),/YouTube embedded playback/);
});
test('safe draft correction records history and clears prior manual approvals',async () => {
 const staged=await pipeline.stageContent({...base,title:'Correctable lesson'},adminId);
 await pipeline.approveIntake(staged.intakeId,adminId);
 const result=await pipeline.materialiseIntake(staged.intakeId,adminId);
 await quality.setQualityGate('RESOURCE',result.resourceId,'SAFETY','PASS',adminId,'Checked');
 await pipeline.updateDraftDetails(result.resourceId,{...base,title:'Corrected lesson'},adminId);
 const revisions=(await db.query('SELECT snapshot FROM learning_resource_revisions WHERE resource_id=$1',[result.resourceId])).rows;
 assert.equal(revisions.length,1);assert.equal(revisions[0].snapshot.resource.title,'Correctable lesson');assert.ok(revisions[0].snapshot.relations.grades.length);
 const gate=(await db.query("SELECT status FROM learning_quality_gate_reviews WHERE entity_id=$1 AND gate_code='SAFETY'",[result.resourceId])).rows[0];
 assert.equal(gate.status,'PENDING');
 await db.query("UPDATE learning_resources SET review_status='PUBLISHED' WHERE id=$1",[result.resourceId]);
 await assert.rejects(pipeline.updateDraftDetails(result.resourceId,base,adminId),/Archive published/);
});
test('canonical curriculum, review, publication and subscriber access work together',async () => {
 const fixtureSubject=(await db.query('SELECT id,name,code FROM subjects LIMIT 1')).rows[0];
 await db.query(`INSERT INTO learning_concepts(code,name,academic_year,grade_id,subject_id,subject_code,registry_source) SELECT 'CI_COUNTING','Counting','2026-27',id,$1,$2,'Disposable integration fixture' FROM education_grade_levels WHERE code='CLASS_8'`,[fixtureSubject.id,fixtureSubject.code || fixtureSubject.name]);
 const concept=(await db.query(`SELECT lc.*,g.code AS grade_code,g.class_number FROM learning_concepts lc JOIN education_grade_levels g ON g.id=lc.grade_id WHERE lc.subject_id IS NOT NULL AND g.class_number=8 LIMIT 1`)).rows[0];
 assert.ok(concept,'Class 8 canonical curriculum fixture exists');
 const subject=(await db.query('SELECT name FROM subjects WHERE id=$1',[concept.subject_id])).rows[0];
 const input={...base,title:'Subscriber academic lesson',category:'ACADEMIC',gradeCodes:[concept.grade_code],subjectId:concept.subject_id,subjectLabel:subject.name,topicLabel:concept.name,conceptIds:[concept.id],journeyStage:'UNDERSTAND',visibility:'CLASS_ONLY',accessRequirement:'SUBSCRIBER'};
 const staged=await pipeline.stageContent(input,adminId);await pipeline.approveIntake(staged.intakeId,adminId);
 const result=await pipeline.materialiseIntake(staged.intakeId,adminId);
 await admin.updateLearningResourceStatus(result.resourceId,'SUBMITTED',adminId);
 await admin.updateLearningResourceStatus(result.resourceId,'ACADEMIC_REVIEW',adminId);
 await assert.rejects(admin.updateLearningResourceStatus(result.resourceId,'APPROVED',adminId),/not ready/);
 for(const gate of ['ACADEMIC_ACCURACY','AGE_APPROPRIATENESS','ENGLISH_QUALITY','HINDI_QUALITY','ACCESSIBILITY','SAFETY','COPYRIGHT_LICENSING','TECHNICAL_READINESS']) await quality.setQualityGate('RESOURCE',result.resourceId,gate,'PASS',adminId,'Test review');
 await admin.updateLearningResourceStatus(result.resourceId,'APPROVED',adminId);await admin.updateLearningResourceStatus(result.resourceId,'PUBLISHED',adminId);
 const resource=(await db.query('SELECT public_slug FROM learning_resources WHERE id=$1',[result.resourceId])).rows[0];
 await assert.rejects(publicLearning.getPublicLearningResource(resource.public_slug),/not found/);
 const student=(await db.query(`SELECT s.user_id FROM students s WHERE s.status='ACTIVE' LIMIT 1`)).rows[0];
 await db.query("UPDATE students SET grade_code=$2,grade_level='8' WHERE user_id=$1",[student.user_id,concept.grade_code]);
 await db.query('DELETE FROM learning_entitlements');
 await assert.rejects(learner.getCanonicalLearningResource(student.user_id,result.resourceId),/Subscriber/);
 await db.query("INSERT INTO learning_entitlements(user_id,entitlement_code,status) VALUES($1,'LEARNING_SUBSCRIBER','ACTIVE')",[student.user_id]);
 const allowed=await learner.getCanonicalLearningResource(student.user_id,result.resourceId);assert.equal(allowed.difficulty,'EASY');assert.equal(allowed.id,result.resourceId);
 await db.query("UPDATE learning_entitlements SET status='REVOKED' WHERE user_id=$1",[student.user_id]);
 await assert.rejects(learner.getCanonicalLearningResource(student.user_id,result.resourceId),/Subscriber/);
});
test('local discovery respects grade mappings and free-text subjects',async () => {
 const staged=await pipeline.stageContent({...base,title:'Unique UKG searchable counting',subjectLabel:'Mathematics'},adminId);await pipeline.approveIntake(staged.intakeId,adminId);
 const result=await pipeline.materialiseIntake(staged.intakeId,adminId);await db.query("UPDATE learning_resources SET review_status='APPROVED' WHERE id=$1",[result.resourceId]);
 const matches=await discovery.discoverSources({provider:'LOCAL',query:'Unique UKG searchable',gradeCode:'UKG',boardCode:'COMMON',subject:'Mathematics'},adminId);
 assert.equal(matches.candidates.length,1);
 const wrongGrade=await discovery.discoverSources({provider:'LOCAL',query:'Unique UKG searchable',gradeCode:'CLASS_6',classNumber:6,boardCode:'COMMON',subject:'Mathematics'},adminId);
 assert.equal(wrongGrade.candidates.length,0);
 const options=await factory.getFactoryOptions();assert.ok(options.grades.some((grade)=>grade.code==='PRE_NURSERY'));
});
test('configuration binds an existing intake even when its URL is not normalised',async () => {
 const source=(await db.query("SELECT id FROM learning_content_sources WHERE code='CBSE_ACADEMIC'")).rows[0];
 const row=(await db.query("INSERT INTO learning_source_intake(source_id,title,source_url,created_by) VALUES($1,'CBSE reference','https://cbseacademic.nic.in',$2) RETURNING id",[source.id,adminId])).rows[0];
 const staged=await pipeline.stageContent({...base,intakeId:row.id,sourceCode:'CBSE_ACADEMIC',sourceUrl:'https://cbseacademic.nic.in',deliveryMode:'EXTERNAL_LINK',mediaKind:'EXTERNAL_LINK',licenceCandidate:'EXTERNAL_LINK_ONLY'},adminId);
 assert.equal(staged.intakeId,row.id);
});
test('older Library schemas reject incomplete publication with a validation error',async () => {
 // Older regression jobs intentionally stop before migration 049; optional metadata must not cause SQL 500s.
 await db.exec('ALTER TABLE learning_resources DROP COLUMN chapter_label, DROP COLUMN topic_label;');
 const row=(await db.query("SELECT lr.id FROM learning_resources lr JOIN learning_content_sources s ON s.id=lr.source_id WHERE s.code='VIDYASETU_ORIGINAL' AND lr.asset_id IS NULL LIMIT 1")).rows[0];
 assert.ok(row);
 await db.query("UPDATE learning_resources SET review_status='DRAFT',title_hi=NULL WHERE id=$1",[row.id]);
 await assert.rejects(admin.updateLearningResourceStatus(row.id,'PUBLISHED',adminId),(error)=>error.statusCode===400 && /not publish-ready/.test(error.message));
});
