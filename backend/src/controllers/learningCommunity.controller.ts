import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as communities from '../services/learningCommunity.service';
import * as R from '../utils/response';

function user(req:Request){if(!req.user)throw Object.assign(new Error('Unauthorized'),{statusCode:401});return req.user;}
function schoolId(req:Request):UUID{const id=user(req).schoolId;if(!id)throw Object.assign(new Error('School context is required'),{statusCode:400});return id;}
export async function list(req:Request,res:Response,next:NextFunction):Promise<Response|void>{try{const u=user(req);const search=typeof req.query.search==='string'?req.query.search:'';return R.ok(res,await communities.listLearningCommunities(u.userId,u.role,search));}catch(e:unknown){next(e);}}
export async function create(req:Request<Record<string,string>,unknown,communities.CreateLearningCommunityInput>,res:Response,next:NextFunction):Promise<Response|void>{try{const u=user(req);return R.created(res,await communities.createLearningCommunity(schoolId(req),u.userId,u.role,req.body));}catch(e:unknown){next(e);}}
export async function createPost(req:Request<Record<string,string>,unknown,communities.CreateLearningPostInput>,res:Response,next:NextFunction):Promise<Response|void>{try{return R.created(res,await communities.createLearningPost(req.params.groupId as UUID,user(req).userId,req.body));}catch(e:unknown){next(e);}}
