-- ============================================================
-- 006_fees.sql
-- Tables: fee_structures, fee_invoices, fee_payments
-- Trigger: update_invoice_after_payment
-- ============================================================

DO $$ BEGIN
  CREATE TYPE fee_status   AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_mode AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'RAZORPAY', 'CHEQUE', 'DD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── fee_structures ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fee_structures (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id      UUID         NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_name     VARCHAR(10)  NOT NULL,
  academic_year  VARCHAR(10)  NOT NULL DEFAULT '2025-26',
  term           SMALLINT     NOT NULL CHECK (term BETWEEN 1 AND 4),
  fee_head       VARCHAR(100) NOT NULL,   -- 'Tuition', 'Transport', 'Sports', etc.
  amount         NUMERIC(10,2) NOT NULL,
  due_date       DATE,
  is_optional    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (school_id, class_name, academic_year, term, fee_head)
);

CREATE INDEX IF NOT EXISTS idx_fs_school_id ON fee_structures(school_id);
CREATE INDEX IF NOT EXISTS idx_fs_class     ON fee_structures(class_name, academic_year);

CREATE OR REPLACE TRIGGER trg_fee_structures_updated_at
  BEFORE UPDATE ON fee_structures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE fee_structures IS 'School-defined fee heads per class per term';

-- ── fee_invoices ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fee_invoices (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       UUID         NOT NULL REFERENCES schools(id),
  student_id      UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year   VARCHAR(10)  NOT NULL DEFAULT '2025-26',
  term            SMALLINT     NOT NULL CHECK (term BETWEEN 1 AND 4),
  invoice_number  VARCHAR(50)  UNIQUE,
  amount_due      NUMERIC(10,2) NOT NULL,
  amount_paid     NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_waived   NUMERIC(10,2) NOT NULL DEFAULT 0,
  status          fee_status   NOT NULL DEFAULT 'PENDING',
  due_date        DATE,
  razorpay_order_id VARCHAR(100) UNIQUE,
  razorpay_payment_link TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (student_id, academic_year, term)
);

CREATE INDEX IF NOT EXISTS idx_fi_school_id     ON fee_invoices(school_id);
CREATE INDEX IF NOT EXISTS idx_fi_student_id    ON fee_invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_fi_status        ON fee_invoices(status);
CREATE INDEX IF NOT EXISTS idx_fi_academic_year ON fee_invoices(academic_year, term);
CREATE INDEX IF NOT EXISTS idx_fi_due_date      ON fee_invoices(due_date);

CREATE OR REPLACE TRIGGER trg_fee_invoices_updated_at
  BEFORE UPDATE ON fee_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE fee_invoices IS 'One invoice per student per term; status managed by trigger';

-- ── fee_payments ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fee_payments (
  id                   UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id           UUID          NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
  school_id            UUID          NOT NULL REFERENCES schools(id),
  student_id           UUID          NOT NULL REFERENCES students(id),
  amount               NUMERIC(10,2) NOT NULL,
  mode                 payment_mode  NOT NULL DEFAULT 'CASH',
  razorpay_payment_id  VARCHAR(100),
  transaction_ref      VARCHAR(100),
  receipt_url          TEXT,
  collected_by         UUID          REFERENCES users(id),  -- school admin who recorded it
  paid_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  notes                TEXT,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  -- Append-only: no UPDATE trigger needed
);

CREATE INDEX IF NOT EXISTS idx_fp_invoice_id  ON fee_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_fp_student_id  ON fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_fp_school_id   ON fee_payments(school_id);
CREATE INDEX IF NOT EXISTS idx_fp_paid_at     ON fee_payments(paid_at DESC);

COMMENT ON TABLE fee_payments IS 'Append-only payment receipts; each insert updates invoice via trigger';

-- ── Trigger: recompute invoice status after each payment ──────

CREATE OR REPLACE FUNCTION update_invoice_after_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_total_paid    NUMERIC(10,2);
  v_amount_due    NUMERIC(10,2);
  v_amount_waived NUMERIC(10,2);
  v_new_status    fee_status;
BEGIN
  SELECT SUM(amount) INTO v_total_paid
  FROM fee_payments
  WHERE invoice_id = NEW.invoice_id;

  SELECT amount_due, amount_waived
  INTO   v_amount_due, v_amount_waived
  FROM   fee_invoices
  WHERE  id = NEW.invoice_id;

  IF v_total_paid + v_amount_waived >= v_amount_due THEN
    v_new_status := 'PAID';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'PARTIAL';
  ELSE
    v_new_status := 'PENDING';
  END IF;

  UPDATE fee_invoices
  SET amount_paid = v_total_paid,
      status      = v_new_status,
      updated_at  = NOW()
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_payment_update_invoice
  AFTER INSERT ON fee_payments
  FOR EACH ROW EXECUTE FUNCTION update_invoice_after_payment();
