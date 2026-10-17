import { query } from '../config/db';
import { getStudentContext, canonicalGradeCode } from './studentCanonicalLearning.service';

const fail=(message:string,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const academicYear=()=>{const d=new Date();const start=d.getUTCMonth()<3?d.getUTCFullYear()-1:d.getUTCFullYear();return start+'-'+String(start+1).slice(-2);};
const statuses=['NOT_STARTED','IN_PROGRESS','COMPLETED','REVISED'] as const;

export async function markTopicProgress(userId:string,topicId:string,status:string){
 if(!(statuses as readonly string[]).includes(status))throw fail('Unsupported progress status');
 const student=await getStudentContext(userId);
 if(!student.board_code)throw fail('Your school must assign an education board before syllabus progress can be saved',409);
 const grade=canonicalGradeCode(student);
 const {rows:[topic]}=await query(`SELECT ct.id FROM curriculum_topics ct JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id JOIN curriculum_versions cv ON cv.id=cs.curriculum_version_id JOIN education_boards eb ON eb.id=cv.board_id WHERE ct.id=$1::uuid AND ct.is_retired=FALSE AND cs.class_name=$2 AND eb.code=$3 AND cv.publication_status='PUBLISHED' `,[topicId,grade,student.board_code]);
 if(!topic)throw fail('Topic not found in your published syllabus',404);
 await query(`INSERT INTO student_syllabus_progress(student_id,topic_id,student_status) VALUES($1,$2,$3) ON CONFLICT(student_id,topic_id) DO UPDATE SET student_status=EXCLUDED.student_status,updated_at=NOW()`,[student.student_id,topicId,status]);
 return {topicId,status,updatedAt:new Date().toISOString()};
}
export async function getTopicProgress(userId:string){
 const student=await getStudentContext(userId);
 const {rows}=await query(`SELECT p.topic_id,p.student_status,p.updated_at FROM student_syllabus_progress p JOIN curriculum_topics ct ON ct.id=p.topic_id JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id JOIN curriculum_versions cv ON cv.id=cs.curriculum_version_id JOIN education_boards eb ON eb.id=cv.board_id WHERE p.student_id=$1 AND cv.publication_status='PUBLISHED' AND eb.code=$2 AND cs.class_name=$3 AND cv.academic_year=$4`,[student.student_id,student.board_code,canonicalGradeCode(student),academicYear()]);
 return rows;
}

export async function getParentSubjectProgress(parentUserId:string,studentId:string){
 const {rows:[student]}=await query(`SELECT s.id,s.user_id FROM parent_student_links psl JOIN students s ON s.id=psl.student_id
   WHERE psl.parent_user_id=$1::uuid AND s.id=$2::uuid AND s.status='ACTIVE'`,[parentUserId,studentId]);
 if(!student)throw fail('Access denied to this student',403);
 const context=await getStudentContext(student.user_id);const grade=canonicalGradeCode(context);
 if(!context.board_code)return {studentId,boardCode:null,gradeCode:grade,subjects:[]};
 const {rows}=await query(`SELECT cs.subject_id,cs.display_name AS subject,COUNT(ct.id)::int AS total_topics,
   COUNT(*) FILTER(WHERE p.student_status IN('COMPLETED','REVISED'))::int AS completed_topics,
   ROUND(100.0*COUNT(*) FILTER(WHERE p.student_status IN('COMPLETED','REVISED'))/NULLIF(COUNT(ct.id),0),1) AS progress_pct
   FROM curriculum_versions cv JOIN curriculum_subjects cs ON cs.curriculum_version_id=cv.id
   JOIN curriculum_units cu ON cu.curriculum_subject_id=cs.id JOIN curriculum_topics ct ON ct.curriculum_unit_id=cu.id AND ct.is_retired=FALSE
   JOIN education_boards eb ON eb.id=cv.board_id LEFT JOIN student_syllabus_progress p ON p.topic_id=ct.id AND p.student_id=$4::uuid
   WHERE eb.code=$1 AND cv.academic_year=$2 AND cs.class_name=$3 AND cv.publication_status='PUBLISHED'
   GROUP BY cs.id,cs.display_name ORDER BY cs.sort_order,cs.display_name`,[context.board_code,academicYear(),grade,student.id]);
 return {studentId,boardCode:context.board_code,gradeCode:grade,academicYear:academicYear(),subjects:rows};
}
