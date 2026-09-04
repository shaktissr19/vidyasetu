import 'dotenv/config';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { pool, query } from '../config/db';
import {
  createStudentRequest,
  issueDocument,
  listParentChildDocuments,
  listSchoolRequests,
  listStudentDocuments,
  reviewRequest,
  revokeDocument,
  verifyDocument,
  createParentRequest,
} from '../services/studentDocuments.service';

interface FixtureRow extends QueryResultRow {
  parent_user_id: UUID;
  student_id: UUID;
  student_user_id: UUID;
  school_id: UUID;
  admin_user_id: UUID;
}
interface IdRow extends QueryResultRow { id: UUID; }
interface StatusRow extends QueryResultRow { status: string; document_id: UUID | null; }
interface CountRow extends QueryResultRow { count: number | string; }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function expectStatus(work: () => Promise<unknown>, statusCode: number, label: string): Promise<void> {
  try { await work(); }
  catch (error: unknown) {
    if ((error as { statusCode?: number })?.statusCode === statusCode) return;
    throw error;
  }
  throw new Error(`${label}: expected ${statusCode}`);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') throw new Error('Student document certification is test-only and requires NODE_ENV=test');

  const { rows: [fixture] } = await query<FixtureRow>(
    `SELECT psl.parent_user_id,s.id AS student_id,s.user_id AS student_user_id,s.school_id,sch.admin_user_id
     FROM parent_student_links psl
     JOIN students s ON s.id=psl.student_id AND s.status='ACTIVE' AND s.school_link_status='APPROVED'
     JOIN schools sch ON sch.id=s.school_id AND sch.admin_user_id IS NOT NULL
     WHERE s.class_id IS NOT NULL
     ORDER BY psl.created_at NULLS LAST,psl.id LIMIT 1`,
  );
  assert(fixture, 'No linked Parent/Student fixture with School Admin exists');

  const { rows: [unlinkedParent] } = await query<IdRow>(
    `SELECT u.id FROM users u WHERE u.role='PARENT' AND u.id<>$1
       AND NOT EXISTS (SELECT 1 FROM parent_student_links psl WHERE psl.parent_user_id=u.id AND psl.student_id=$2)
     ORDER BY u.id LIMIT 1`,
    [fixture.parent_user_id, fixture.student_id],
  );
  assert(unlinkedParent, 'No unlinked Parent fixture available');

  const request = await createStudentRequest(fixture.student_user_id, {
    documentType: 'BONAFIDE_CERTIFICATE',
    purpose: 'Scholarship application certification',
  });
  assert(request.status === 'PENDING', 'Student request was not created PENDING');

  await expectStatus(
    () => createStudentRequest(fixture.student_user_id, {
      documentType: 'BONAFIDE_CERTIFICATE', purpose: 'Duplicate open request test',
    }),
    409,
    'Duplicate request protection',
  );
  await expectStatus(
    () => createParentRequest(unlinkedParent.id, fixture.student_id, {
      documentType: 'STUDY_CERTIFICATE', purpose: 'Unauthorized Parent request test',
    }),
    403,
    'Parent-child isolation',
  );

  const schoolQueue = await listSchoolRequests(fixture.school_id, 'PENDING');
  assert(schoolQueue.some((item) => item.id === request.id), 'School request queue does not contain Student request');

  const approved = await reviewRequest(fixture.school_id, fixture.admin_user_id, request.id, {
    action: 'APPROVE', note: 'Approved for scholarship use',
  });
  assert(approved.status === 'APPROVED', 'School did not approve request');

  const document = await issueDocument(fixture.school_id, fixture.admin_user_id, {
    studentId: fixture.student_id,
    documentType: 'BONAFIDE_CERTIFICATE',
    title: 'Bonafide Certificate',
    academicYear: '2026-27',
    notes: 'Issued through Student Records certification',
    requestId: request.id,
  });
  assert(document.status === 'ISSUED', 'Document was not issued');
  assert(Boolean(document.verification_code), 'Document verification code was not generated');

  const { rows: [fulfilled] } = await query<StatusRow>(
    `SELECT status::text,document_id FROM student_document_requests WHERE id=$1`, [request.id],
  );
  assert(fulfilled?.status === 'FULFILLED', 'Approved request was not fulfilled after issuance');
  assert(fulfilled?.document_id === document.id, 'Fulfilled request does not reference issued document');

  const studentDocs = await listStudentDocuments(fixture.student_user_id);
  assert(studentDocs.some((item) => item.id === document.id), 'Student cannot see issued document');
  const parentDocs = await listParentChildDocuments(fixture.parent_user_id, fixture.student_id);
  assert(parentDocs.some((item) => item.id === document.id), 'Linked Parent cannot see issued document');
  await expectStatus(() => listParentChildDocuments(unlinkedParent.id, fixture.student_id), 403, 'Parent document isolation');

  const verified = await verifyDocument(document.verification_code);
  assert(verified.verified === true, 'Issued document did not verify as valid');
  assert(verified.documentNumber === document.document_number, 'Verification returned wrong document number');

  const revoked = await revokeDocument(fixture.school_id, fixture.admin_user_id, document.id, 'Certification revocation test');
  assert(revoked.status === 'REVOKED', 'Issued document was not revoked');
  const verifiedAfterRevoke = await verifyDocument(document.verification_code);
  assert(verifiedAfterRevoke.verified === false, 'Revoked document still verifies as valid');
  assert(verifiedAfterRevoke.status === 'REVOKED', 'Revoked verification status is incorrect');

  const { rows: [notifications] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM notifications
     WHERE reference_type IN ('STUDENT_DOCUMENT_REQUEST','STUDENT_DOCUMENT')
       AND type IN ('DOCUMENT_REQUESTED','DOCUMENT_ISSUED','DOCUMENT_REVOKED')`,
  );
  assert(Number(notifications?.count || 0) >= 4, 'Expected document lifecycle notifications were not created');

  console.log('STUDENT RECORDS AND CERTIFICATES CERTIFIED');
  console.log(`Request: ${request.id} -> ${fulfilled.status}`);
  console.log(`Document: ${document.document_number} -> ${revoked.status}`);
}

main()
  .catch((error: unknown) => {
    console.error(`STUDENT DOCUMENT CERTIFICATION FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
