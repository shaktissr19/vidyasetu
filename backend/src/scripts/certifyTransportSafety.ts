import 'dotenv/config';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { pool, query } from '../config/db';
import {
  assignStudent,
  createRoute,
  createStop,
  createVehicle,
  getManifest,
  getParentChildTransport,
  getStudentTransport,
  recordStudentEvent,
  transportSchemaReady,
} from '../services/transport.service';

interface FixtureRow extends QueryResultRow {
  parent_user_id: UUID;
  student_id: UUID;
  student_user_id: UUID;
  school_id: UUID;
  admin_user_id: UUID;
}
interface IdRow extends QueryResultRow { id: UUID; user_id?: UUID; }
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
  throw new Error(`${label}: expected HTTP ${statusCode}`);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') throw new Error('Transport certification is test-only and requires NODE_ENV=test');
  assert(await transportSchemaReady(), 'Transport schema readiness probe failed after migration 031');

  const { rows: [fixture] } = await query<FixtureRow>(
    `SELECT psl.parent_user_id,s.id AS student_id,s.user_id AS student_user_id,s.school_id,sch.admin_user_id
     FROM parent_student_links psl
     JOIN students s ON s.id=psl.student_id AND s.status='ACTIVE' AND s.school_link_status='APPROVED'
     JOIN schools sch ON sch.id=s.school_id AND sch.admin_user_id IS NOT NULL
     WHERE s.school_id IS NOT NULL AND s.class_id IS NOT NULL
     ORDER BY psl.created_at NULLS LAST,psl.id LIMIT 1`,
  );
  assert(fixture, 'No linked Parent/Student/School Admin fixture available');

  const { rows: [unlinkedParent] } = await query<IdRow>(
    `SELECT u.id FROM users u
     WHERE u.role='PARENT' AND u.id<>$1
       AND NOT EXISTS (
         SELECT 1 FROM parent_student_links psl
         WHERE psl.parent_user_id=u.id AND psl.student_id=$2
       )
     ORDER BY u.id LIMIT 1`,
    [fixture.parent_user_id, fixture.student_id],
  );
  assert(unlinkedParent, 'No unlinked Parent fixture available');

  const { rows: [secondStudent] } = await query<IdRow>(
    `SELECT s.id,s.user_id FROM students s
     WHERE s.school_id=$1 AND s.id<>$2 AND s.status='ACTIVE' AND s.school_link_status='APPROVED'
     ORDER BY s.id LIMIT 1`,
    [fixture.school_id, fixture.student_id],
  );
  assert(secondStudent, 'No second active Student exists in the fixture School');

  const vehicle = await createVehicle(fixture.school_id, fixture.admin_user_id, {
    registrationNumber: 'UP15CERT01',
    label: 'Certification Bus 1',
    vehicleType: 'BUS',
    capacity: 1,
    driverName: 'Certification Driver',
    driverPhone: '9000012345',
    attendantName: 'Certification Attendant',
    attendantPhone: '9000054321',
  });
  assert(vehicle.status === 'ACTIVE', 'Vehicle did not start ACTIVE');

  const route = await createRoute(fixture.school_id, fixture.admin_user_id, {
    routeCode: 'CERT-R1',
    name: 'Certification Route',
    vehicleId: vehicle.id,
    morningStart: '07:00',
    afternoonStart: '14:30',
  });
  const stop = await createStop(fixture.school_id, route.id, {
    name: 'Certification Stop',
    address: 'Certification landmark',
    sequenceNo: 1,
    pickupTime: '07:20',
    dropTime: '15:00',
  });

  const assignment = await assignStudent(fixture.school_id, fixture.admin_user_id, fixture.student_id, {
    routeId: route.id,
    stopId: stop.id,
    authorizedPickupName: 'Authorized Guardian',
    authorizedPickupPhone: '9000099999',
    authorizedPickupRelation: 'GUARDIAN',
  });
  assert(assignment.student_id === fixture.student_id, 'Student transport assignment failed');

  await expectStatus(
    () => assignStudent(fixture.school_id, fixture.admin_user_id, secondStudent.id, {
      routeId: route.id,
      stopId: stop.id,
    }),
    409,
    'Vehicle capacity guard',
  );

  const studentSnapshot = await getStudentTransport(fixture.student_user_id);
  assert(studentSnapshot.assignment?.route_id === route.id, 'Student cannot see own active transport assignment');
  assert(studentSnapshot.assignment?.stop_id === stop.id, 'Student transport snapshot has wrong stop');

  const parentSnapshot = await getParentChildTransport(fixture.parent_user_id, fixture.student_id);
  assert(parentSnapshot.assignment?.route_id === route.id, 'Linked Parent cannot see child transport assignment');
  await expectStatus(
    () => getParentChildTransport(unlinkedParent.id, fixture.student_id),
    403,
    'Parent transport isolation',
  );

  await expectStatus(
    () => recordStudentEvent(fixture.school_id, fixture.admin_user_id, {
      studentId: fixture.student_id,
      eventType: 'DROPPED_AT_SCHOOL',
    }),
    409,
    'Transport event sequence guard',
  );

  const pickedUp = await recordStudentEvent(fixture.school_id, fixture.admin_user_id, {
    studentId: fixture.student_id,
    eventType: 'PICKED_UP',
  });
  assert(pickedUp.event_type === 'PICKED_UP', 'PICKED_UP event was not persisted');
  await expectStatus(
    () => recordStudentEvent(fixture.school_id, fixture.admin_user_id, {
      studentId: fixture.student_id,
      eventType: 'PICKED_UP',
    }),
    409,
    'Duplicate milestone guard',
  );

  await recordStudentEvent(fixture.school_id, fixture.admin_user_id, {
    studentId: fixture.student_id,
    eventType: 'DROPPED_AT_SCHOOL',
  });
  await recordStudentEvent(fixture.school_id, fixture.admin_user_id, {
    studentId: fixture.student_id,
    eventType: 'BOARDED_RETURN',
  });
  await recordStudentEvent(fixture.school_id, fixture.admin_user_id, {
    studentId: fixture.student_id,
    eventType: 'DROPPED_HOME',
  });

  const manifest = await getManifest(fixture.school_id, new Date().toISOString().slice(0, 10));
  const learner = manifest.find((row) => row.student_id === fixture.student_id);
  assert(learner, 'Transport manifest does not contain assigned Student');
  assert(learner.events.length === 4, `Expected 4 ordered journey events, found ${learner.events.length}`);
  assert(learner.events[0]?.event_type === 'PICKED_UP', 'Manifest journey did not start with PICKED_UP');
  assert(learner.events[3]?.event_type === 'DROPPED_HOME', 'Manifest journey did not end with DROPPED_HOME');

  const refreshedStudent = await getStudentTransport(fixture.student_user_id);
  assert(refreshedStudent.todayEvents.length === 4, 'Student journey view does not expose today events');
  const refreshedParent = await getParentChildTransport(fixture.parent_user_id, fixture.student_id);
  assert(refreshedParent.todayEvents.length === 4, 'Parent journey view does not expose today events');

  const { rows: [notificationCount] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM notifications
     WHERE reference_type='TRANSPORT_STUDENT_EVENT'
       AND user_id IN ($1,$2)
       AND type IN ('TRANSPORT_PICKED_UP','TRANSPORT_DROPPED_AT_SCHOOL','TRANSPORT_BOARDED_RETURN','TRANSPORT_DROPPED_HOME')`,
    [fixture.student_user_id, fixture.parent_user_id],
  );
  assert(Number(notificationCount?.count || 0) >= 8, 'Student/Parent transport milestone notifications were not created');

  const { rows: [gpsColumns] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name IN ('transport_vehicles','transport_routes','transport_stops','student_transport_assignments','transport_student_events')
       AND (column_name ILIKE '%gps%' OR column_name IN ('latitude','longitude','lat','lng'))`,
  );
  assert(Number(gpsColumns?.count || 0) === 0, 'Transport schema unexpectedly claims/stores live GPS coordinates');

  console.log('SCHOOL TRANSPORT & PICKUP SAFETY CERTIFIED');
  console.log(`Vehicle: ${vehicle.id} -> ${vehicle.registration_number}`);
  console.log(`Route: ${route.id} / Stop: ${stop.id}`);
  console.log(`Student: ${fixture.student_id} -> 4 governed journey milestones`);
}

main()
  .catch((error: unknown) => {
    console.error(`TRANSPORT SAFETY CERTIFICATION FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
