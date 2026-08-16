const { query, transaction } = require('../config/db');
const { FeeModel } = require('../models');

const feeService = {

  getSchoolStats: async (schoolId) => {
    return FeeModel.getStats(schoolId);
  },

  getInvoices: async ({ schoolId, academicYear, term, status, limit, offset }) => {
    return FeeModel.getInvoicesBySchool({ schoolId, academicYear, term, status, limit, offset });
  },

  getStudentFees: async (studentId, academicYear) => {
    return FeeModel.getInvoicesByStudent(studentId, academicYear);
  },

  recordPayment: async ({ invoiceId, schoolId, studentId, amount, mode, razorpayPaymentId, transactionRef, collectedBy, notes }) => {
    // Validate invoice belongs to this school
    const invoice = await FeeModel.getInvoiceById(invoiceId);
    if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 });
    if (invoice.school_id !== schoolId) throw Object.assign(new Error('Unauthorized'), { status: 403 });
    if (amount <= 0) throw Object.assign(new Error('Invalid amount'), { status: 400 });

    const payment = await FeeModel.recordPayment({
      invoiceId, schoolId, studentId: invoice.student_id,
      amount, mode: mode || 'CASH',
      razorpayPaymentId, transactionRef, collectedBy, notes,
    });
    // Fetch updated invoice (trigger already updated status)
    const updated = await FeeModel.getInvoiceById(invoiceId);
    return { payment, invoice: updated };
  },

  getOverdueFees: async () => {
    const { rows } = await query(
      `SELECT fi.id, fi.amount_due, fi.amount_paid, fi.due_date,
              u.name AS student_name, u.mobile AS student_mobile,
              pu.mobile AS parent_mobile,
              s.name AS school_name, sc.class_name, sc.section
       FROM fee_invoices fi
       JOIN students st ON st.id = fi.student_id
       JOIN users u ON u.id = st.user_id
       JOIN school_classes sc ON sc.id = st.class_id
       JOIN schools s ON s.id = fi.school_id
       LEFT JOIN parent_student_links psl ON psl.student_id = st.id AND psl.is_primary = TRUE
       LEFT JOIN users pu ON pu.id = psl.parent_user_id
       WHERE fi.status IN ('PENDING','OVERDUE')
         AND fi.due_date < CURRENT_DATE
       ORDER BY fi.due_date ASC
       LIMIT 500`
    );
    return rows;
  },

  createInvoicesForClass: async ({ schoolId, classId, className, academicYear, term, createdBy }) => {
    // Get fee structures for this class
    const { rows: structures } = await query(
      `SELECT fee_head, amount FROM fee_structures
       WHERE school_id=$1 AND class_name=$2 AND academic_year=$3 AND term=$4`,
      [schoolId, className, academicYear, term]
    );
    if (!structures.length) throw Object.assign(new Error('No fee structure defined for this class/term'), { status: 400 });

    const totalAmount = structures.reduce((sum, s) => sum + parseFloat(s.amount), 0);

    // Get all active students in this class
    const { rows: students } = await query(
      `SELECT id FROM students WHERE class_id=$1 AND school_id=$2 AND status='ACTIVE'`,
      [classId, schoolId]
    );

    const created = [];
    for (const student of students) {
      const invoiceNumber = `INV-${schoolId.slice(0,4).toUpperCase()}-${academicYear.replace('-','')}-${Date.now()}`;
      const { rows } = await query(
        `INSERT INTO fee_invoices (school_id,student_id,academic_year,term,invoice_number,amount_due,status)
         VALUES ($1,$2,$3,$4,$5,$6,'PENDING')
         ON CONFLICT (student_id,academic_year,term) DO NOTHING
         RETURNING id`,
        [schoolId, student.id, academicYear, term, invoiceNumber, totalAmount]
      );
      if (rows[0]) created.push(rows[0].id);
    }
    return { created: created.length, total: students.length };
  },
};

module.exports = feeService;
