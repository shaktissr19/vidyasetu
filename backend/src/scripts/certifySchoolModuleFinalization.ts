import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import { SCHOOL_GRADE_VALUES, isSchoolGradeValue } from '../constants/schoolGrades';
import * as schoolService from '../services/school.service';
import * as notificationService from '../services/notification.service';
import * as notificationInboxService from '../services/notificationInbox.service';

interface UserRow extends QueryResultRow { id: UUID; }
interface SchoolRow extends QueryResultRow { id: UUID; academic_year: string; }
interface CountRow extends QueryResultRow { count: number; }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SCHOOL FINALIZATION CERTIFICATION FAILED: ${message}`);
}

async function cleanupNotification(userId: UUID, dedupeKey: string): Promise<void> {
  await query('DELETE FROM notifications WHERE user_id=$1 AND dedupe_key=$2', [userId, dedupeKey]);
}

async function certifyGrades(): Promise<void> {
  assert(SCHOOL_GRADE_VALUES.length === 16, 'School must expose exactly 16 operational grades');
  for (const grade of ['PN', 'NURSERY', 'LKG', 'UKG', '1', '5', '8', '12']) {
    assert(isSchoolGradeValue(grade), `Expected supported School grade ${grade}`);
  }
  assert(!isSchoolGradeValue('13'), 'Class 13 must not be accepted');
  assert(!isSchoolGradeValue('PRE_NURSERY'), 'Operational School grade must remain PN, not Content grade PRE_NURSERY');

  const { rows: [school] } = await query<SchoolRow>('SELECT id,academic_year FROM schools ORDER BY created_at LIMIT 1');
  assert(school, 'Disposable baseline must contain a School');

  const section = 'CIFIN';
  await query(
    `DELETE FROM school_classes
     WHERE school_id=$1 AND class_name='PN' AND section=$2 AND academic_year=$3
       AND NOT EXISTS (SELECT 1 FROM students WHERE students.class_id=school_classes.id)`,
    [school.id, section, school.academic_year],
  );

  const schoolClass = await schoolService.createClass(school.id, {
    className: 'PN',
    section,
    academicYear: school.academic_year,
    roomNumber: 'CI-1',
  });
  assert(schoolClass?.class_name === 'PN', 'School service must persist Pre-Nursery as PN');

  const fee = await schoolService.upsertFeeStructure(school.id, {
    className: 'PN',
    academicYear: school.academic_year,
    term: 4,
    feeHead: 'CI Finalization Fee',
    amount: 1,
    dueDate: '2099-12-31',
    isOptional: true,
  });
  assert(fee?.class_name === 'PN', 'Fee structure must support Pre-Nursery');

  await query(
    `DELETE FROM fee_structures
     WHERE school_id=$1 AND class_name='PN' AND academic_year=$2 AND term=4 AND fee_head='CI Finalization Fee'`,
    [school.id, school.academic_year],
  );
  await query('DELETE FROM school_classes WHERE id=$1', [schoolClass.id]);
}

async function certifyNotificationInbox(): Promise<void> {
  const { rows: users } = await query<UserRow>('SELECT id FROM users ORDER BY created_at,id LIMIT 2');
  assert(users.length >= 2, 'Disposable baseline must contain at least two users');
  const first = users[0];
  const second = users[1];
  assert(first && second, 'Two notification recipients are required');

  const dedupeKey = `SCHOOL_FINALIZATION:${first.id}`;
  await cleanupNotification(first.id, dedupeKey);

  const beforeFirst = await notificationInboxService.getUnreadCount(first.id);
  const beforeSecond = await notificationInboxService.getUnreadCount(second.id);

  const inserted = await notificationService.saveNotification({
    userId: first.id,
    type: 'ANNOUNCEMENT',
    title: 'School finalization certification',
    body: 'Role-neutral notification inbox certification record.',
    refType: 'CERTIFICATION',
    dedupeKey,
    actionPath: '/notifications',
  });
  assert(inserted?.id, 'First idempotent notification insert must succeed');

  const duplicate = await notificationService.saveNotification({
    userId: first.id,
    type: 'ANNOUNCEMENT',
    title: 'School finalization certification duplicate',
    body: 'This duplicate must be suppressed.',
    refType: 'CERTIFICATION',
    dedupeKey,
    actionPath: '/notifications',
  });
  assert(!duplicate, 'Duplicate notification with the same recipient-scoped key must be suppressed');

  const { rows: [stored] } = await query<CountRow>(
    'SELECT COUNT(*)::INT AS count FROM notifications WHERE user_id=$1 AND dedupe_key=$2',
    [first.id, dedupeKey],
  );
  assert(Number(stored?.count || 0) === 1, 'Exactly one deduplicated notification must exist');

  const firstInbox = await notificationInboxService.listNotifications(first.id, { limit: 100 });
  const secondInbox = await notificationInboxService.listNotifications(second.id, { limit: 100 });
  assert(firstInbox.some((item) => item.id === inserted.id), 'Recipient must see its notification');
  assert(!secondInbox.some((item) => item.id === inserted.id), 'Another user must never see recipient notification');
  assert(await notificationInboxService.getUnreadCount(first.id) === beforeFirst + 1, 'Recipient unread count must increment once');
  assert(await notificationInboxService.getUnreadCount(second.id) === beforeSecond, 'Unrelated user unread count must not change');

  const marked = await notificationInboxService.markRead(first.id, inserted.id);
  assert(marked?.is_read === true, 'Recipient must be able to mark its notification read');
  assert(await notificationInboxService.getUnreadCount(first.id) === beforeFirst, 'Unread count must return to baseline after read');

  const forbidden = await notificationInboxService.markRead(second.id, inserted.id);
  assert(forbidden === null, 'Another user must not be able to mark the recipient notification read');

  await cleanupNotification(first.id, dedupeKey);
}

async function main(): Promise<void> {
  await certifyGrades();
  await certifyNotificationInbox();
  console.log('SCHOOL MODULE FINALIZATION CERTIFIED — 16 GRADES, SCHOOL OPERATIONS, ROLE-ISOLATED NOTIFICATIONS AND IDEMPOTENT DELIVERY');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
