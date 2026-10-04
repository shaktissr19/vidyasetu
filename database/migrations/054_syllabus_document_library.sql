BEGIN;

CREATE TABLE IF NOT EXISTS syllabus_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES education_boards(id),
  academic_year VARCHAR(10) NOT NULL,
  grade_code VARCHAR(20) REFERENCES education_grade_levels(code),
  subject_id UUID REFERENCES subjects(id),
  title VARCHAR(240) NOT NULL,
  language VARCHAR(12) NOT NULL DEFAULT 'en',
  source_url TEXT NOT NULL,
  source_publisher VARCHAR(220),
  source_published_at DATE,
  source_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  storage_key TEXT NOT NULL,
  checksum_sha256 VARCHAR(64) NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  page_count INTEGER NOT NULL CHECK (page_count BETWEEN 1 AND 1000),
  extracted_text TEXT NOT NULL DEFAULT '',
  outline JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'REVIEW' CHECK (status IN ('REVIEW','APPROVED','REJECTED')),
  redistribution_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  redistribution_evidence_url TEXT,
  rights_reviewed_by UUID REFERENCES users(id),
  rights_reviewed_at TIMESTAMPTZ,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (board_id, academic_year, checksum_sha256)
);
CREATE INDEX IF NOT EXISTS idx_syllabus_documents_scope
  ON syllabus_documents(board_id, academic_year, grade_code, subject_id, status);
CREATE INDEX IF NOT EXISTS idx_syllabus_documents_checksum ON syllabus_documents(checksum_sha256);
CREATE OR REPLACE TRIGGER trg_syllabus_documents_updated_at
  BEFORE UPDATE ON syllabus_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE syllabus_documents IS 'Private source syllabus PDFs with provenance and reviewer-approved redistribution policy. Extracted outline is a candidate, not a verified curriculum.';
COMMIT;
