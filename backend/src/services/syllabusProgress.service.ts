import { query } from '../config/db';
import { getStudentContext, canonicalGradeCode } from './studentCanonicalLearning.service';

const fail=(message:string,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const statuses=['NOT_STARTED','IN_PROGRESS','COMPLETED','REVISED'] as const;

export async function markTopicProgress(userId:string,topicId:string,status:string){
 if(!(statuses as readonly string[]).includes(status))throw fail('Unsupported progress status');
 const student=await getStudentContext(userId);
 if(!student.board_code)throw fail('Your school must assign an education board before syllabus progress can be saved',409);
 const grade=canonicalGradeCode(student);
 const {rows:[topic]}=await query(`SELECT ct.id FROM curriculum_topics ct JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id JOIN curriculum_versions cv ON cv.id=cs.curriculum_version_id JOIN education_boards eb ON eb.id=cv.board_id WHERE ct.id=$1::uuid AND ct.is_retired=FALSE AND cs.class_name=$2 AND eb.code=$3 AND cv.publication_status='PUBLISHED' AND cv.academic_year=$4`,[topicId,grade,student.board_code,student.academic_year]);
 if(!topic)throw fail('Topic not found in your published syllabus',404);
 await query(`INSERT INTO student_syllabus_progress(student_id,topic_id,student_status) VALUES($1,$2,$3) ON CONFLICT(student_id,topic_id) DO UPDATE SET student_status=EXCLUDED.student_status,updated_at=NOW()`,[student.student_id,topicId,status]);
 return {topicId,status,updatedAt:new Date().toISOString()};
}
export async function getTopicProgress(userId:string){
 const student=await getStudentContext(userId);
 const {rows}=await query(`SELECT p.topic_id,p.student_status,p.updated_at FROM student_syllabus_progress p JOIN curriculum_topics ct ON ct.id=p.topic_id JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id JOIN curriculum_versions cv ON cv.id=cs.curriculum_version_id JOIN education_boards eb ON eb.id=cv.board_id WHERE p.student_id=$1 AND cv.publication_status='PUBLISHED' AND eb.code=$2 AND cs.class_name=$3`,[student.student_id,student.board_code,canonicalGradeCode(student)]);
 return rows;
}
