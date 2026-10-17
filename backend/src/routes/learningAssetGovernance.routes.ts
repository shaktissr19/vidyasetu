import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import * as R from '../utils/response';
import * as governance from '../services/learningAssetGovernance.service';

const route=(fn:(req:Request)=>Promise<unknown>):RequestHandler=>async(req,res,next)=>{try{return R.ok(res,await fn(req));}catch(error){next(error);}};
const uuid=z.string().uuid();
const mapping=z.object({topicId:uuid,medium:z.enum(['en','hi']),visibility:z.enum(['PUBLIC','CLASS_RESTRICTED','SCHOOL_PRIVATE']),schoolId:uuid.nullable().optional()});
const bulk=z.object({rows:z.array(z.object({fileName:z.string().trim().min(1).max(240),topicId:uuid,medium:z.enum(['en','hi']),visibility:z.enum(['PUBLIC','CLASS_RESTRICTED','SCHOOL_PRIVATE']),schoolId:uuid.nullable().optional()})).min(1).max(1000)});

export const adminAssetGovernanceRoutes=Router();
adminAssetGovernanceRoutes.use(authenticate,authorize('SUPER_ADMIN'));
adminAssetGovernanceRoutes.get('/options',route(()=>governance.governanceOptions()));
adminAssetGovernanceRoutes.get('/assets',route(()=>governance.assetLibrary()));
adminAssetGovernanceRoutes.get('/assets/coverage',route(()=>governance.coverageHeatmap()));
adminAssetGovernanceRoutes.get('/assets/analytics',route(()=>governance.topicAnalytics()));
adminAssetGovernanceRoutes.post('/assets/:assetId/mappings',validate(z.object({assetId:uuid}),'params'),validate(mapping),route(req=>governance.mapAsset(req.params.assetId,req.body,req.user!.userId)));
adminAssetGovernanceRoutes.post('/assets/map-import/preview',validate(bulk),route(req=>governance.bulkMapAssets(req.body.rows,req.user!.userId,false)));
adminAssetGovernanceRoutes.post('/assets/map-import/commit',validate(bulk),route(req=>governance.bulkMapAssets(req.body.rows,req.user!.userId,true)));
adminAssetGovernanceRoutes.put('/reviewer-assignments',validate(z.object({subjectId:uuid,reviewerId:uuid})),route(req=>governance.assignReviewer(req.body.subjectId,req.body.reviewerId,req.user!.userId)));
adminAssetGovernanceRoutes.get('/assets/:assetId/history',validate(z.object({assetId:uuid}),'params'),route(req=>governance.assetHistory(req.params.assetId)));
adminAssetGovernanceRoutes.post('/assets/:assetId/snapshot',validate(z.object({assetId:uuid}),'params'),route(req=>governance.snapshotAsset(req.params.assetId,req.user!.userId)));
adminAssetGovernanceRoutes.post('/assets/:assetId/takedown',validate(z.object({assetId:uuid}),'params'),validate(z.object({reason:z.string().trim().min(5).max(2000)})),route(req=>governance.setTakedown(req.params.assetId,'TAKEN_DOWN',req.body.reason,req.user!.userId)));
adminAssetGovernanceRoutes.post('/assets/:assetId/restore',validate(z.object({assetId:uuid}),'params'),validate(z.object({reason:z.string().trim().min(5).max(2000)})),route(req=>governance.setTakedown(req.params.assetId,'ACTIVE',req.body.reason,req.user!.userId)));

export const reviewerAssetRoutes=Router();
reviewerAssetRoutes.use(authenticate,authorize('TEACHER','SCHOOL_ADMIN','SUPER_ADMIN'));
reviewerAssetRoutes.get('/queue',route(req=>governance.reviewQueue(req.user!.userId,req.user!.role==='SUPER_ADMIN')));
reviewerAssetRoutes.get('/workspace',route(req=>governance.reviewerWorkspace(req.user!.userId)));
reviewerAssetRoutes.put('/:assetId/checklist/:gateCode',validate(z.object({assetId:uuid,gateCode:z.string()}),'params'),validate(z.object({status:z.enum(['PENDING','PASS','FAIL','NOT_APPLICABLE']),note:z.string().trim().max(3000).nullable().optional()})),route(req=>governance.setChecklist(req.params.assetId,req.params.gateCode,req.body.status,req.body.note||null,req.user!.userId,req.user!.role==='SUPER_ADMIN')));
reviewerAssetRoutes.put('/class-coverage',validate(z.object({classId:uuid,topicId:uuid,status:z.enum(['NOT_COVERED','IN_PROGRESS','COVERED'])})),route(req=>governance.setClassCoverage({userId:req.user!.userId,role:req.user!.role,classId:req.body.classId,topicId:req.body.topicId,status:req.body.status})));
