-- 032_student_records_certificates.sql
-- Structured School-issued Student records/certificates with family access and secure verification.

DO $$ BEGIN
  CREATE TYPE student_document_type AS ENUM (
    'BONAFIDE_CERTIFICATE',
    'STUDY_CERTIFICATE',
    'CHARACTER_CERTIFICATE',
    'TRANSFER_CERTIFICATE',
    'ENROLLMENT_CERTIFICATE',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE student_document_status AS ENUM ('ISSUED','REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE student_document_request_status AS ENUM ('PENDING','APPROVED','REJECTED','FULFILLED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'DOCUMENT_REQUESTED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'DOCUMENT_ISSUED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'DOCUMENT_REVOKED';

CREATE TABLE IF NOT EXISTS student_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  document_type student_document_type NOT NULL,
  document_number VARCHAR(80) NOT NULL,
  verification_code UUID NOT NULL DEFAULT uuid_generate_v4(),
  title VARCHAR(180) NOT NULL,
  academic_year VARCHAR(20),
  status student_document_status NOT NULL DEFAULT 'ISSUED',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until DATE,
  notes TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  student_name_snapshot VARCHAR(160) NOT NULL,
  student_code_snapshot VARCHAR(80) NOT NULL,
  class_label_snapshot VARCHAR(80),
  school_name_snapshot VARCHAR(200) NOT NULL,
  issued_by UUID NOT NULL REFERENCES users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id),
  revocation_reason VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_student_document_number UNIQUE (school_id, document_number),
  CONSTRAINT uq_student_document_verification UNIQUE (verification_code),
  CONSTRAINT chk_student_document_revocation CHECK (
    (status='ISSUED' AND revoked_at IS NULL AND revoked_by IS NULL)
    OR
    (status='REVOKED' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_student_documents_student_status
  ON student_documents(student_id,status,issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_documents_school_status
  ON student_documents(school_id,status,issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_documents_type
  ON student_documents(document_type,issued_at DESC);

CREATE TABLE IF NOT EXISTS student_document_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  requested_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by_role user_role NOT NULL,
  document_type student_document_type NOT NULL,
  purpose VARCHAR(500) NOT NULL,
  status student_document_request_status NOT NULL DEFAULT 'PENDING',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_note VARCHAR(500),
  document_id UUID REFERENCES student_documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_document_request_review CHECK (
    (status='PENDING' AND reviewed_at IS NULL)
    OR status IN ('APPROVED','REJECTED','FULFILLED','CANCELLED')
  )
);

CREATE INDEX IF NOT EXISTS idx_document_requests_school_status
  ON student_document_requests(school_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_requests_student
  ON student_document_requests(student_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_requests_requester
  ON student_document_requests(requested_by_user_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_student_document_request
  ON student_document_requests(student_id,document_type)
  WHERE status IN ('PENDING','APPROVED');

COMMENT ON TABLE student_documents IS 'Immutable structured snapshot of School-issued Student certificates/records; revoked documents remain auditable.';
COMMENT ON COLUMN student_documents.verification_code IS 'Unguessable public verification token; never derived from Student identity.';
COMMENT ON TABLE student_document_requests IS 'Student/Parent requests for School-issued certificates with School review lifecycle.';
