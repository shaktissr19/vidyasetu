import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import { saveNotification } from './notification.service';

export type VehicleStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
export type RouteStatus = 'ACTIVE' | 'INACTIVE';
export type TransportEventType = 'PICKED_UP' | 'DROPPED_AT_SCHOOL' | 'BOARDED_RETURN' | 'DROPPED_HOME' | 'MISSED_BUS';

export interface VehicleInput {
  registrationNumber: string;
  label: string;
  vehicleType: 'BUS' | 'VAN' | 'AUTO' | 'OTHER';
  capacity: number;
  driverName: string;
  driverPhone: string;
  attendantName?: string | null;
  attendantPhone?: string | null;
  status?: VehicleStatus;
}
export interface RouteInput {
  routeCode: string;
  name: string;
  vehicleId?: UUID | null;
  morningStart?: string | null;
  afternoonStart?: string | null;
  status?: RouteStatus;
}
export interface StopInput {
  name: string;
  address?: string | null;
  sequenceNo: number;
  pickupTime?: string | null;
  dropTime?: string | null;
  isActive?: boolean;
}
export interface AssignmentInput {
  routeId: UUID;
  stopId: UUID;
  authorizedPickupName?: string | null;
  authorizedPickupPhone?: string | null;
  authorizedPickupRelation?: string | null;
}
export interface EventInput {
  studentId: UUID;
  eventType: TransportEventType;
  note?: string | null;
}

interface VehicleRow extends QueryResultRow {
  id: UUID; school_id: UUID; registration_number: string; label: string; vehicle_type: string;
  capacity: number; driver_name: string; driver_phone: string; attendant_name: string | null;
  attendant_phone: string | null; status: VehicleStatus; created_at: string | Date; updated_at: string | Date;
}
interface StopRow extends QueryResultRow {
  id: UUID; school_id: UUID; route_id: UUID; name: string; address: string | null; sequence_no: number;
  pickup_time: string | null; drop_time: string | null; is_active: boolean;
}
interface RouteRow extends QueryResultRow {
  id: UUID; school_id: UUID; vehicle_id: UUID | null; route_code: string; name: string;
  morning_start: string | null; afternoon_start: string | null; status: RouteStatus;
  vehicle_label?: string | null; registration_number?: string | null; vehicle_status?: VehicleStatus | null;
}
interface StudentContextRow extends QueryResultRow {
  id: UUID; user_id: UUID; school_id: UUID; name: string; student_code: string; class_name: string; section: string | null;
}
interface AssignmentRow extends QueryResultRow {
  id: UUID; school_id: UUID; student_id: UUID; route_id: UUID; stop_id: UUID; is_active: boolean;
  authorized_pickup_name: string | null; authorized_pickup_phone: string | null; authorized_pickup_relation: string | null;
  student_name?: string; student_code?: string; class_name?: string; section?: string | null;
  route_name?: string; route_code?: string; stop_name?: string; pickup_time?: string | null; drop_time?: string | null;
  vehicle_label?: string | null; registration_number?: string | null; driver_name?: string | null; driver_phone?: string | null;
  attendant_name?: string | null; attendant_phone?: string | null;
}
interface EventRow extends QueryResultRow {
  id: UUID; school_id: UUID; student_id: UUID; assignment_id: UUID; event_date: string; event_type: TransportEventType;
  event_at: string | Date; note: string | null; recorded_by: UUID;
}
interface CountRow extends QueryResultRow { count: number | string; }
interface RecipientRow extends QueryResultRow { user_id: UUID; }

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}
function clean(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

export async function transportSchemaReady(): Promise<boolean> {
  const { rows: [row] } = await query<{ ready: boolean } & QueryResultRow>(
    `SELECT to_regclass('public.transport_vehicles') IS NOT NULL
        AND to_regclass('public.transport_routes') IS NOT NULL
        AND to_regclass('public.transport_stops') IS NOT NULL
        AND to_regclass('public.student_transport_assignments') IS NOT NULL
        AND to_regclass('public.transport_student_events') IS NOT NULL AS ready`,
  );
  return Boolean(row?.ready);
}
async function requireSchema(): Promise<void> {
  if (!await transportSchemaReady()) throw httpError('School Transport is not initialized yet', 503);
}

export async function listVehicles(schoolId: UUID): Promise<VehicleRow[]> {
  await requireSchema();
  const { rows } = await query<VehicleRow>(
    `SELECT id,school_id,registration_number,label,vehicle_type,capacity,driver_name,driver_phone,
            attendant_name,attendant_phone,status,created_at,updated_at
     FROM transport_vehicles WHERE school_id=$1 ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END,label`, [schoolId]);
  return rows;
}
export async function createVehicle(schoolId: UUID, actorId: UUID, input: VehicleInput): Promise<VehicleRow> {
  await requireSchema();
  const { rows: [row] } = await query<VehicleRow>(
    `INSERT INTO transport_vehicles
      (school_id,registration_number,label,vehicle_type,capacity,driver_name,driver_phone,attendant_name,attendant_phone,status,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [schoolId,input.registrationNumber.trim().toUpperCase(),input.label.trim(),input.vehicleType,input.capacity,input.driverName.trim(),input.driverPhone.trim(),clean(input.attendantName),clean(input.attendantPhone),input.status || 'ACTIVE',actorId],
  );
  if (!row) throw new Error('Vehicle insert returned no row');
  return row;
}
export async function updateVehicle(schoolId: UUID, vehicleId: UUID, input: Partial<VehicleInput>): Promise<VehicleRow> {
  await requireSchema();
  const { rows: [current] } = await query<VehicleRow>('SELECT * FROM transport_vehicles WHERE id=$1 AND school_id=$2', [vehicleId,schoolId]);
  if (!current) throw httpError('Transport vehicle not found',404);
  const merged: VehicleInput = {
    registrationNumber: input.registrationNumber ?? current.registration_number,
    label: input.label ?? current.label,
    vehicleType: (input.vehicleType ?? current.vehicle_type) as VehicleInput['vehicleType'],
    capacity: input.capacity ?? current.capacity,
    driverName: input.driverName ?? current.driver_name,
    driverPhone: input.driverPhone ?? current.driver_phone,
    attendantName: input.attendantName === undefined ? current.attendant_name : input.attendantName,
    attendantPhone: input.attendantPhone === undefined ? current.attendant_phone : input.attendantPhone,
    status: input.status ?? current.status,
  };
  const { rows: [row] } = await query<VehicleRow>(
    `UPDATE transport_vehicles SET registration_number=$3,label=$4,vehicle_type=$5,capacity=$6,driver_name=$7,driver_phone=$8,
       attendant_name=$9,attendant_phone=$10,status=$11 WHERE id=$1 AND school_id=$2 RETURNING *`,
    [vehicleId,schoolId,merged.registrationNumber.trim().toUpperCase(),merged.label.trim(),merged.vehicleType,merged.capacity,merged.driverName.trim(),merged.driverPhone.trim(),clean(merged.attendantName),clean(merged.attendantPhone),merged.status],
  );
  if (!row) throw httpError('Transport vehicle not found',404);
  return row;
}

export async function listRoutes(schoolId: UUID): Promise<Array<RouteRow & { stops: StopRow[] }>> {
  await requireSchema();
  const { rows: routes } = await query<RouteRow>(
    `SELECT r.id,r.school_id,r.vehicle_id,r.route_code,r.name,r.morning_start::text,r.afternoon_start::text,r.status,
            v.label AS vehicle_label,v.registration_number,v.status AS vehicle_status
     FROM transport_routes r LEFT JOIN transport_vehicles v ON v.id=r.vehicle_id
     WHERE r.school_id=$1 ORDER BY CASE r.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,r.name`, [schoolId]);
  const { rows: stops } = await query<StopRow>(
    `SELECT id,school_id,route_id,name,address,sequence_no,pickup_time::text,drop_time::text,is_active
     FROM transport_stops WHERE school_id=$1 ORDER BY route_id,sequence_no`, [schoolId]);
  return routes.map((route) => ({ ...route, stops: stops.filter((stop) => stop.route_id === route.id) }));
}
export async function createRoute(schoolId: UUID, actorId: UUID, input: RouteInput): Promise<RouteRow> {
  await requireSchema();
  if (input.vehicleId) {
    const { rows: [vehicle] } = await query<VehicleRow>('SELECT * FROM transport_vehicles WHERE id=$1 AND school_id=$2',[input.vehicleId,schoolId]);
    if (!vehicle) throw httpError('Selected vehicle does not belong to this School',400);
  }
  const { rows: [row] } = await query<RouteRow>(
    `INSERT INTO transport_routes(school_id,vehicle_id,route_code,name,morning_start,afternoon_start,status,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,school_id,vehicle_id,route_code,name,morning_start::text,afternoon_start::text,status`,
    [schoolId,input.vehicleId || null,input.routeCode.trim().toUpperCase(),input.name.trim(),clean(input.morningStart),clean(input.afternoonStart),input.status || 'ACTIVE',actorId]);
  if (!row) throw new Error('Route insert returned no row');
  return row;
}
export async function createStop(schoolId: UUID, routeId: UUID, input: StopInput): Promise<StopRow> {
  await requireSchema();
  const { rows: [route] } = await query<RouteRow>('SELECT * FROM transport_routes WHERE id=$1 AND school_id=$2',[routeId,schoolId]);
  if (!route) throw httpError('Transport route not found',404);
  const { rows: [row] } = await query<StopRow>(
    `INSERT INTO transport_stops(school_id,route_id,name,address,sequence_no,pickup_time,drop_time,is_active)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id,school_id,route_id,name,address,sequence_no,pickup_time::text,drop_time::text,is_active`,
    [schoolId,routeId,input.name.trim(),clean(input.address),input.sequenceNo,clean(input.pickupTime),clean(input.dropTime),input.isActive ?? true]);
  if (!row) throw new Error('Stop insert returned no row');
  return row;
}

async function studentInSchool(schoolId: UUID, studentId: UUID): Promise<StudentContextRow> {
  const { rows: [row] } = await query<StudentContextRow>(
    `SELECT s.id,s.user_id,s.school_id,u.name,s.student_code,sc.class_name,sc.section
     FROM students s JOIN users u ON u.id=s.user_id JOIN school_classes sc ON sc.id=s.class_id
     WHERE s.id=$1 AND s.school_id=$2 AND s.status='ACTIVE' AND s.school_link_status='APPROVED' LIMIT 1`, [studentId,schoolId]);
  if (!row) throw httpError('Active enrolled Student not found in this School',404);
  return row;
}
async function assignmentTarget(schoolId: UUID, routeId: UUID, stopId: UUID): Promise<{ capacity: number; assigned: number; vehicleStatus: VehicleStatus }> {
  const { rows: [row] } = await query<{ capacity: number; assigned: number | string; vehicle_status: VehicleStatus } & QueryResultRow>(
    `SELECT v.capacity,v.status AS vehicle_status,
       (SELECT COUNT(*) FROM student_transport_assignments a WHERE a.route_id=r.id AND a.is_active=TRUE)::int AS assigned
     FROM transport_routes r JOIN transport_vehicles v ON v.id=r.vehicle_id
     JOIN transport_stops s ON s.route_id=r.id AND s.id=$3 AND s.is_active=TRUE
     WHERE r.id=$2 AND r.school_id=$1 AND r.status='ACTIVE' AND s.school_id=$1`, [schoolId,routeId,stopId]);
  if (!row) throw httpError('An active route, active stop and assigned vehicle are required',400);
  return { capacity: Number(row.capacity), assigned: Number(row.assigned), vehicleStatus: row.vehicle_status };
}
export async function assignStudent(schoolId: UUID, actorId: UUID, studentId: UUID, input: AssignmentInput): Promise<AssignmentRow> {
  await requireSchema();
  await studentInSchool(schoolId,studentId);
  const target = await assignmentTarget(schoolId,input.routeId,input.stopId);
  if (target.vehicleStatus !== 'ACTIVE') throw httpError('Selected transport vehicle is not active',409);
  const { rows: [existing] } = await query<AssignmentRow>('SELECT * FROM student_transport_assignments WHERE student_id=$1',[studentId]);
  if ((!existing || existing.route_id !== input.routeId || !existing.is_active) && target.assigned >= target.capacity) {
    throw httpError('Selected vehicle has reached its configured Student capacity',409);
  }
  const { rows: [row] } = await query<AssignmentRow>(
    `INSERT INTO student_transport_assignments
       (school_id,student_id,route_id,stop_id,authorized_pickup_name,authorized_pickup_phone,authorized_pickup_relation,is_active,assigned_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,TRUE,$8)
     ON CONFLICT(student_id) DO UPDATE SET school_id=EXCLUDED.school_id,route_id=EXCLUDED.route_id,stop_id=EXCLUDED.stop_id,
       authorized_pickup_name=EXCLUDED.authorized_pickup_name,authorized_pickup_phone=EXCLUDED.authorized_pickup_phone,
       authorized_pickup_relation=EXCLUDED.authorized_pickup_relation,is_active=TRUE,assigned_by=EXCLUDED.assigned_by
     RETURNING *`,
    [schoolId,studentId,input.routeId,input.stopId,clean(input.authorizedPickupName),clean(input.authorizedPickupPhone),clean(input.authorizedPickupRelation),actorId]);
  if (!row) throw new Error('Transport assignment returned no row');
  return row;
}

function assignmentSelect(where: string): string {
  return `SELECT a.*,u.name AS student_name,s.student_code,sc.class_name,sc.section,
      r.name AS route_name,r.route_code,st.name AS stop_name,st.pickup_time::text,st.drop_time::text,
      v.label AS vehicle_label,v.registration_number,v.driver_name,v.driver_phone,v.attendant_name,v.attendant_phone
    FROM student_transport_assignments a
    JOIN students s ON s.id=a.student_id JOIN users u ON u.id=s.user_id JOIN school_classes sc ON sc.id=s.class_id
    JOIN transport_routes r ON r.id=a.route_id JOIN transport_stops st ON st.id=a.stop_id
    LEFT JOIN transport_vehicles v ON v.id=r.vehicle_id
    WHERE ${where}`;
}
export async function listAssignments(schoolId: UUID): Promise<AssignmentRow[]> {
  await requireSchema();
  const { rows } = await query<AssignmentRow>(`${assignmentSelect('a.school_id=$1')} ORDER BY sc.class_name,sc.section,u.name`,[schoolId]);
  return rows;
}
export async function getManifest(schoolId: UUID, date: string): Promise<Array<AssignmentRow & { events: EventRow[] }>> {
  await requireSchema();
  const assignments = await listAssignments(schoolId);
  const { rows: events } = await query<EventRow>(
    `SELECT id,school_id,student_id,assignment_id,event_date::text,event_type,event_at,note,recorded_by
     FROM transport_student_events WHERE school_id=$1 AND event_date=$2::date ORDER BY event_at`,[schoolId,date]);
  return assignments.filter((a) => a.is_active).map((assignment) => ({ ...assignment, events: events.filter((e) => e.student_id === assignment.student_id) }));
}

async function validateEventSequence(studentId: UUID, eventType: TransportEventType): Promise<void> {
  const { rows } = await query<{ event_type: TransportEventType } & QueryResultRow>(
    `SELECT event_type FROM transport_student_events WHERE student_id=$1 AND event_date=CURRENT_DATE ORDER BY event_at`,[studentId]);
  const seen = new Set(rows.map((row) => row.event_type));
  if (seen.has(eventType)) throw httpError('This transport milestone is already recorded today',409);
  if (eventType === 'PICKED_UP' && seen.has('MISSED_BUS')) throw httpError('Student is already marked as having missed the bus today',409);
  if (eventType === 'DROPPED_AT_SCHOOL' && !seen.has('PICKED_UP')) throw httpError('Record PICKED_UP before DROPPED_AT_SCHOOL',409);
  if (eventType === 'BOARDED_RETURN' && !seen.has('DROPPED_AT_SCHOOL')) throw httpError('Record the morning School drop before the return journey',409);
  if (eventType === 'DROPPED_HOME' && !seen.has('BOARDED_RETURN')) throw httpError('Record BOARDED_RETURN before DROPPED_HOME',409);
  if (eventType === 'MISSED_BUS' && seen.has('PICKED_UP')) throw httpError('Student was already picked up today',409);
}
function eventMessage(eventType: TransportEventType, studentName: string): { type: string; title: string; body: string } {
  switch (eventType) {
    case 'PICKED_UP': return { type:'TRANSPORT_PICKED_UP', title:`Transport update · ${studentName}`, body:`${studentName} has been picked up for School.` };
    case 'DROPPED_AT_SCHOOL': return { type:'TRANSPORT_DROPPED_AT_SCHOOL', title:`Arrived at School · ${studentName}`, body:`${studentName} has been dropped at School.` };
    case 'BOARDED_RETURN': return { type:'TRANSPORT_BOARDED_RETURN', title:`Return journey · ${studentName}`, body:`${studentName} has boarded the return transport.` };
    case 'DROPPED_HOME': return { type:'TRANSPORT_DROPPED_HOME', title:`Dropped home · ${studentName}`, body:`${studentName} has been marked dropped at the assigned stop/home.` };
    default: return { type:'TRANSPORT_ALERT', title:`Transport alert · ${studentName}`, body:`${studentName} has been marked as MISSED BUS.` };
  }
}
export async function recordStudentEvent(schoolId: UUID, actorId: UUID, input: EventInput): Promise<EventRow> {
  await requireSchema();
  const student = await studentInSchool(schoolId,input.studentId);
  const { rows: [assignment] } = await query<AssignmentRow>(
    `SELECT * FROM student_transport_assignments WHERE student_id=$1 AND school_id=$2 AND is_active=TRUE`,[input.studentId,schoolId]);
  if (!assignment) throw httpError('Student does not have an active transport assignment',409);
  await validateEventSequence(input.studentId,input.eventType);
  const { rows: [event] } = await query<EventRow>(
    `INSERT INTO transport_student_events(school_id,student_id,assignment_id,event_type,note,recorded_by)
     VALUES($1,$2,$3,$4,$5,$6)
     RETURNING id,school_id,student_id,assignment_id,event_date::text,event_type,event_at,note,recorded_by`,
    [schoolId,input.studentId,assignment.id,input.eventType,clean(input.note),actorId]);
  if (!event) throw new Error('Transport event insert returned no row');
  const { rows: recipients } = await query<RecipientRow>(
    `SELECT s.user_id FROM students s WHERE s.id=$1
     UNION SELECT psl.parent_user_id FROM parent_student_links psl WHERE psl.student_id=$1`,[input.studentId]);
  const message = eventMessage(input.eventType,student.name);
  await Promise.all(recipients.map((recipient) => saveNotification({
    userId: recipient.user_id, schoolId, type: message.type, title: message.title, body: message.body,
    refId: event.id, refType: 'TRANSPORT_STUDENT_EVENT',
  })));
  return event;
}

async function transportSnapshot(student: StudentContextRow): Promise<{ student: StudentContextRow; assignment: AssignmentRow | null; todayEvents: EventRow[] }> {
  const { rows: [assignment] } = await query<AssignmentRow>(`${assignmentSelect('a.student_id=$1 AND a.school_id=$2 AND a.is_active=TRUE')} LIMIT 1`,[student.id,student.school_id]);
  if (!assignment) return { student, assignment: null, todayEvents: [] };
  const { rows: todayEvents } = await query<EventRow>(
    `SELECT id,school_id,student_id,assignment_id,event_date::text,event_type,event_at,note,recorded_by
     FROM transport_student_events WHERE student_id=$1 AND event_date=CURRENT_DATE ORDER BY event_at`,[student.id]);
  return { student, assignment, todayEvents };
}
export async function getStudentTransport(userId: UUID) {
  await requireSchema();
  const { rows: [student] } = await query<StudentContextRow>(
    `SELECT s.id,s.user_id,s.school_id,u.name,s.student_code,sc.class_name,sc.section
     FROM students s JOIN users u ON u.id=s.user_id JOIN school_classes sc ON sc.id=s.class_id
     WHERE s.user_id=$1 AND s.status='ACTIVE' AND s.school_link_status='APPROVED' AND s.school_id IS NOT NULL LIMIT 1`,[userId]);
  if (!student) throw httpError('An approved active School enrollment is required',403);
  return transportSnapshot(student);
}
export async function getParentChildTransport(parentUserId: UUID, studentId: UUID) {
  await requireSchema();
  const { rows: [student] } = await query<StudentContextRow>(
    `SELECT s.id,s.user_id,s.school_id,u.name,s.student_code,sc.class_name,sc.section
     FROM parent_student_links psl JOIN students s ON s.id=psl.student_id JOIN users u ON u.id=s.user_id
     JOIN school_classes sc ON sc.id=s.class_id
     WHERE psl.parent_user_id=$1 AND s.id=$2 AND s.status='ACTIVE' AND s.school_link_status='APPROVED' AND s.school_id IS NOT NULL LIMIT 1`,
    [parentUserId,studentId]);
  if (!student) throw httpError('You are not linked to this Student',403);
  return transportSnapshot(student);
}
