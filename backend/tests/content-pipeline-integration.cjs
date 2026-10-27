const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
let syllabusStudentId;
let db, pipeline, factory, quality, admin, discovery, learner, publicLearning, acquisition, syllabus, syllabusDocuments, governance;
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
 '057_curriculum_topic_assets.sql','058_learning_asset_governance_analytics.sql','059_syllabus_content_handoff.sql','060_syllabus_e2e_manager.sql',
 '061_youtube_verified_video_discovery.sql',
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
 await sqlFile('database/migrations/057_curriculum_topic_assets.sql'); // idempotency
 await sqlFile('database/migrations/058_learning_asset_governance_analytics.sql');
 await sqlFile('database/migrations/059_syllabus_content_handoff.sql');
 await sqlFile('database/migrations/060_syllabus_e2e_manager.sql');
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
 syllabusDocuments=require('../dist/services/syllabusDocuments.service');
 governance=require('../dist/services/learningAssetGovernance.service');
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

test('multiple syllabus PDFs share one framework and a Draft deletion removes only its own topics',async () => {
 const board=(await db.query("SELECT id FROM education_boards WHERE code='CBSE'")).rows[0];
 const subjects=(await db.query('SELECT id,name FROM subjects ORDER BY name LIMIT 2')).rows;
 assert.equal(subjects.length,2);
 const insertDocument=async(index,subject)=> (await db.query(`INSERT INTO syllabus_documents(board_id,academic_year,grade_code,subject_id,title,language,medium,source_url,storage_key,checksum_sha256,byte_size,page_count,uploaded_by,structured_outline)
   VALUES($1,'2031-32','CLASS_12',$2,$3,'en','en',$4,$5,$6,100,1,$7,'[]'::jsonb) RETURNING id`,[board.id,subject.id,`${subject.name} syllabus`,`https://cbseacademic.nic.in/${index}.pdf`,`syllabus/test-${index}.pdf`,String(index).repeat(64),adminId])).rows[0];
 const first=await insertDocument(1,subjects[0]);const second=await insertDocument(2,subjects[1]);const third=await insertDocument(3,subjects[1]);
 const importDocument=(document,subject,index)=>syllabus.importSyllabus({boardCode:'CBSE',academicYear:'2031-32',title:'CBSE Class 12 framework',sourceUrl:`https://cbseacademic.nic.in/${index}.pdf`,sourceDocumentId:document.id,medium:'en',rows:[{gradeCode:'CLASS_12',subjectId:subject.id,unit:`Unit ${index}`,chapter:`Chapter ${index}`,topic:`Topic ${index}`,learningOutcome:'Reviewed outcome',evidenceUrl:`https://cbseacademic.nic.in/${index}.pdf`,pageReference:'Page 1'}]},adminId);
 const firstVersion=await importDocument(first,subjects[0],1);const secondVersion=await importDocument(second,subjects[1],2);await importDocument(third,subjects[1],2);
 assert.equal(firstVersion.id,secondVersion.id);
 assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM curriculum_topic_evidence e JOIN curriculum_topics t ON t.id=e.topic_id WHERE t.title=$1',[`Topic 2`])).rows[0].count,2);
 const manual=await syllabus.addSyllabusTopic(firstVersion.id,{gradeCode:'CLASS_12',subjectId:subjects[1].id,unit:'Manual corrections',chapter:'Added chapter',topic:'Added topic',pageReference:'Page 2',sortOrder:2},adminId);assert.equal(manual.created,true);
 assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM curriculum_version_evidence WHERE curriculum_version_id=$1',[firstVersion.id])).rows[0].count,3);
 assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM curriculum_topics WHERE source_document_id=ANY($1::uuid[])',[[first.id,second.id]])).rows[0].count,2);
 await syllabusDocuments.deleteSyllabusDocument(second.id,adminId);
 assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM curriculum_topics WHERE title=$1',[`Topic 2`])).rows[0].count,1);
 assert.equal((await db.query('SELECT source_document_id FROM curriculum_topics WHERE title=$1',[`Topic 2`])).rows[0].source_document_id,third.id);
 await syllabusDocuments.deleteSyllabusDocument(first.id,adminId);
 assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM curriculum_topics WHERE source_document_id=$1',[first.id])).rows[0].count,0);
 assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM curriculum_topics WHERE source_document_id=$1',[second.id])).rows[0].count,0);
 assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM curriculum_topics WHERE source_document_id=$1',[third.id])).rows[0].count,1);
 assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM curriculum_topics WHERE id=$1',[manual.topicId])).rows[0].count,1);
 assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM curriculum_versions WHERE id=$1',[firstVersion.id])).rows[0].count,1);
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

test('YouTube players are rejected from VidyaSetu learning content',async () => {
 await assert.rejects(pipeline.stageContent({...base,sourceCode:'DIKSHA',sourceUrl:'https://diksha.gov.in/youtube',mediaKind:'VIDEO',deliveryMode:'OFFICIAL_EMBED',embedUrl:'https://www.youtube-nocookie.com/embed/abc',licenceCandidate:'CC_BY',accessRequirement:'SUBSCRIBER',visibility:'REGISTERED'},adminId),/YouTube is not supported/);
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
 const published=await admin.reviewAndPublishLearningResource(result.resourceId,adminId);assert.equal(published.review_status,'PUBLISHED');
 const reviewTrail=(await db.query('SELECT from_status::text,to_status::text FROM learning_resource_reviews WHERE resource_id=$1 ORDER BY created_at,id',[result.resourceId])).rows;
 assert.deepEqual(reviewTrail.map(row=>row.to_status),['DRAFT','SUBMITTED','ACADEMIC_REVIEW','APPROVED','PUBLISHED']);
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
 assert.equal(acquisition.choosePublicIpv4([{address:'2606:4700:4700::1111',family:6},{address:'8.8.8.8',family:4}]),'8.8.8.8');
 assert.equal(acquisition.choosePublicIpv4([{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]),null);
 assert.equal(acquisition.choosePublicIpv4([{address:'2606:4700:4700::1111',family:6}]),null);
 assert.equal(acquisition.deliveryCapability({embed_url:'https://www.youtube.com/embed/abc123'}).code,'REFERENCE');
 assert.equal(acquisition.deliveryCapability({media_kind:'PDF',metadata:{artifactUrl:'https://obj.diksha.gov.in/file.pdf'}}).code,'IMPORT');
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
test('DIKSHA playable media follows syllabus context into a VidyaSetu-hosted Library draft',async()=>{
 const subject=(await db.query('SELECT id FROM subjects LIMIT 1')).rows[0];
 const found=await discovery.discoverSources({provider:'LOCAL',query:'Unique UKG searchable',gradeCode:'UKG',boardCode:'COMMON',subjectId:subject.id,chapterLabel:'Counting',topicLabel:'Objects',language:'hi'},adminId);
 // Use a local discovery fixture to avoid making real provider requests.
 const candidate=found.candidates[0];assert.ok(candidate);
 await db.query("UPDATE learning_source_discovery_candidates SET resource_id=NULL,provider='DIKSHA',source_code='DIKSHA',source_url='https://diksha.gov.in/context-fixture',source_item_id='context-fixture',media_kind='PDF',embed_url='https://www.youtube-nocookie.com/embed/context-fixture',licence_candidate='CC_BY',licence_raw='CC BY 4.0',attribution_text='Fixture creator · CC BY 4.0',metadata=$2::jsonb WHERE id=$1",[candidate.id,JSON.stringify({artifactUrl:'https://obj.diksha.gov.in/context.pdf'})]);
 const staged=await discovery.stageDiscoveryCandidate(candidate.id,adminId);
 const queue=await pipeline.listPipelineQueue();const item=queue.find(row=>row.id===staged.intakeId);assert.ok(item);
 assert.equal(item.discovered_asset_url,'https://obj.diksha.gov.in/context.pdf');assert.equal(item.discovered_embed_url,null);assert.equal(item.discovery_context.subjectId,subject.id);assert.equal(item.discovery_context.chapterLabel,'Counting');assert.equal(item.discovery_context.topicLabel,'Objects');assert.equal(item.discovered_language,'hi');
 const added=await discovery.addDiscoveredContentToLibrary(candidate.id,{title:'Reviewed VidyaSetu title',visibility:'PUBLIC',accessRequirement:'PUBLIC',permissionConfirmed:true},adminId);
 const resource=(await db.query('SELECT * FROM learning_resources WHERE id=$1',[added.resourceId])).rows[0];
 assert.equal(resource.title,'Reviewed VidyaSetu title');assert.equal(resource.review_status,'DRAFT');assert.equal(resource.delivery_mode,'LICENSED_REHOST');assert.equal(resource.external_url,null);assert.equal(resource.source_url,'https://diksha.gov.in/context-fixture');assert.equal(resource.subject_id,subject.id);assert.equal(resource.topic_label,'Objects');assert.equal(Boolean(resource.file_key),true);
 const linked=(await db.query('SELECT resource_id FROM learning_source_discovery_candidates WHERE id=$1',[candidate.id])).rows[0];assert.equal(linked.resource_id,resource.id);
});
test('verified syllabus is hidden until approval, preserves gaps and protects school profiles',async()=>{
 const subject=(await db.query('SELECT id FROM subjects LIMIT 1')).rows[0];
 const student=(await db.query("SELECT id,user_id,school_id FROM students WHERE status='ACTIVE' LIMIT 1")).rows[0];syllabusStudentId=student.id;
 await db.query("UPDATE students SET school_id=NULL,grade_code='CLASS_6',grade_level='6' WHERE id=$1",[student.id]);
 const input={boardCode:'CBSE',academicYear:'2026-27',medium:'hi',title:'Fixture Class 6 syllabus scope',sourceUrl:'https://cbseacademic.nic.in/curriculum_2027.html',rows:[{gradeCode:'CLASS_6',subjectId:subject.id,chapter:'Fixture unit',topic:'Fixture verified topic',learningOutcome:'Explain the fixture concept',evidenceUrl:'https://cbseacademic.nic.in/curriculum_2027.html',pageReference:'Unit 1'}]};
 const imported=await syllabus.importSyllabus(input,adminId);
 await syllabus.saveLearningPreference(student.user_id,{boardCode:'CBSE',gradeCode:'CLASS_6',academicYear:'2026-27',language:'hi'});
 assert.equal((await syllabus.studentSyllabus(student.user_id)).version,null);
 await syllabus.changeSyllabusStatus(imported.id,'REVIEWED','Reviewed fixture topic against source',adminId);await syllabus.changeSyllabusStatus(imported.id,'ACTIVE','Publish reviewed fixture topic',adminId);
 const factoryOptions=await factory.getFactoryOptions();assert.equal(factoryOptions.curriculumSubjects.find(cs=>cs.curriculum_version_id===imported.id).academic_year,'2026-27');
 const view=await syllabus.studentSyllabus(student.user_id);assert.equal(view.topics.length,1);assert.equal(view.summary.totalTopics,1);assert.equal(view.summary.coveredTopics,0);assert.equal(view.summary.completedTopics,0);assert.equal(view.summary.masteredTopics,0);assert.equal(view.profile.language,'hi');
 assert.equal('review_note' in view.version,false);
 const replacement=await syllabus.importSyllabus(input,adminId);assert.notEqual(replacement.id,imported.id);await syllabus.changeSyllabusStatus(replacement.id,'ARCHIVED','Keep published framework immutable; review a separate draft version',adminId);
 await syllabus.changeSyllabusStatus(imported.id,'DRAFT','Correct the fixture learning outcome',adminId);
 const concept=view.topics[0].concept_id;
 await db.query("INSERT INTO student_concept_progress(student_id,concept_id,state,mastery_attempts,mastery_pct) VALUES($1,$2,'MASTERED',1,90)",[student.id,concept]);
 const revised=await syllabus.importSyllabus({...input,rows:[{...input.rows[0],learningOutcome:'A different learning outcome'}]},adminId);
 await syllabus.changeSyllabusStatus(revised.id,'REVIEWED','Verified revised fixture outcome',adminId);await syllabus.changeSyllabusStatus(revised.id,'ACTIVE','Publish revised fixture outcome',adminId);
 const corrected=await syllabus.studentSyllabus(student.user_id);assert.notEqual(corrected.topics[0].concept_id,concept);assert.equal(corrected.summary.masteredTopics,0);assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM student_concept_progress WHERE student_id=$1 AND concept_id=$2',[student.id,concept])).rows[0].n,1);
 const second=await syllabus.importSyllabus({...input,academicYear:'2027-28'},adminId);await syllabus.changeSyllabusStatus(second.id,'REVIEWED','Review new academic year fixture',adminId);await syllabus.changeSyllabusStatus(second.id,'ACTIVE','Publish new academic year fixture',adminId);
 await syllabus.saveLearningPreference(student.user_id,{boardCode:'CBSE',gradeCode:'CLASS_6',academicYear:'2027-28',language:'hi'});
 assert.equal((await syllabus.studentSyllabus(student.user_id)).summary.masteredTopics,0);
 const school=(await db.query('SELECT id FROM schools LIMIT 1')).rows[0];await db.query("UPDATE schools SET board_id=(SELECT id FROM education_boards WHERE code='CBSE') WHERE id=$1",[school.id]);await db.query('UPDATE students SET school_id=$2 WHERE id=$1',[student.id,school.id]);
 await assert.rejects(syllabus.saveLearningPreference(student.user_id,{boardCode:'CISCE',gradeCode:'CLASS_6',academicYear:'2026-27',language:'hi'}),e=>e.statusCode===403);
 await syllabus.changeSyllabusStatus(second.id,'ARCHIVED','Archive superseded fixture syllabus',adminId);assert.equal((await syllabus.studentSyllabus(student.user_id)).version,null);
});
test('new syllabus revision keeps every published subject scope and exposes the full revision to Content Creator',async()=>{
 const subjects=(await db.query('SELECT id,name FROM subjects ORDER BY name LIMIT 2')).rows;assert.equal(subjects.length,2);
 const student=(await db.query("SELECT id,user_id FROM students WHERE status='ACTIVE' LIMIT 1")).rows[0];
 await db.query("UPDATE students SET school_id=NULL,grade_code='CLASS_6',grade_level='6' WHERE id=$1",[student.id]);
 const baseInput={boardCode:'CBSE',academicYear:'2033-34',medium:'en',title:'CBSE 2033-34 complete syllabus',sourceUrl:'https://cbseacademic.nic.in/curriculum_2027.html'};
 const rows=subjects.flatMap((subject,index)=>[{gradeCode:'CLASS_6',subjectId:subject.id,unit:`Unit ${index+1}`,chapter:`Chapter ${index+1}`,topic:`Published topic ${index+1}`,learningOutcome:'Explain the verified topic',evidenceUrl:baseInput.sourceUrl,pageReference:`Page ${index+1}`},...(index===1?[{gradeCode:'CLASS_6',subjectId:subject.id,unit:'Unit 2',chapter:'Chapter 2',topic:'Sibling topic',learningOutcome:'Explain the sibling topic',evidenceUrl:baseInput.sourceUrl,pageReference:'Page 2'}]:[])]);
 const published=await syllabus.importSyllabus({...baseInput,rows},adminId);
 await syllabus.changeSyllabusStatus(published.id,'REVIEWED','Verify both subject scopes and page references',adminId);await syllabus.changeSyllabusStatus(published.id,'ACTIVE','Publish both verified class subject scopes',adminId);
 const revision=await syllabus.importSyllabus({...baseInput,rows:[{gradeCode:'CLASS_6',subjectId:subjects[0].id,unit:'New Unit',chapter:'New Chapter',topic:'New revision topic',learningOutcome:'Explain the new revision topic',evidenceUrl:baseInput.sourceUrl,pageReference:'Page 3'}]},adminId);
 assert.notEqual(revision.id,published.id);
 const draft=await syllabus.syllabusDetail(revision.id);
 assert.deepEqual(new Set(draft.topics.map(topic=>topic.subject_id)),new Set(subjects.map(subject=>subject.id)));
 assert.equal(draft.topics.length,4);
 const preservedDraftTopic=draft.topics.find(topic=>topic.subject_id===subjects[1].id);const originalConcept=preservedDraftTopic.concept_id;
 await syllabus.updateSyllabusTopic(preservedDraftTopic.id,{unit:'Corrected unit',chapter:'Corrected chapter',topic:'Corrected draft-only topic',pageReference:preservedDraftTopic.page_reference,learningOutcome:preservedDraftTopic.learning_outcome},adminId);
 const publishedOriginal=await syllabus.syllabusDetail(published.id);assert.ok(publishedOriginal.topics.some(topic=>topic.title===preservedDraftTopic.title&&topic.concept_id===originalConcept));
 const correctedDraft=await syllabus.syllabusDetail(revision.id);assert.ok(correctedDraft.topics.some(topic=>topic.title==='Corrected draft-only topic'&&topic.concept_id!==originalConcept));
 assert.ok(correctedDraft.topics.some(topic=>topic.title==='Sibling topic'&&topic.unit==='Unit 2'&&topic.chapter==='Chapter 2'),'editing one topic does not rename its sibling hierarchy');
 await syllabus.saveLearningPreference(student.user_id,{boardCode:'CBSE',gradeCode:'CLASS_6',academicYear:'2033-34',language:'en'});
 assert.equal((await syllabus.studentSyllabus(student.user_id)).topics.length,3,'students continue seeing the prior published syllabus while the revision is Draft');
 await syllabus.changeSyllabusStatus(revision.id,'REVIEWED','Verify revised and preserved class subject scopes',adminId);await syllabus.changeSyllabusStatus(revision.id,'ACTIVE','Publish complete revised class subject scopes',adminId);
 const studentView=await syllabus.studentSyllabus(student.user_id);assert.equal(studentView.topics.length,4);assert.deepEqual(new Set(studentView.topics.map(topic=>topic.subject_id)),new Set(subjects.map(subject=>subject.id)));assert.ok(studentView.topics.some(topic=>topic.title==='Corrected draft-only topic'));assert.ok(studentView.topics.some(topic=>topic.title==='Sibling topic'&&topic.unit==='Unit 2'&&topic.chapter==='Chapter 2'));
 const options=await factory.getFactoryOptions();assert.ok(options.curriculumSubjects.some(item=>item.curriculum_version_id===revision.id&&item.subject_id===subjects[1].id),'Content Creator can use an unchanged subject in the new published revision');
 const corrected=studentView.topics.find(topic=>topic.title==='Corrected draft-only topic');
 const staged=await pipeline.stageContent({...base,sourceCode:'VIDYASETU_ORIGINAL',title:'Content Creator handoff for corrected syllabus topic',category:'ACADEMIC',gradeCodes:['CLASS_6'],boardCodes:['CBSE'],subjectId:corrected.subject_id,topicLabel:corrected.title,conceptIds:[corrected.concept_id],curriculumTopicId:corrected.id,curriculumAcademicYear:'2033-34',curriculumMedium:'en'},adminId);
 assert.ok(staged.intakeId,'Content Creator can stage content against the newly published corrected topic');
 await pipeline.approveIntake(staged.intakeId,adminId);const materialised=await pipeline.materialiseIntake(staged.intakeId,adminId);
 assert.equal((await db.query('SELECT curriculum_topic_id FROM learning_resources WHERE id=$1',[materialised.resourceId])).rows[0].curriculum_topic_id,corrected.id,'created content retains the canonical revised topic link');
});
test('source-document edit, admin review, publish and student syllabus form one complete lifecycle',async()=>{
 const board=(await db.query("SELECT id FROM education_boards WHERE code='CBSE'")).rows[0];
 const subject=(await db.query("SELECT id FROM subjects WHERE is_active=TRUE AND name='Science' LIMIT 1")).rows[0];
 assert.ok(subject,'Science subject seed is present');
 const inserted=(await db.query(`INSERT INTO syllabus_documents(board_id,academic_year,grade_code,subject_id,title,language,medium,source_url,source_publisher,storage_key,checksum_sha256,byte_size,page_count,uploaded_by,structured_outline,outline)
  VALUES($1,'2034-35',NULL,NULL,'Initial source','en','en','https://cbseacademic.nic.in/curriculum_2027.html','CBSE','syllabus/e2e-source.pdf',$2,120,1,$3,$4::jsonb,$5::jsonb) RETURNING id`,[board.id,'a'.repeat(64),adminId,JSON.stringify([{unit:'Unit 1',chapter:'Materials',topic:'States of Matter',pageReference:'Page 2',confidence:'high'}]),JSON.stringify([{page:2,text:'Unit 1 › Materials › States of Matter'}])])).rows[0];
 const first=await syllabusDocuments.updateSyllabusDocument(inserted.id,{gradeCode:'CLASS_6',subjectId:subject.id,title:'CBSE Class 6 Science Draft',sourceUrl:'https://cbseacademic.nic.in/curriculum_2027.html',language:'en'},adminId);
 assert.ok(first.versionId,'assigning class/subject creates a Draft from extracted syllabus topics');
 const second=await syllabusDocuments.updateSyllabusDocument(inserted.id,{gradeCode:'CLASS_6',subjectId:subject.id,title:'CBSE Class 6 Science Corrected Draft',sourceUrl:'https://cbseacademic.nic.in/curriculum_2027.html',language:'en'},adminId);
 assert.notEqual(second.versionId,first.versionId,'editing the source record replaces its Draft instead of leaving a stale revision');
 assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM curriculum_versions WHERE id=$1',[first.versionId])).rows[0].count,0);
 const filtered=await syllabusDocuments.listSyllabusDocuments({boardCode:'CBSE',gradeCode:'CLASS_6',subjectId:subject.id,academicYear:'2034-35'});
 assert.ok(filtered.some(item=>item.id===inserted.id),'admin board/class/subject/year filters return the loaded source');
 const detail=await syllabusDocuments.syllabusDocumentDetail(inserted.id,true);assert.equal(detail.structured_outline.length,1);
 await syllabusDocuments.reviewSyllabusDocument(inserted.id,{status:'APPROVED',note:'Verified source, class, subject and topic outline',redistributionAllowed:false},adminId);
 await syllabus.changeSyllabusStatus(second.versionId,'REVIEWED','Verified extracted syllabus topics and source page references',adminId);
 await syllabus.changeSyllabusStatus(second.versionId,'ACTIVE','Published verified Class 6 Science syllabus',adminId);
 const student=(await db.query('SELECT id,user_id FROM students WHERE id=$1',[syllabusStudentId])).rows[0];
 await db.query("UPDATE students SET school_id=NULL,grade_code='CLASS_6',grade_level='6' WHERE id=$1",[student.id]);
 await syllabus.saveLearningPreference(student.user_id,{boardCode:'CBSE',gradeCode:'CLASS_6',academicYear:'2034-35',language:'en'});
 const view=await syllabus.studentSyllabus(student.user_id);
 assert.equal(view.version.id,second.versionId);assert.equal(view.topics.length,1);assert.equal(view.topics[0].title,'States of Matter');
 await assert.rejects(syllabusDocuments.updateSyllabusDocument(inserted.id,{gradeCode:'CLASS_6',subjectId:subject.id,title:'Unsafe published edit',sourceUrl:'https://cbseacademic.nic.in/curriculum_2027.html',language:'en'},adminId),/reviewed or published syllabus/);
 await assert.rejects(syllabusDocuments.deleteSyllabusDocument(inserted.id,adminId),/Approved evidence cannot be deleted/);
});
test('syllabus-linked content respects subscriptions and completion never implies mastery',async()=>{
 const student=(await db.query('SELECT id,user_id FROM students WHERE id=$1',[syllabusStudentId])).rows[0];await db.query('UPDATE students SET school_id=NULL WHERE id=$1',[student.id]);
 await syllabus.saveLearningPreference(student.user_id,{boardCode:'CBSE',gradeCode:'CLASS_6',academicYear:'2026-27',language:'hi'});
 const view=await syllabus.studentSyllabus(student.user_id);const topic=view.topics[0];assert.ok(topic);
 await assert.rejects(pipeline.stageContent({...base,title:'Wrong syllabus board fixture',category:'ACADEMIC',gradeCodes:['CLASS_6'],boardCodes:['CISCE'],subjectId:topic.subject_id,topicLabel:topic.title,conceptIds:[topic.concept_id],curriculumTopicId:topic.id,curriculumAcademicYear:'2026-27',curriculumMedium:'hi'},adminId),/does not match the content board/);
 await assert.rejects(pipeline.stageContent({...base,title:'Wrong syllabus medium fixture',category:'ACADEMIC',gradeCodes:['CLASS_6'],boardCodes:['CBSE'],subjectId:topic.subject_id,conceptIds:[topic.concept_id],curriculumTopicId:topic.id,curriculumAcademicYear:'2026-27',curriculumMedium:'en'},adminId),/does not match the selected syllabus medium/);
 const staged=await pipeline.stageContent({...base,title:'Syllabus subscriber fixture',category:'ACADEMIC',gradeCodes:['CLASS_6'],boardCodes:['CBSE'],subjectId:topic.subject_id,topicLabel:topic.title,conceptIds:[topic.concept_id],curriculumTopicId:topic.id,curriculumAcademicYear:'2026-27',curriculumMedium:'hi',visibility:'REGISTERED',accessRequirement:'SUBSCRIBER'},adminId);await pipeline.approveIntake(staged.intakeId,adminId);const resource=await pipeline.materialiseIntake(staged.intakeId,adminId);
 assert.equal((await db.query('SELECT curriculum_topic_id FROM learning_resources WHERE id=$1',[resource.resourceId])).rows[0].curriculum_topic_id,topic.id);
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
test('Class 7 cannot fetch a Class 8 restricted asset by guessing its ID',async()=>{
 const student=(await db.query('SELECT id,user_id FROM students WHERE id=$1',[syllabusStudentId])).rows[0];
 await db.query('UPDATE students SET school_id=NULL WHERE id=$1',[student.id]);
 const subject=(await db.query('SELECT id FROM subjects LIMIT 1')).rows[0];
 const source='https://cbseacademic.nic.in/curriculum_2029.html';
 const imported=await syllabus.importSyllabus({boardCode:'CBSE',academicYear:'2028-29',medium:'hi',title:'Class 8 security fixture',sourceUrl:source,rows:[{gradeCode:'CLASS_8',subjectId:subject.id,chapter:'Fixture unit',topic:'Class 8 restricted topic',learningOutcome:'Explain the class 8 fixture concept',evidenceUrl:source,pageReference:'Unit 1'}]},adminId);
 await syllabus.changeSyllabusStatus(imported.id,'REVIEWED','Review class 8 security fixture',adminId);await syllabus.changeSyllabusStatus(imported.id,'ACTIVE','Publish class 8 security fixture',adminId);
 await syllabus.saveLearningPreference(student.user_id,{boardCode:'CBSE',gradeCode:'CLASS_8',academicYear:'2028-29',language:'hi'});
 const topic=(await syllabus.studentSyllabus(student.user_id)).topics[0];
 const staged=await pipeline.stageContent({...base,title:'Class 8 restricted topic asset',category:'ACADEMIC',gradeCodes:['CLASS_7','CLASS_8'],boardCodes:['CBSE'],subjectId:topic.subject_id,topicLabel:topic.title,conceptIds:[topic.concept_id],visibility:'REGISTERED',accessRequirement:'REGISTERED'},adminId);
 await pipeline.approveIntake(staged.intakeId,adminId);const resource=await pipeline.materialiseIntake(staged.intakeId,adminId);
 await db.query("UPDATE learning_resources SET review_status='PUBLISHED' WHERE id=$1",[resource.resourceId]);
 const asset=(await db.query('SELECT id FROM learning_content_assets WHERE resource_id=$1',[resource.resourceId])).rows[0];
 const board=(await db.query("SELECT id FROM education_boards WHERE code='CBSE'")).rows[0];
 const curriculumSubject=(await db.query('SELECT cs.subject_id FROM curriculum_topics ct JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id WHERE ct.id=$1',[topic.id])).rows[0];
 await db.query("INSERT INTO learning_asset_nodes(asset_id,topic_id,board_id,grade_code,subject_id,medium,visibility,created_by) VALUES($1,$2,$3,'CLASS_8',$4,'hi','CLASS_RESTRICTED',$5)",[asset.id,topic.id,board.id,curriculumSubject.subject_id,adminId]);
 await assert.rejects(governance.assertReadyForAcademicReview(resource.resourceId),/Complete all five/);
 for(const gate of ['ACADEMIC_ACCURACY','AGE_APPROPRIATENESS','ACCESSIBILITY','TECHNICAL_READINESS','SAFETY']) await governance.setChecklist(asset.id,gate,'PASS','Reviewed in integration test',adminId,true);
 await governance.assertReadyForAcademicReview(resource.resourceId);
 await governance.snapshotAsset(asset.id,adminId);assert.equal((await governance.assetHistory(asset.id)).versions.length,1);
 await learner.getCanonicalLearningResource(student.user_id,resource.resourceId);
 await syllabus.saveLearningPreference(student.user_id,{boardCode:'CBSE',gradeCode:'CLASS_7',academicYear:'2028-29',language:'hi'});
 await assert.rejects(learner.getCanonicalLearningResource(student.user_id,resource.resourceId),error=>error.statusCode===404);
 await governance.setTakedown(asset.id,'TAKEN_DOWN','Integration test takedown',adminId);
 await syllabus.saveLearningPreference(student.user_id,{boardCode:'CBSE',gradeCode:'CLASS_8',academicYear:'2028-29',language:'hi'});
 await assert.rejects(learner.getCanonicalLearningResource(student.user_id,resource.resourceId),error=>error.statusCode===404);
 await governance.setTakedown(asset.id,'ACTIVE','Integration test restore',adminId);
 await learner.getCanonicalLearningResource(student.user_id,resource.resourceId);
 await syllabus.saveLearningPreference(student.user_id,{boardCode:'CBSE',gradeCode:'CLASS_6',academicYear:'2026-27',language:'hi'});
});
test('topic retirement retains historical progress and approval excludes retired topics',async()=>{
 const student=(await db.query('SELECT id,user_id FROM students WHERE id=$1',[syllabusStudentId])).rows[0];
 const before=await syllabus.studentSyllabus(student.user_id);const version=before.version;const topic=before.topics[0];
 await assert.rejects(syllabus.retireSyllabusTopic(topic.id,true,'Retire reviewed fixture topic',adminId),e=>e.statusCode===409);
 await syllabus.changeSyllabusStatus(version.id,'DRAFT','Review retirement and source applicability',adminId);
 await syllabus.retireSyllabusTopic(topic.id,true,'Retire reviewed fixture topic',adminId);
 await syllabus.changeSyllabusStatus(version.id,'REVIEWED','Review topic retirement',adminId);await assert.rejects(syllabus.changeSyllabusStatus(version.id,'ACTIVE','Approve an empty active topic list',adminId),/Every topic/);
 assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM student_learning_resource_progress WHERE student_id=$1',[student.id])).rows[0].n>0,true);
 await syllabus.retireSyllabusTopic(topic.id,false,'Restore reviewed fixture topic',adminId);
 await syllabus.changeSyllabusStatus(version.id,'REVIEWED','Review restored fixture topic',adminId);await syllabus.changeSyllabusStatus(version.id,'ACTIVE','Re-approve restored fixture topic',adminId);
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
 const batch=new FormData();batch.append('boardCode','CBSE');batch.append('academicYear','2026-27');batch.append('language','en');batch.append('files',new Blob(['%PDF-1.7\ninvalid'],{type:'application/pdf'}),'first.pdf');batch.append('files',new Blob(['%PDF-1.7\ninvalid'],{type:'application/pdf'}),'second.pdf');
 const batchResponse=await fetch(`${baseUrl}/admin/syllabus/documents/upload-batch`,{method:'POST',headers:{Authorization:`Bearer ${adminToken}`},body:batch});
 assert.equal(batchResponse.status,200);const batchPayload=await batchResponse.json();assert.equal(batchPayload.data.failed,2);assert.equal(batchPayload.data.results.length,2);
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
