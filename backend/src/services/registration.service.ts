import type { PoolClient, QueryResultRow } from 'pg';
import type { LanguageCode, UUID } from '@vidyasetu/contracts';
import { transaction } from '../config/db';
import { hashPassword } from '../utils/password';

export type PublicRegistrationRole = 'PARENT' | 'TEACHER' | 'SCHOOL_ADMIN';

export interface PublicRegistrationInput {
  role: PublicRegistrationRole;
  name: string;
  username?: string;
  email?: string;
  mobile: string;
  password: string;
  language?: LanguageCode;

  // Parent onboarding
  studentCode?: string;
  parentRelation?: 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'PARENT';

  // Teacher onboarding
  schoolId?: UUID;
  employeeId?: string;
  designation?: string;
  qualification?: string;
  experienceYears?: number;
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'VISITING';
  teacherNote?: string;

  // School onboarding
  schoolName?: string;
  udiseCode?: string;
  board?: string;
  affiliationNumber?: string;
  principalName?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  schoolMobile?: string;
  schoolEmail?: string;
  website?: string;
}

interface IdRow extends QueryResultRow { id: UUID; }
interface UserRow extends QueryResultRow {
  id: UUID;
  name: string;
  username: string;
  email: string | null;
  mobile: string;
  role: PublicRegistrationRole;
  status: 'ACTIVE' | 'PENDING';
  language: LanguageCode;
}
interface StudentRow extends QueryResultRow { id: UUID; student_code: string; }
interface SchoolRow extends QueryResultRow { id: UUID; name: string; status: string; }

function normalizeUsername(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 60);
}

function usernameBase(name: unknown): string {
  const parts = String(name || 'user')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'user';
  return normalizeUsername(parts.length === 1 ? parts[0] : `${parts[0]}.${parts[parts.length - 1]}`) || 'user';
}

async function allocateUsername(client: PoolClient, name: string, requested?: string): Promise<string> {
  const preferred = requested ? normalizeUsername(requested) : '';
  if (requested && preferred.length < 3) {
    throw Object.assign(new Error('Username must be at least 3 characters'), { statusCode: 400 });
  }
  const base = preferred || usernameBase(name);
  const exists = async (candidate: string): Promise<boolean> =>
    (await client.query('SELECT 1 FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1', [candidate])).rows.length > 0;

  if (!(await exists(base))) return base;
  if (preferred) throw Object.assign(new Error('Username is already taken'), { statusCode: 409 });

  for (let index = 2; index <= 9999; index += 1) {
    const suffix = `.${index}`;
    const candidate = `${base.slice(0, 60 - suffix.length)}${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw Object.assign(new Error('Could not allocate a username'), { statusCode: 409 });
}

async function assertIdentityAvailable(client: PoolClient, mobile: string, email: string | null): Promise<void> {
  const { rows: mobileRows } = await client.query<IdRow>('SELECT id FROM users WHERE mobile=$1 LIMIT 1', [mobile]);
  if (mobileRows.length) {
    throw Object.assign(new Error('This mobile number is already registered'), { statusCode: 409 });
  }
  if (email) {
    const { rows: emailRows } = await client.query<IdRow>(
      'SELECT id FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1',
      [email],
    );
    if (emailRows.length) {
      throw Object.assign(new Error('This email is already registered'), { statusCode: 409 });
    }
  }
}

async function createUser(client: PoolClient, data: PublicRegistrationInput): Promise<UserRow> {
  const mobile = String(data.mobile || '').trim();
  const email = data.email ? String(data.email).trim().toLowerCase() : null;
  await assertIdentityAvailable(client, mobile, email);
  const username = await allocateUsername(client, data.name, data.username);
  const passwordHash = await hashPassword(data.password);
  const status = data.role === 'PARENT' ? 'ACTIVE' : 'PENDING';

  const { rows: [user] } = await client.query<UserRow>(
    `INSERT INTO users
       (mobile,name,username,email,password_hash,password_changed_at,role,status,language)
     VALUES($1,$2,$3,$4,$5,NOW(),$6,$7,$8)
     RETURNING id,name,username,email,mobile,role,status,language`,
    [mobile, data.name.trim(), username, email, passwordHash, data.role, status, data.language || 'en'],
  );
  if (!user) throw new Error('User registration did not return a user');
  return user;
}

export async function registerPublicAccount(data: PublicRegistrationInput) {
  if (data.role === 'PARENT') return registerParent(data);
  if (data.role === 'TEACHER') return registerTeacher(data);
  if (data.role === 'SCHOOL_ADMIN') return registerSchool(data);
  throw Object.assign(new Error('This role cannot be created through public registration'), { statusCode: 403 });
}

async function registerParent(data: PublicRegistrationInput) {
  return transaction(async (client) => {
    const user = await createUser(client, data);
    let childRequest: Record<string, unknown> | null = null;

    if (data.studentCode?.trim()) {
      const { rows: [student] } = await client.query<StudentRow>(
        'SELECT id,student_code FROM students WHERE UPPER(student_code)=UPPER($1) LIMIT 1',
        [data.studentCode.trim()],
      );
      if (!student) {
        throw Object.assign(new Error('Student ID was not found. You can create the Parent account without linking a child.'), { statusCode: 404 });
      }
      const { rows: [request] } = await client.query(
        `INSERT INTO parent_link_requests
           (student_id,parent_user_id,parent_name,parent_mobile,parent_email,relation,status,
            initiated_by,requested_by_user_id,parent_confirmed_at,claimed_at)
         VALUES($1,$2,$3,$4,$5,$6,'AWAITING_STUDENT','PARENT',$2,NOW(),NOW())
         ON CONFLICT (parent_user_id,student_id)
           WHERE status IN ('PENDING','AWAITING_STUDENT','AWAITING_PARENT') AND parent_user_id IS NOT NULL
         DO UPDATE SET relation=EXCLUDED.relation,parent_confirmed_at=NOW(),status='AWAITING_STUDENT',updated_at=NOW()
         RETURNING id,student_id,status,initiated_by,created_at`,
        [student.id, user.id, user.name, user.mobile, user.email, data.parentRelation || 'PARENT'],
      );
      childRequest = request || null;
    }

    return {
      user,
      approvalStatus: 'ACTIVE',
      relationshipStatus: childRequest ? 'PENDING_STUDENT_CONFIRMATION' : 'NOT_REQUESTED',
      childRequest,
      message: childRequest
        ? 'Parent account created. Child access will appear after the Student confirms the relationship.'
        : 'Parent account created. You can link a child later using a verified relationship request.',
    };
  });
}

async function registerTeacher(data: PublicRegistrationInput) {
  if (!data.schoolId) {
    throw Object.assign(new Error('Select the School you want to join'), { statusCode: 400 });
  }

  return transaction(async (client) => {
    const { rows: [school] } = await client.query<SchoolRow>(
      "SELECT id,name,status FROM schools WHERE id=$1 AND status='ACTIVE' LIMIT 1",
      [data.schoolId],
    );
    if (!school) {
      throw Object.assign(new Error('Selected School is not available for Teacher registration'), { statusCode: 400 });
    }

    const user = await createUser(client, data);
    const { rows: [request] } = await client.query(
      `INSERT INTO teacher_school_requests
         (teacher_user_id,requested_school_id,status,employee_id,designation,qualification,
          experience_yrs,employment_type,teacher_note)
       VALUES($1,$2,'PENDING',$3,$4,$5,$6,$7,$8)
       RETURNING id,status,requested_at`,
      [user.id, school.id, data.employeeId || null, data.designation || 'Teacher',
       data.qualification || null, data.experienceYears || 0, data.employmentType || 'FULL_TIME',
       data.teacherNote || null],
    );

    return {
      user,
      approvalStatus: 'PENDING',
      relationshipStatus: 'PENDING_SCHOOL_APPROVAL',
      school: { id: school.id, name: school.name },
      teacherRequest: request,
      message: `${school.name} must approve your Teacher membership before School workspace access is enabled.`,
    };
  });
}

async function registerSchool(data: PublicRegistrationInput) {
  const schoolName = String(data.schoolName || '').trim();
  if (!schoolName) {
    throw Object.assign(new Error('School/Institution name is required'), { statusCode: 400 });
  }

  return transaction(async (client) => {
    if (data.udiseCode?.trim()) {
      const { rows } = await client.query<IdRow>(
        'SELECT id FROM schools WHERE UPPER(udise_code)=UPPER($1) LIMIT 1',
        [data.udiseCode.trim()],
      );
      if (rows.length) {
        throw Object.assign(new Error('A School with this UDISE code is already registered'), { statusCode: 409 });
      }
    }

    const user = await createUser(client, data);
    const { rows: [school] } = await client.query<SchoolRow>(
      `INSERT INTO schools
         (name,udise_code,admin_user_id,status,board,affiliation_number,principal_name,
          address,city,district,state,pincode,mobile,email,website,academic_year)
       VALUES($1,$2,$3,'PENDING',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'2026-27')
       RETURNING id,name,status`,
      [schoolName, data.udiseCode?.trim() || null, user.id, data.board || null,
       data.affiliationNumber?.trim() || null, data.principalName?.trim() || null,
       data.address?.trim() || null, data.city?.trim() || null, data.district?.trim() || null,
       data.state?.trim() || 'Uttar Pradesh', data.pincode?.trim() || null,
       data.schoolMobile?.trim() || user.mobile, data.schoolEmail?.trim().toLowerCase() || user.email,
       data.website?.trim() || null],
    );
    if (!school) throw new Error('School registration did not return a School');

    return {
      user,
      school,
      approvalStatus: 'PENDING',
      relationshipStatus: 'PENDING_PLATFORM_VERIFICATION',
      message: 'School application submitted. A Platform Admin must verify and activate the School before operational access is enabled.',
    };
  });
}
