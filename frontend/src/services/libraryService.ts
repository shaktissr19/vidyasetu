import api from './api';
import type { ApiEnvelope } from '@/types/api';

export type LibraryCopyStatus='AVAILABLE'|'LOANED'|'LOST'|'DAMAGED'|'WITHDRAWN';
export type LibraryLoanStatus='ACTIVE'|'RETURNED'|'LOST';
export interface LibraryBook{ id:string; school_id:string; title:string; author?:string|null; isbn?:string|null; publisher?:string|null; category?:string|null; subject?:string|null; description?:string|null; is_active:boolean; total_copies?:number; available_copies?:number; }
export interface LibraryCopy{ id:string; school_id:string; book_id:string; accession_number:string; status:LibraryCopyStatus; shelf_location?:string|null; condition_notes?:string|null; title?:string; author?:string|null; }
export interface LibraryLoan{ id:string; school_id:string; copy_id:string; student_id:string; status:LibraryLoanStatus; issued_by:string; issued_at:string; due_at:string; returned_at?:string|null; returned_by?:string|null; issue_note?:string|null; return_note?:string|null; title?:string; author?:string|null; accession_number?:string; student_name?:string; student_code?:string; class_name?:string|null; section?:string|null; }
export interface LibraryStaffAccess{ user_id:string; name:string; employee_id?:string|null; can_circulate:boolean; is_active:boolean; }

export const getLibraryCatalog=()=>api.get<ApiEnvelope<LibraryBook[]>>('/school/library/catalog');
export const getLibraryCopies=(bookId?:string)=>api.get<ApiEnvelope<LibraryCopy[]>>('/school/library/copies',{params:{bookId}});
export const getSchoolLibraryLoans=(status?:LibraryLoanStatus)=>api.get<ApiEnvelope<LibraryLoan[]>>('/school/library/loans',{params:{status}});
export const createLibraryBook=(payload:{title:string;author?:string;isbn?:string;publisher?:string;category?:string;subject?:string;description?:string})=>api.post<ApiEnvelope<LibraryBook>>('/school/library/books',payload);
export const createLibraryCopy=(bookId:string,payload:{accessionNumber:string;shelfLocation?:string;conditionNotes?:string})=>api.post<ApiEnvelope<LibraryCopy>>(`/school/library/books/${bookId}/copies`,payload);
export const getLibraryStaffAccess=()=>api.get<ApiEnvelope<LibraryStaffAccess[]>>('/school/library/staff-access');
export const setLibraryStaffAccess=(userId:string,payload:{canCirculate:boolean;isActive:boolean})=>api.put<ApiEnvelope<LibraryStaffAccess>>(`/school/library/staff-access/${userId}`,payload);
export const issueLibraryLoan=(payload:{copyId:string;studentId:string;dueAt:string;note?:string})=>api.post<ApiEnvelope<LibraryLoan>>('/school/library/loans',payload);
export const returnLibraryLoan=(loanId:string,note?:string)=>api.patch<ApiEnvelope<LibraryLoan>>(`/school/library/loans/${loanId}/return`,{note});
export const getMyLibraryLoans=()=>api.get<ApiEnvelope<LibraryLoan[]>>('/student/library/loans');
export const getParentChildLibraryLoans=(studentId:string)=>api.get<ApiEnvelope<LibraryLoan[]>>(`/parent/library/children/${studentId}/loans`);
