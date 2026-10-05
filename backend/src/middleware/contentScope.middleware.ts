import type { Request, Response, NextFunction } from 'express';
import { query } from '../config/db';
import { getStudentContext, canonicalGradeCode } from '../services/studentCanonicalLearning.service';
import * as R from '../utils/response';

/** Prevent ID-guessing from exposing class or school restricted legacy content. */
export async function enforceStudentContentScope(req:Request,res:Response,next:NextFunction){
 try{
  if(req.user?.role!=='STUDENT')return next();
  const id=req.params.itemId;
  const {rows:[item]}=await query(`SELECT ci.id,ci.visibility,ci.board_id,ci.grade_code,ci.subject_id,ci.school_id
    FROM content_items ci WHERE ci.id=$1::uuid AND ci.status='PUBLISHED'`,[id]);
  if(!item)return R.notFound(res,'Content not found');
  if(item.visibility==='PUBLIC')return next();
  const ctx=await getStudentContext(req.user.userId);
  let allowed=false;
  if(item.visibility==='CLASS_RESTRICTED'){
   const {rows:[board]}=item.board_id?await query('SELECT code FROM education_boards WHERE id=$1',[item.board_id]):{rows:[]};
   allowed=Boolean(board && board.code===ctx.board_code && item.grade_code===canonicalGradeCode(ctx) && (!item.subject_id || item.subject_id===req.params.subjectId));
   if(item.subject_id){
    const {rows:[belongs]}=await query('SELECT 1 FROM chapters ch JOIN content_items ci ON ci.chapter_id=ch.id WHERE ci.id=$1 AND ch.subject_id=$2',[id,item.subject_id]);
    allowed=Boolean(board && board.code===ctx.board_code && item.grade_code===canonicalGradeCode(ctx) && belongs);
   }
  }else if(item.visibility==='SCHOOL_PRIVATE')allowed=Boolean(ctx.school_id && item.school_id===ctx.school_id);
  if(!allowed)return R.notFound(res,'Content not found');
  return next();
 }catch(error){next(error);}
}
