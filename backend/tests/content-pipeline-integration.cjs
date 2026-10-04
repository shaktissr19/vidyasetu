const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
let syllabusStudentId;
let db, pipeline, factory, quality, admin, discovery, learner, publicLearning, acquisition, syllabus;
let scanCode=0, downloads=0, stored=[], deleted=[], responseBytes=Buffer.from("%PDF-1.7\nfixture"), responseMime="application/pdf";
const adminId = '00000000-0000-0000-0000-000000000001';
const migrations = [
 '014_student_identity_enrollment.sql','020_learning_platform_foundation.sql','021_learning_original_academic_starter.sql',
 '022_learning_practice_personalization.sql','023_global_learning_bulk_importer.sql','024_student_global_grade_sync.sql',
 '026_learning_concepts_mastery.sql','027_student_concept_mastery_runtime.sql','028_grounded_ai_doubt_resolution.sql',
 '036_learning_content_quality_governance.sql','044_learning_entitlements_canonical_runtime.sql',
 '045_learning_ai_content_creator.sql','046_learning_creator_source_discovery.sql','047_learning_source_registry_video_discovery.sql',
 '048_learning_content_factory_foundation.sql','049_learning_source_library_handoff.sql','050_unified_registration_role_linking.sql',
 '051_learning_content_pipeline.sql','052_learning_content_integration.sql','053_verified_syllabus_workspace.sql',
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
 await sqlFile('database/migrations/053_verified_syllabus_workspace.sql');
 const query = (sql, params=[]) => db.query(sql,params);
 const dbModule = require.resolve('../dist/config/db');
 require.cache[dbModule] = { id: dbModule,filename: dbModule,loaded: true,exports: {
   query,transaction: (fn) => db.transaction((tx) => fn({ query: (sql,params=[]) => tx.query(sql,params) })),
 }};
 const s3Module = require.resolve('../dist/config/s3');
 require.cache[s3Module] = {id:s3Module,filename:s3Module,loaded:true,exports:{getDownloadUrl: async (key) => `https://signed.invalid/${key}`,BUCKET:'test-private',s3:{putObject:params=>({promise:async()=>{stored.push(params);}})},deleteObject:async key=>{deleted.push(key);}}};
 // Mock only external IO: all pipeline SQL and authorization use the disposable database.
 require('axios').default.get=async (_url,options)=>{downloads++;assert.equal(options.maxRedirects,0);assert.equal(options.proxy,false);assert.equal(options.timeout,60000);return {data:responseBytes,headers:{'content-type':responseMime}};};
 require('dns/promises').lookup=async()=>[{address:'8.8.8.8',family:4}];
 require('child_process').spawn=()=>{const child=new(require('events').EventEmitter)();child.stdin=new(require('events').EventEmitter)();child.stdin.end=()=>setImmediate(()=>child.emit('close',scanCode));child.kill=()=>{};return child;};
 acquisition=require('../dist/services/learningSourceAcquisition.service');
 syllabus=require('../dist/services/syllabus.service');
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
test('acquisition rejects unsafe URLs, addresses, disguises and unsupported deliveries',async()=>{
 for(const url of ['http://obj.diksha.gov.in/a','https://obj.diksha.gov.in.evil.test/a','https://user:pass@obj.diksha.gov.in/a','https://127.0.0.1/a','https://obj.diksha.gov.in/a?token=secret']) assert.throws(()=>acquisition.approvedAssetUrl(url));
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.0.1','::1','::ffff:127.0.0.1','100.64.0.1']) assert.equal(acquisition.publicAddress(ip),false);
 assert.equal(acquisition.publicAddress('8.8.8.8'),true);
 assert.throws(()=>acquisition.inspectImportedBytes(Buffer.from('<html>login</html>'),'PDF','application/pdf'),/bytes do not match/);
 assert.equal(acquisition.deliveryCapability({embed_url:'https://obj.diksha.gov.in/video.mp4'}).code,'REFERENCE');
 assert.equal(acquisition.deliveryCapability({embed_url:'https://www.youtube.com/embed/abc123'}).code,'EMBED');
 assert.equal(acquisition.deliveryCapability({metadata:{artifactUrl:'https://obj.diksha.gov.in/file.pdf'}}).code,'IMPORT');
 assert.equal(acquisition.deliveryCapability({resource_id:'existing'}).code,'LIBRARY');
});
test('licensed acquisition scans, persists evidence atomically, blocks replacement and stays a draft',async()=>{
 const payload={...base,sourceCode:'DIKSHA',sourceUrl:'https://diksha.gov.in/acquisition-fixture',mediaKind:'PDF',deliveryMode:'LICENSED_REHOST',licenceCandidate:'CC_BY',licenceUrl:'https://creativecommons.org/licenses/by/4.0/',rightsEvidenceUrl:'https://diksha.gov.in/acquisition-fixture',attributionText:'Fixture author · CC BY 4.0',assetUrl:'https://obj.diksha.gov.in/fixture.pdf',permissionConfirmed:true};
 const start=downloads;
 await assert.rejects(acquisition.acquireContent({...payload,permissionConfirmed:false},adminId),/Confirm/);
 await assert.rejects(acquisition.acquireContent({...payload,licenceCandidate:'CC_BY_NC',accessRequirement:'SUBSCRIBER'},adminId),/commercial|subscriber/i);
 assert.equal(downloads,start);
 const before=stored.length;
 scanCode=1;await assert.rejects(acquisition.acquireContent(payload,adminId),/scan failed/);assert.equal(stored.length,before);scanCode=0;
 responseBytes=Buffer.from('<html>login</html>');await assert.rejects(acquisition.acquireContent(payload,adminId),/bytes do not match/);assert.equal(stored.length,before);responseBytes=Buffer.from('%PDF-1.7\nfixture');
 const staged=await acquisition.acquireContent(payload,adminId);
 const asset=(await db.query('SELECT * FROM learning_content_assets WHERE id=$1',[staged.assetId])).rows[0];
 assert.equal(asset.processing_status,'READY');assert.notEqual(asset.rights_status,'VERIFIED');assert.equal(asset.metadata.acquisition.url,payload.assetUrl);assert.equal(asset.metadata.acquisition.permissionConfirmed,true);assert.equal(asset.checksum_sha256.length,64);
 const cleanupBefore=deleted.length;
 await assert.rejects(acquisition.acquireContent({...payload,intakeId:staged.intakeId},adminId),/already has a hosted asset/);assert.equal(deleted.length,cleanupBefore+1);
 assert.equal((await db.query('SELECT storage_key FROM learning_content_assets WHERE id=$1',[staged.assetId])).rows[0].storage_key,asset.storage_key);
 await pipeline.verifyRights(staged.intakeId,{licenceCandidate:'CC_BY',rightsEvidenceUrl:payload.rightsEvidenceUrl,attributionText:payload.attributionText},adminId);
 await pipeline.approveIntake(staged.intakeId,adminId);
 const materialised=await pipeline.materialiseIntake(staged.intakeId,adminId);
 const row=(await db.query('SELECT * FROM learning_resources WHERE id=$1',[materialised.resourceId])).rows[0];assert.equal(row.review_status,'DRAFT');assert.equal(row.file_key,asset.storage_key);
 await assert.rejects(publicLearning.getPublicLearningResource(row.public_slug),/not found/);
 const downloadBefore=downloads;await assert.rejects(acquisition.acquireContent({...payload,intakeId:staged.intakeId},adminId),/already in Library/);assert.equal(downloads,downloadBefore);
});
test('curriculum topic creation is auditable, deduplicated and remains a curriculum draft',async()=>{
 const subject=(await db.query('SELECT id FROM subjects LIMIT 1')).rows[0];
 const input={gradeCode:'CLASS_5',subjectId:subject.id,name:'Verified fixture topic',chapterTitle:'Fixture chapter',academicYear:'2026-27',evidenceUrl:'https://cbseacademic.nic.in/curriculum.html'};
 const first=await pipeline.createCurriculumTopic(input,adminId);const second=await pipeline.createCurriculumTopic(input,adminId);assert.equal(first.id,second.id);
 const row=(await db.query('SELECT * FROM learning_concepts WHERE id=$1',[first.id])).rows[0];assert.equal(row.registry_status,'DRAFT_FOR_ACADEMIC_REVIEW');assert.equal(row.registry_source,input.evidenceUrl);
 const audit=await db.query("SELECT * FROM audit_log WHERE entity_type='learning_concept' AND entity_id=$1",[first.id]);assert.equal(audit.rows.length,1);
 await assert.rejects(pipeline.createCurriculumTopic({...input,gradeCode:'INVALID'},adminId),/valid grade/);
});
test('search curriculum and media details follow a candidate into the prepare queue',async()=>{
 const subject=(await db.query('SELECT id FROM subjects LIMIT 1')).rows[0];
 const found=await discovery.discoverSources({provider:'LOCAL',query:'Unique UKG searchable',gradeCode:'UKG',boardCode:'COMMON',subjectId:subject.id,chapterLabel:'Counting',topicLabel:'Objects',language:'hi'},adminId);
 // Use a local discovery fixture to avoid making real provider requests.
 const candidate=found.candidates[0];assert.ok(candidate);
 await db.query("UPDATE learning_source_discovery_candidates SET resource_id=NULL,provider='DIKSHA',source_code='DIKSHA',source_url='https://diksha.gov.in/context-fixture',source_item_id='context-fixture',media_kind='VIDEO',metadata=$2::jsonb WHERE id=$1",[candidate.id,JSON.stringify({artifactUrl:'https://obj.diksha.gov.in/context.mp4'})]);
 const staged=await discovery.stageDiscoveryCandidate(candidate.id,adminId);
 const queue=await pipeline.listPipelineQueue();const item=queue.find(row=>row.id===staged.intakeId);assert.ok(item);
 assert.equal(item.discovered_asset_url,'https://obj.diksha.gov.in/context.mp4');assert.equal(item.discovery_context.subjectId,subject.id);assert.equal(item.discovery_context.chapterLabel,'Counting');assert.equal(item.discovery_context.topicLabel,'Objects');assert.equal(item.discovered_language,'hi');
});
test('verified syllabus is hidden until approval, preserves gaps and protects school profiles',async()=>{
 const subject=(await db.query('SELECT id FROM subjects LIMIT 1')).rows[0];
 const student=(await db.query("SELECT id,user_id,school_id FROM students WHERE status='ACTIVE' LIMIT 1")).rows[0];syllabusStudentId=student.id;
 await db.query("UPDATE students SET school_id=NULL,grade_code='CLASS_6',grade_level='6' WHERE id=$1",[student.id]);
 const input={boardCode:'CBSE',academicYear:'2026-27',title:'Fixture Class 6 syllabus scope',sourceUrl:'https://cbseacademic.nic.in/curriculum_2027.html',rows:[{gradeCode:'CLASS_6',subjectId:subject.id,chapter:'Fixture unit',topic:'Fixture verified topic',learningOutcome:'Explain the fixture concept',evidenceUrl:'https://cbseacademic.nic.in/curriculum_2027.html',pageReference:'Unit 1'}]};
 const imported=await syllabus.importSyllabus(input,adminId);
 await syllabus.saveLearningPreference(student.user_id,{boardCode:'CBSE',gradeCode:'CLASS_6',academicYear:'2026-27',language:'hi'});
 assert.equal((await syllabus.studentSyllabus(student.user_id)).version,null);
 await syllabus.changeSyllabusStatus(imported.id,'ACTIVE','Reviewed fixture topic against source',adminId);
 const factoryOptions=await factory.getFactoryOptions();assert.equal(factoryOptions.curriculumSubjects.find(cs=>cs.curriculum_version_id===imported.id).academic_year,'2026-27');
 const view=await syllabus.studentSyllabus(student.user_id);assert.equal(view.topics.length,1);assert.equal(view.summary.totalTopics,1);assert.equal(view.summary.coveredTopics,0);assert.equal(view.summary.completedTopics,0);assert.equal(view.summary.masteredTopics,0);assert.equal(view.profile.language,'hi');
 assert.equal('review_note' in view.version,false);
 await assert.rejects(syllabus.importSyllabus(input,adminId),/Return the existing syllabus to draft/);
 await syllabus.changeSyllabusStatus(imported.id,'DRAFT','Correct the fixture learning outcome',adminId);
 const concept=view.topics[0].concept_id;
 await db.query("INSERT INTO student_concept_progress(student_id,concept_id,state,mastery_attempts,mastery_pct) VALUES($1,$2,'MASTERED',1,90)",[student.id,concept]);
 await syllabus.importSyllabus({...input,rows:[{...input.rows[0],learningOutcome:'A different learning outcome'}]},adminId);
 await syllabus.changeSyllabusStatus(imported.id,'ACTIVE','Verified revised fixture outcome',adminId);
 const corrected=await syllabus.studentSyllabus(student.user_id);assert.notEqual(corrected.topics[0].concept_id,concept);assert.equal(corrected.summary.masteredTopics,0);assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM student_concept_progress WHERE student_id=$1 AND concept_id=$2',[student.id,concept])).rows[0].n,1);
 const second=await syllabus.importSyllabus({...input,academicYear:'2027-28'},adminId);await syllabus.changeSyllabusStatus(second.id,'ACTIVE','Reviewed new academic year fixture',adminId);
 await syllabus.saveLearningPreference(student.user_id,{boardCode:'CBSE',gradeCode:'CLASS_6',academicYear:'2027-28',language:'en'});
 assert.equal((await syllabus.studentSyllabus(student.user_id)).summary.masteredTopics,0);
 const school=(await db.query('SELECT id FROM schools LIMIT 1')).rows[0];await db.query("UPDATE schools SET board_id=(SELECT id FROM education_boards WHERE code='CBSE') WHERE id=$1",[school.id]);await db.query('UPDATE students SET school_id=$2 WHERE id=$1',[student.id,school.id]);
 await assert.rejects(syllabus.saveLearningPreference(student.user_id,{boardCode:'CISCE',gradeCode:'CLASS_6',academicYear:'2026-27',language:'en'}),e=>e.statusCode===403);
 await syllabus.changeSyllabusStatus(second.id,'ARCHIVED','Archive superseded fixture syllabus',adminId);assert.equal((await syllabus.studentSyllabus(student.user_id)).version,null);
});
test('syllabus-linked content respects subscriptions and completion never implies mastery',async()=>{
 const student=(await db.query('SELECT id,user_id FROM students WHERE id=$1',[syllabusStudentId])).rows[0];await db.query('UPDATE students SET school_id=NULL WHERE id=$1',[student.id]);
 await syllabus.saveLearningPreference(student.user_id,{boardCode:'CBSE',gradeCode:'CLASS_6',academicYear:'2026-27',language:'en'});
 const view=await syllabus.studentSyllabus(student.user_id);const topic=view.topics[0];assert.ok(topic);
 await assert.rejects(pipeline.stageContent({...base,title:'Wrong syllabus board fixture',category:'ACADEMIC',gradeCodes:['CLASS_6'],boardCodes:['CISCE'],subjectId:topic.subject_id,topicLabel:topic.title,conceptIds:[topic.concept_id]},adminId),/Syllabus topics must match/);
 const staged=await pipeline.stageContent({...base,title:'Syllabus subscriber fixture',category:'ACADEMIC',gradeCodes:['CLASS_6'],boardCodes:['CBSE'],subjectId:topic.subject_id,topicLabel:topic.title,conceptIds:[topic.concept_id],visibility:'REGISTERED',accessRequirement:'SUBSCRIBER'},adminId);await pipeline.approveIntake(staged.intakeId,adminId);const resource=await pipeline.materialiseIntake(staged.intakeId,adminId);
 await syllabus.linkTopicResource(topic.id,resource.resourceId,adminId);
 await assert.rejects(syllabus.linkTopicResource(topic.id,'00000000-0000-0000-0000-000000000099',adminId),/same canonical subject/);
 await db.query("UPDATE learning_resources SET review_status='APPROVED' WHERE id=$1",[resource.resourceId]);await db.query("UPDATE learning_resources SET review_status='PUBLISHED' WHERE id=$1",[resource.resourceId]);
 await db.query('DELETE FROM learning_entitlements');const locked=await syllabus.studentSyllabus(student.user_id);assert.equal(locked.topics[0].resources[0].locked,true);assert.equal(locked.topics[0].availableResources,0);assert.equal(locked.summary.completedTopics,0);
 await assert.rejects(learner.getCanonicalLearningResource(student.user_id,resource.resourceId),/Subscriber/);
 await db.query("INSERT INTO learning_entitlements(user_id,entitlement_code,status) VALUES($1,'LEARNING_SUBSCRIBER','ACTIVE')",[student.user_id]);
 await db.query('INSERT INTO student_learning_resource_progress(student_id,resource_id,is_completed,progress_pct) VALUES($1,$2,TRUE,100)',[student.id,resource.resourceId]);
 const done=await syllabus.studentSyllabus(student.user_id);assert.equal(done.summary.completedTopics,1);assert.equal(done.summary.masteredTopics,0);assert.equal('file_key' in done.topics[0].resources[0],false);
 await db.query("INSERT INTO student_concept_progress(student_id,concept_id,state,mastery_attempts,mastery_pct) VALUES($1,$2,'MASTERED',0,95)",[student.id,topic.concept_id]);
 assert.equal((await syllabus.studentSyllabus(student.user_id)).summary.masteredTopics,0);
 await db.query('UPDATE student_concept_progress SET mastery_attempts=1 WHERE student_id=$1 AND concept_id=$2',[student.id,topic.concept_id]);
 assert.equal((await syllabus.studentSyllabus(student.user_id)).summary.masteredTopics,1);
 await assert.rejects(syllabus.linkTopicResource(topic.id,resource.resourceId,adminId),/Return published content to DRAFT/);
});
test('topic retirement retains historical progress and approval excludes retired topics',async()=>{
 const student=(await db.query('SELECT id,user_id FROM students WHERE id=$1',[syllabusStudentId])).rows[0];
 const before=await syllabus.studentSyllabus(student.user_id);const version=before.version;const topic=before.topics[0];
 await assert.rejects(syllabus.retireSyllabusTopic(topic.id,true,'Retire reviewed fixture topic',adminId),e=>e.statusCode===409);
 await syllabus.changeSyllabusStatus(version.id,'DRAFT','Review retirement and source applicability',adminId);
 await syllabus.retireSyllabusTopic(topic.id,true,'Retire reviewed fixture topic',adminId);
 await assert.rejects(syllabus.changeSyllabusStatus(version.id,'ACTIVE','Approve an empty active topic list',adminId),/Every topic/);
 assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM student_learning_resource_progress WHERE student_id=$1',[student.id])).rows[0].n>0,true);
 await syllabus.retireSyllabusTopic(topic.id,false,'Restore reviewed fixture topic',adminId);
 await syllabus.changeSyllabusStatus(version.id,'ACTIVE','Re-approve restored fixture topic',adminId);
 assert.equal((await syllabus.studentSyllabus(student.user_id)).topics.length,1);
});
test('syllabus endpoints enforce real JWT roles and validated input',async()=>{
 const redisPath=require.resolve('../dist/config/redis');require.cache[redisPath]={id:redisPath,filename:redisPath,loaded:true,exports:{isTokenBlacklisted:async()=>false}};
 const express=require('express');const {adminSyllabusRoutes,studentSyllabusRoutes}=require('../dist/routes/syllabus.routes');const {signAccessToken}=require('../dist/utils/jwt');
 const app=express();app.use(express.json());app.use('/admin/syllabus',adminSyllabusRoutes);app.use('/student/syllabus',studentSyllabusRoutes);app.use((err,_req,res,_next)=>res.status(err.statusCode||500).json({message:err.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const baseUrl=`http://127.0.0.1:${server.address().port}`;
 try {
 const student=(await db.query("SELECT u.id,u.role FROM users u JOIN students s ON s.user_id=u.id WHERE s.status='ACTIVE' LIMIT 1")).rows[0];await db.query("UPDATE users SET status='ACTIVE' WHERE id=$1",[student.id]);
 const admin=(await db.query('SELECT id,role FROM users WHERE id=$1',[adminId])).rows[0];const studentToken=signAccessToken({userId:student.id,role:student.role});const adminToken=signAccessToken({userId:admin.id,role:admin.role});
 assert.equal((await fetch(`${baseUrl}/student/syllabus`)).status,401);
 assert.equal((await fetch(`${baseUrl}/admin/syllabus/options`,{headers:{Authorization:`Bearer ${studentToken}`}})).status,403);
 assert.equal((await fetch(`${baseUrl}/admin/syllabus/options`,{headers:{Authorization:`Bearer ${adminToken}`}})).status,200);
 assert.equal((await fetch(`${baseUrl}/student/syllabus`,{headers:{Authorization:`Bearer ${studentToken}`}})).status,200);
 assert.equal((await fetch(`${baseUrl}/admin/syllabus/import`,{method:'POST',headers:{Authorization:`Bearer ${adminToken}`,'Content-Type':'application/json'},body:JSON.stringify({boardCode:'CBSE',academicYear:'2026-29',title:'Invalid year',sourceUrl:'https://cbseacademic.nic.in/',rows:[]})})).status,400);
 } finally {await new Promise(r=>server.close(r));}
});
test('compiled server loads environment before database-bearing routes',()=>{
 const {execFileSync}=require('node:child_process');const os=require('node:os');const folder=fs.mkdtempSync(path.join(os.tmpdir(),'syllabus-env-test-'));const fixture=path.join(folder,'fixture.env');fs.writeFileSync(fixture,'DB_NAME=syllabus_bootstrap_fixture\n');
 const env={...process.env,DOTENV_CONFIG_PATH:fixture};delete env.DB_NAME;
 const entry=require.resolve('../dist/index');
 const script=`const Module=require('module');const original=Module._load;Module._load=function(request,parent,main){if(request.endsWith('/config/db'))process.exit(process.env.DB_NAME==='syllabus_bootstrap_fixture'?0:1);return original.apply(this,arguments);};require(${JSON.stringify(entry)});process.exit(2);`;
 try{execFileSync(process.execPath,['-e',script],{env,stdio:'pipe',timeout:10000});}finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('older Library schemas reject incomplete publication with a validation error',async () => {
 // Older regression jobs intentionally stop before migration 049; optional metadata must not cause SQL 500s.
 await db.exec('ALTER TABLE learning_resources DROP COLUMN chapter_label, DROP COLUMN topic_label;');
 const row=(await db.query("SELECT lr.id FROM learning_resources lr JOIN learning_content_sources s ON s.id=lr.source_id WHERE s.code='VIDYASETU_ORIGINAL' AND lr.asset_id IS NULL LIMIT 1")).rows[0];
 assert.ok(row);
 await db.query("UPDATE learning_resources SET review_status='DRAFT',title_hi=NULL WHERE id=$1",[row.id]);
 await assert.rejects(admin.updateLearningResourceStatus(row.id,'PUBLISHED',adminId),(error)=>error.statusCode===400 && /not publish-ready/.test(error.message));
});
