import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import { saveNotification } from './notification.service';

export type LibraryCopyStatus = 'AVAILABLE' | 'LOANED' | 'LOST' | 'DAMAGED' | 'WITHDRAWN';
export type LibraryLoanStatus = 'ACTIVE' | 'RETURNED' | 'LOST';
export type LibraryActorRole = 'SCHOOL_ADMIN' | 'SUPER_ADMIN' | 'TEACHER';

export interface CreateBookInput {
  title: string;
  author?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  category?: string | null;
  subject?: string | null;
  description?: string | null;
}
export interface CreateCopyInput {
  accessionNumber: string;
  shelfLocation?: string | null;
  conditionNotes?: string | null;
}
export interface StaffAccessInput { canCirculate: boolean; isActive: boolean; }
export interface IssueLoanInput { copyId: UUID; studentId: UUID; dueAt: string; note?: string | null; }
export interface ReturnLoanInput { note?: string | null; }

interface BookRow extends QueryResultRow {
  id: UUID; school_id: UUID; title: string; author: string | null; isbn: string | null; publisher: string | null;
  category: string | null; subject: string | null; description: string | null; is_active: boolean;
  total_copies?: number; available_copies?: number;
}
interface CopyRow extends QueryResultRow {
  id: UUID; school_id: UUID; book_id: UUID; accession_number: string; status: LibraryCopyStatus;
  shelf_location: string | null; condition_notes: string | null; title?: string; author?: string | null;
}
interface LoanRow extends QueryResultRow {
  id: UUID; school_id: UUID; copy_id: UUID; student_id: UUID; status: LibraryLoanStatus;
  issued_by: UUID; issued_at: string | Date; due_at: string | Date; returned_at: string | Date | null; returned_by: UUID | null;
  issue_note: string | null; return_note: string | null; title?: string; author?: string | null; accession_number?: string;
  student_name?: string; student_code?: string; class_name?: string | null; section?: string | null;
}
interface StudentRow extends QueryResultRow { id: UUID; user_id: UUID; school_id: UUID; student_name: string; student_code: string; }
interface RecipientRow extends QueryResultRow { user_id: UUID; }
interface StaffRow extends QueryResultRow { user_id: UUID; name: string; employee_id: string | null; can_circulate: boolean; is_active: boolean; }

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}
function clean(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}
export async function librarySchemaReady(): Promise<boolean> {
  const { rows: [row] } = await query<{ ready: boolean } & QueryResultRow>(
    `SELECT to_regclass('public.library_books') IS NOT NULL
        AND to_regclass('public.library_book_copies') IS NOT NULL
        AND to_regclass('public.library_staff_access') IS NOT NULL
        AND to_regclass('public.library_loans') IS NOT NULL AS ready`,
  );
  return Boolean(row?.ready);
}
async function requireSchema(): Promise<void> {
  if (!await librarySchemaReady()) throw httpError('School Library is not initialized yet', 503);
}
function requireAdmin(role: LibraryActorRole): void {
  if (role === 'TEACHER') throw httpError('School Admin access is required for library administration', 403);
}
async function requireCirculationAccess(schoolId: UUID, userId: UUID, role: LibraryActorRole): Promise<void> {
  if (role !== 'TEACHER') return;
  const { rows: [row] } = await query<QueryResultRow>(
    `SELECT 1 FROM teachers t
     JOIN library_staff_access a ON a.school_id=t.school_id AND a.user_id=t.user_id
     WHERE t.user_id=$1 AND t.school_id=$2 AND t.status='ACTIVE' AND a.is_active=TRUE AND a.can_circulate=TRUE LIMIT 1`,
    [userId, schoolId],
  );
  if (!row) throw httpError('This Teacher is not authorized for library circulation', 403);
}
async function studentInSchool(schoolId: UUID, studentId: UUID): Promise<StudentRow> {
  const { rows: [row] } = await query<StudentRow>(
    `SELECT s.id,s.user_id,s.school_id,u.name AS student_name,s.student_code
     FROM students s JOIN users u ON u.id=s.user_id
     WHERE s.id=$1 AND s.school_id=$2 AND s.status='ACTIVE' AND s.school_link_status='APPROVED' LIMIT 1`,
    [studentId, schoolId],
  );
  if (!row) throw httpError('Active enrolled Student not found in this School', 404);
  return row;
}
async function studentForUser(userId: UUID): Promise<StudentRow> {
  const { rows: [row] } = await query<StudentRow>(
    `SELECT s.id,s.user_id,s.school_id,u.name AS student_name,s.student_code
     FROM students s JOIN users u ON u.id=s.user_id
     WHERE s.user_id=$1 AND s.status='ACTIVE' AND s.school_link_status='APPROVED' AND s.school_id IS NOT NULL LIMIT 1`,
    [userId],
  );
  if (!row) throw httpError('An approved active School enrollment is required', 403);
  return row;
}
async function parentLinkedStudent(parentUserId: UUID, studentId: UUID): Promise<StudentRow> {
  const { rows: [row] } = await query<StudentRow>(
    `SELECT s.id,s.user_id,s.school_id,u.name AS student_name,s.student_code
     FROM parent_student_links psl JOIN students s ON s.id=psl.student_id JOIN users u ON u.id=s.user_id
     WHERE psl.parent_user_id=$1 AND s.id=$2 AND s.status='ACTIVE' AND s.school_link_status='APPROVED' AND s.school_id IS NOT NULL LIMIT 1`,
    [parentUserId, studentId],
  );
  if (!row) throw httpError('You are not linked to this Student', 403);
  return row;
}
function loanSelect(where: string): string {
  return `SELECT l.id,l.school_id,l.copy_id,l.student_id,l.status,l.issued_by,l.issued_at,l.due_at,l.returned_at,l.returned_by,l.issue_note,l.return_note,
    b.title,b.author,c.accession_number,u.name AS student_name,s.student_code,sc.class_name,sc.section
    FROM library_loans l
    JOIN library_book_copies c ON c.id=l.copy_id
    JOIN library_books b ON b.id=c.book_id
    JOIN students s ON s.id=l.student_id
    JOIN users u ON u.id=s.user_id
    LEFT JOIN school_classes sc ON sc.id=s.class_id
    WHERE ${where}`;
}

export async function listCatalog(schoolId: UUID): Promise<BookRow[]> {
  await requireSchema();
  const { rows } = await query<BookRow>(
    `SELECT b.*,COUNT(c.id)::int AS total_copies,
       COUNT(c.id) FILTER (WHERE c.status='AVAILABLE')::int AS available_copies
     FROM library_books b LEFT JOIN library_book_copies c ON c.book_id=b.id
     WHERE b.school_id=$1 AND b.is_active=TRUE GROUP BY b.id ORDER BY b.title`, [schoolId]);
  return rows;
}
export async function listCopies(schoolId: UUID, bookId?: UUID): Promise<CopyRow[]> {
  await requireSchema();
  const params: unknown[] = [schoolId];
  let where = 'c.school_id=$1';
  if (bookId) { params.push(bookId); where += ' AND c.book_id=$2'; }
  const { rows } = await query<CopyRow>(
    `SELECT c.*,b.title,b.author FROM library_book_copies c JOIN library_books b ON b.id=c.book_id WHERE ${where} ORDER BY b.title,c.accession_number`, params);
  return rows;
}
export async function createBook(schoolId: UUID, actorId: UUID, role: LibraryActorRole, input: CreateBookInput): Promise<BookRow> {
  await requireSchema(); requireAdmin(role);
  try {
    const { rows: [row] } = await query<BookRow>(
      `INSERT INTO library_books(school_id,title,author,isbn,publisher,category,subject,description,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [schoolId,input.title.trim(),clean(input.author),clean(input.isbn),clean(input.publisher),clean(input.category),clean(input.subject),clean(input.description),actorId]);
    if (!row) throw new Error('Library book insert returned no row');
    return row;
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === '23505') throw httpError('A book with this ISBN already exists in the School library', 409);
    throw error;
  }
}
export async function createCopy(schoolId: UUID, role: LibraryActorRole, bookId: UUID, input: CreateCopyInput): Promise<CopyRow> {
  await requireSchema(); requireAdmin(role);
  const { rows: [book] } = await query<BookRow>('SELECT id FROM library_books WHERE id=$1 AND school_id=$2 AND is_active=TRUE',[bookId,schoolId]);
  if (!book) throw httpError('Library book not found',404);
  try {
    const { rows: [row] } = await query<CopyRow>(
      `INSERT INTO library_book_copies(school_id,book_id,accession_number,shelf_location,condition_notes)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,[schoolId,bookId,input.accessionNumber.trim(),clean(input.shelfLocation),clean(input.conditionNotes)]);
    if (!row) throw new Error('Library copy insert returned no row');
    return row;
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === '23505') throw httpError('This accession number already exists in the School library',409);
    throw error;
  }
}
export async function listStaffAccess(schoolId: UUID, role: LibraryActorRole): Promise<StaffRow[]> {
  await requireSchema(); requireAdmin(role);
  const { rows } = await query<StaffRow>(
    `SELECT t.user_id,u.name,t.employee_id,COALESCE(a.can_circulate,FALSE) AS can_circulate,COALESCE(a.is_active,FALSE) AS is_active
     FROM teachers t JOIN users u ON u.id=t.user_id LEFT JOIN library_staff_access a ON a.school_id=t.school_id AND a.user_id=t.user_id
     WHERE t.school_id=$1 AND t.status='ACTIVE' ORDER BY u.name`,[schoolId]);
  return rows;
}
export async function setStaffAccess(schoolId: UUID, actorId: UUID, role: LibraryActorRole, teacherUserId: UUID, input: StaffAccessInput): Promise<StaffRow> {
  await requireSchema(); requireAdmin(role);
  const { rows: [teacher] } = await query<StaffRow>(
    `SELECT t.user_id,u.name,t.employee_id,FALSE AS can_circulate,FALSE AS is_active FROM teachers t JOIN users u ON u.id=t.user_id
     WHERE t.user_id=$1 AND t.school_id=$2 AND t.status='ACTIVE' LIMIT 1`,[teacherUserId,schoolId]);
  if (!teacher) throw httpError('Active Teacher not found in this School',404);
  await query(
    `INSERT INTO library_staff_access(school_id,user_id,can_circulate,is_active,granted_by)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(school_id,user_id) DO UPDATE SET can_circulate=EXCLUDED.can_circulate,is_active=EXCLUDED.is_active,granted_by=EXCLUDED.granted_by,updated_at=NOW()`,
    [schoolId,teacherUserId,input.canCirculate,input.isActive,actorId]);
  return {...teacher,can_circulate:input.canCirculate,is_active:input.isActive};
}
export async function listSchoolLoans(schoolId: UUID, role: LibraryActorRole, actorId: UUID, status?: LibraryLoanStatus): Promise<LoanRow[]> {
  await requireSchema(); await requireCirculationAccess(schoolId,actorId,role);
  const params: unknown[]=[schoolId]; let where='l.school_id=$1';
  if(status){params.push(status);where+=' AND l.status=$2';}
  const { rows }=await query<LoanRow>(`${loanSelect(where)} ORDER BY l.issued_at DESC`,params); return rows;
}
async function recipients(studentId: UUID): Promise<RecipientRow[]> {
  const { rows }=await query<RecipientRow>(`SELECT s.user_id FROM students s WHERE s.id=$1 UNION SELECT psl.parent_user_id FROM parent_student_links psl WHERE psl.student_id=$1`,[studentId]);
  return rows;
}
export async function issueLoan(schoolId: UUID, actorId: UUID, role: LibraryActorRole, input: IssueLoanInput): Promise<LoanRow> {
  await requireSchema(); await requireCirculationAccess(schoolId,actorId,role);
  const student=await studentInSchool(schoolId,input.studentId);
  const due=new Date(input.dueAt); if(Number.isNaN(due.getTime())||due<=new Date()) throw httpError('Due date must be in the future',400);
  const row=await transaction<LoanRow>(async(client)=>{
    const copyResult=await client.query<CopyRow>(`SELECT * FROM library_book_copies WHERE id=$1 AND school_id=$2 FOR UPDATE`,[input.copyId,schoolId]);
    const copy=copyResult.rows[0]; if(!copy) throw httpError('Library copy not found',404); if(copy.status!=='AVAILABLE') throw httpError('This library copy is not available for issue',409);
    const inserted=await client.query<LoanRow>(`INSERT INTO library_loans(school_id,copy_id,student_id,issued_by,due_at,issue_note) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[schoolId,copy.id,student.id,actorId,due.toISOString(),clean(input.note)]);
    const loan=inserted.rows[0]; if(!loan) throw new Error('Library loan insert returned no row');
    await client.query(`UPDATE library_book_copies SET status='LOANED',updated_at=NOW() WHERE id=$1`,[copy.id]); return loan;
  });
  const { rows:[full] }=await query<LoanRow>(`${loanSelect('l.id=$1')} LIMIT 1`,[row.id]);
  if(!full) throw new Error('Issued library loan could not be read back');
  await Promise.all((await recipients(student.id)).map((recipient)=>saveNotification({userId:recipient.user_id,schoolId,type:'LIBRARY_BOOK_ISSUED',title:`Library book issued · ${student.student_name}`,body:`${full.title} was issued. Due ${new Date(full.due_at).toLocaleDateString('en-IN')}.`,refId:full.id,refType:'LIBRARY_LOAN'})));
  return full;
}
export async function returnLoan(schoolId: UUID, actorId: UUID, role: LibraryActorRole, loanId: UUID, input: ReturnLoanInput): Promise<LoanRow> {
  await requireSchema(); await requireCirculationAccess(schoolId,actorId,role);
  const row=await transaction<LoanRow>(async(client)=>{
    const existing=await client.query<LoanRow>(`SELECT * FROM library_loans WHERE id=$1 AND school_id=$2 AND status='ACTIVE' FOR UPDATE`,[loanId,schoolId]);
    const loan=existing.rows[0]; if(!loan) throw httpError('Active library loan not found',404);
    const updated=await client.query<LoanRow>(`UPDATE library_loans SET status='RETURNED',returned_at=NOW(),returned_by=$3,return_note=$4,updated_at=NOW() WHERE id=$1 AND school_id=$2 RETURNING *`,[loanId,schoolId,actorId,clean(input.note)]);
    await client.query(`UPDATE library_book_copies SET status='AVAILABLE',updated_at=NOW() WHERE id=$1`,[loan.copy_id]);
    return updated.rows[0] as LoanRow;
  });
  const { rows:[full] }=await query<LoanRow>(`${loanSelect('l.id=$1')} LIMIT 1`,[row.id]);
  if(!full) throw new Error('Returned library loan could not be read back');
  await Promise.all((await recipients(full.student_id)).map((recipient)=>saveNotification({userId:recipient.user_id,schoolId,type:'LIBRARY_BOOK_RETURNED',title:`Library book returned · ${full.student_name || 'Student'}`,body:`${full.title} was returned to the School library.`,refId:full.id,refType:'LIBRARY_LOAN'})));
  return full;
}
export async function listStudentLoans(userId: UUID): Promise<LoanRow[]> {
  await requireSchema(); const student=await studentForUser(userId); const {rows}=await query<LoanRow>(`${loanSelect('l.student_id=$1')} ORDER BY l.issued_at DESC`,[student.id]); return rows;
}
export async function listParentChildLoans(parentUserId: UUID, studentId: UUID): Promise<LoanRow[]> {
  await requireSchema(); await parentLinkedStudent(parentUserId,studentId); const {rows}=await query<LoanRow>(`${loanSelect('l.student_id=$1')} ORDER BY l.issued_at DESC`,[studentId]); return rows;
}
