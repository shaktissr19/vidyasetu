-- 033_school_library_circulation.sql
-- School-scoped library catalogue, copy inventory, authorised staff circulation and learner loans.

DO $$ BEGIN
  CREATE TYPE library_copy_status AS ENUM ('AVAILABLE','LOANED','LOST','DAMAGED','WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE library_loan_status AS ENUM ('ACTIVE','RETURNED','LOST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'LIBRARY_BOOK_ISSUED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'LIBRARY_BOOK_RETURNED';

CREATE TABLE IF NOT EXISTS library_books (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title VARCHAR(240) NOT NULL,
  author VARCHAR(180),
  isbn VARCHAR(32),
  publisher VARCHAR(160),
  category VARCHAR(100),
  subject VARCHAR(100),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_library_books_school_active ON library_books(school_id,is_active,title);
CREATE INDEX IF NOT EXISTS idx_library_books_search ON library_books(school_id,title,author);
CREATE UNIQUE INDEX IF NOT EXISTS uq_library_books_school_isbn ON library_books(school_id,isbn) WHERE isbn IS NOT NULL;

CREATE TABLE IF NOT EXISTS library_book_copies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
  accession_number VARCHAR(80) NOT NULL,
  status library_copy_status NOT NULL DEFAULT 'AVAILABLE',
  shelf_location VARCHAR(80),
  condition_notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_library_copy_accession UNIQUE (school_id,accession_number)
);
CREATE INDEX IF NOT EXISTS idx_library_copies_book_status ON library_book_copies(book_id,status);
CREATE INDEX IF NOT EXISTS idx_library_copies_school_status ON library_book_copies(school_id,status);

CREATE TABLE IF NOT EXISTS library_staff_access (
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_circulate BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (school_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_library_staff_access_active ON library_staff_access(school_id,is_active,can_circulate);

CREATE TABLE IF NOT EXISTS library_loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  copy_id UUID NOT NULL REFERENCES library_book_copies(id),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status library_loan_status NOT NULL DEFAULT 'ACTIVE',
  issued_by UUID NOT NULL REFERENCES users(id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ NOT NULL,
  returned_at TIMESTAMPTZ,
  returned_by UUID REFERENCES users(id),
  issue_note VARCHAR(500),
  return_note VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_library_return_state CHECK (
    (status='ACTIVE' AND returned_at IS NULL AND returned_by IS NULL)
    OR (status='RETURNED' AND returned_at IS NOT NULL AND returned_by IS NOT NULL)
    OR status='LOST'
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_library_active_copy_loan ON library_loans(copy_id) WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS idx_library_loans_school_status ON library_loans(school_id,status,issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_loans_student ON library_loans(student_id,status,issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_loans_due ON library_loans(school_id,due_at) WHERE status='ACTIVE';

COMMENT ON TABLE library_books IS 'School-owned logical library catalogue.';
COMMENT ON TABLE library_book_copies IS 'Physical copy inventory identified by School accession number.';
COMMENT ON TABLE library_staff_access IS 'Explicit School Admin authorization for Teacher circulation actions.';
COMMENT ON TABLE library_loans IS 'Auditable Student book issue/return history.';
