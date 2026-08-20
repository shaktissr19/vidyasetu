'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { generateFeeInvoices, getClasses, getFeeOverview, getFeeStructures, recordPayment, saveFeeStructure, sendFeeReminders, type FeeInvoiceRow, type FeeReceiptData } from '@/services/schoolService';
import { SectionHeader, StatCard, TableSkeleton, StatusBadge } from '@/components/ui/index';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

type CsvCell = string | number | boolean | null | undefined;
interface PaymentForm { amount: string; paymentMode: string; transactionRef: string; notes: string; }
interface StructureForm { className: string; term: number; feeHead: string; amount: string; dueDate: string; isOptional: boolean; }
interface GenerateForm { classId: string; term: number; dueDate: string; }
type ReceiptView = FeeReceiptData & { studentName: string; classLabel: string; invoiceNumber: string | null };

function csv(name: string, rows: CsvCell[][]) {
  const text = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}

export default function SchoolFeesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'invoices' | 'structures'>('invoices');
  const [filter, setFilter] = useState('ALL');
  const [paying, setPaying] = useState<FeeInvoiceRow | null>(null);
  const [payment, setPayment] = useState<PaymentForm>({ amount: '', paymentMode: 'CASH', transactionRef: '', notes: '' });
  const [structure, setStructure] = useState<StructureForm>({ className: '', term: 1, feeHead: 'Tuition Fee', amount: '', dueDate: '', isOptional: false });
  const [generate, setGenerate] = useState<GenerateForm>({ classId: '', term: 1, dueDate: '' });
  const [receipt, setReceipt] = useState<ReceiptView | null>(null);

  const feesQ = useQuery({ queryKey: ['school-fees'], queryFn: () => getFeeOverview().then((r) => r.data.data) });
  const data = feesQ.data || { academicYear: '', summary: {}, invoices: [] };
  const invoices = data.invoices || [];
  const summary = data.summary || {};
  const structuresQ = useQuery({ queryKey: ['fee-structures'], queryFn: () => getFeeStructures().then((r) => r.data.data), enabled: tab === 'structures' });
  const classesQ = useQuery({ queryKey: ['school-classes'], queryFn: () => getClasses().then((r) => r.data.data || []) });
  const classes = classesQ.data || [];
  const classNames = useMemo(() => [...new Set(classes.map((schoolClass) => schoolClass.class_name))].sort((a, b) => Number(a) - Number(b)), [classes]);

  const structureMut = useMutation({
    mutationFn: () => saveFeeStructure({ ...structure, amount: Number(structure.amount), dueDate: structure.dueDate || undefined }),
    onSuccess: async () => { toast.success('Fee structure saved'); await qc.invalidateQueries({ queryKey: ['fee-structures'] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });
  const generateMut = useMutation({
    mutationFn: () => generateFeeInvoices({ ...generate, term: Number(generate.term), dueDate: generate.dueDate || undefined }),
    onSuccess: async (res) => { toast.success(`${res.data.data.created} invoices created`); await Promise.all([qc.invalidateQueries({ queryKey: ['school-fees'] }), qc.invalidateQueries({ queryKey: ['school-overview'] })]); },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });
  const paymentMut = useMutation({
    mutationFn: async () => {
      if (!paying) throw new Error('No invoice selected');
      return recordPayment({ invoiceId: paying.id, amount: Number(payment.amount), paymentMode: payment.paymentMode, transactionRef: payment.transactionRef || undefined, notes: payment.notes || undefined });
    },
    onSuccess: async (res) => {
      if (!paying) return;
      setReceipt({ ...res.data.data, studentName: paying.name, classLabel: `${paying.class_name || ''}-${paying.section || ''}`, invoiceNumber: paying.invoice_number || null });
      setPaying(null); setPayment({ amount: '', paymentMode: 'CASH', transactionRef: '', notes: '' }); toast.success('Payment recorded');
      await Promise.all([qc.invalidateQueries({ queryKey: ['school-fees'] }), qc.invalidateQueries({ queryKey: ['school-overview'] })]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });
  const reminders = useMutation({ mutationFn: sendFeeReminders, onSuccess: (res) => toast.success(`Reminder sent to ${res.data.data.sent} Parent accounts`), onError: (error: unknown) => toast.error(apiErrorText(error)) });

  const filtered = filter === 'ALL' ? invoices : invoices.filter((invoice) => invoice.status === filter);
  function exportCsv() { csv('school-fees.csv', [['Student ID', 'Student', 'Class', 'Term', 'Invoice', 'Due', 'Paid', 'Outstanding', 'Due Date', 'Status'], ...filtered.map((invoice) => [invoice.student_code, invoice.name, `${invoice.class_name}-${invoice.section}`, invoice.term, invoice.invoice_number, invoice.amount_due, invoice.amount_paid, invoice.outstanding, invoice.due_date, invoice.status])]); }
  function openPay(invoice: FeeInvoiceRow) { setPaying(invoice); setPayment({ amount: String(invoice.outstanding || ''), paymentMode: 'CASH', transactionRef: '', notes: '' }); }

  return <div className="animate-fade-up">
    <SectionHeader title="💰 Fee Management" sub={`Academic Year ${data.academicYear || '—'}`}><button className="btn-outline text-sm" disabled={!filtered.length} onClick={exportCsv}>📤 Export</button><button className="btn-primary text-sm" disabled={reminders.isPending} onClick={() => reminders.mutate()}>📲 Send Reminders</button></SectionHeader>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5"><StatCard label="Amount Due" value={formatCurrency(summary.amountDue || 0)} accent="var(--navy)" /><StatCard label="Collected" value={formatCurrency(summary.collected || 0)} accent="var(--forest)" /><StatCard label="Outstanding" value={formatCurrency(summary.outstanding || 0)} accent="var(--saffron)" /><StatCard label="Overdue" value={summary.OVERDUE || 0} sub="invoices" accent="#C62828" /></div>
    <div className="flex gap-2 mb-4">{([['invoices', 'Invoices & Payments'], ['structures', 'Fee Structure']] as const).map(([key, label]) => <button key={key} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: tab === key ? 'var(--navy)' : '#F0F4F8', color: tab === key ? 'white' : 'var(--slate)' }} onClick={() => setTab(key)}>{label}</button>)}</div>

    {tab === 'invoices' ? <>
      <div className="card mb-4"><div className="grid md:grid-cols-[1fr_auto] gap-3"><div><label className="text-xs font-bold block mb-1">Generate class invoices</label><div className="flex flex-wrap gap-2"><select className="input select flex-1 min-w-[170px]" value={generate.classId} onChange={(e) => setGenerate((value) => ({ ...value, classId: e.target.value }))}><option value="">Select class</option>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>Class {schoolClass.class_name}-{schoolClass.section}</option>)}</select><select className="input select w-auto" value={generate.term} onChange={(e) => setGenerate((value) => ({ ...value, term: Number(e.target.value) }))}>{[1, 2, 3, 4].map((term) => <option key={term} value={term}>Term {term}</option>)}</select><input type="date" className="input w-auto" value={generate.dueDate} onChange={(e) => setGenerate((value) => ({ ...value, dueDate: e.target.value }))} /></div></div><button className="btn-primary self-end" disabled={!generate.classId || generateMut.isPending} onClick={() => generateMut.mutate()}>{generateMut.isPending ? 'Generating…' : 'Generate Invoices'}</button></div></div>
      <div className="flex flex-wrap gap-2 mb-4">{['ALL', 'PAID', 'PENDING', 'PARTIAL', 'OVERDUE'].map((key) => <button key={key} onClick={() => setFilter(key)} className="px-4 py-1.5 rounded-full text-sm font-bold" style={{ background: filter === key ? 'var(--navy)' : '#F0F4F8', color: filter === key ? 'white' : 'var(--slate)' }}>{key}</button>)}</div>
      <div className="card">{feesQ.isLoading ? <TableSkeleton rows={7} cols={8} /> : feesQ.isError ? <div style={{ color: '#C62828' }}>{apiErrorText(feesQ.error)}</div> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Student</th><th>Class</th><th>Term</th><th>Due</th><th>Paid</th><th>Outstanding</th><th>Due Date</th><th>Status</th><th>Action</th></tr></thead><tbody>{filtered.map((invoice) => <tr key={invoice.id}><td><b>{invoice.name}</b><div className="text-xs" style={{ color: 'var(--slate)' }}>{invoice.student_code}</div></td><td>{invoice.class_name}-{invoice.section}</td><td>{invoice.term}</td><td>{formatCurrency(invoice.amount_due)}</td><td style={{ color: 'var(--forest)' }}>{formatCurrency(invoice.amount_paid)}</td><td><b>{formatCurrency(invoice.outstanding)}</b></td><td>{formatDate(invoice.due_date)}</td><td><StatusBadge status={invoice.status} /></td><td>{Number(invoice.outstanding) > 0 ? <button className="text-xs font-bold px-3 py-1 rounded-lg" style={{ background: 'var(--saffron-pale)', color: 'var(--saffron)' }} onClick={() => openPay(invoice)}>Collect</button> : <span className="text-xs" style={{ color: 'var(--forest)' }}>Paid</span>}</td></tr>)}</tbody></table>{!filtered.length && <div className="py-10 text-center" style={{ color: 'var(--slate)' }}>No invoices in this filter.</div>}</div>}</div>
    </> : <>
      <div className="card mb-5" style={{ border: '2px solid var(--saffron)' }}><h3 className="font-display font-bold mb-4" style={{ color: 'var(--navy)' }}>Create / Update Fee Head</h3><div className="grid md:grid-cols-4 gap-3"><select className="input select" value={structure.className} onChange={(e) => setStructure((value) => ({ ...value, className: e.target.value }))}><option value="">Select class</option>{classNames.map((className) => <option key={className} value={className}>Class {className}</option>)}</select><select className="input select" value={structure.term} onChange={(e) => setStructure((value) => ({ ...value, term: Number(e.target.value) }))}>{[1, 2, 3, 4].map((term) => <option key={term} value={term}>Term {term}</option>)}</select><input className="input" value={structure.feeHead} onChange={(e) => setStructure((value) => ({ ...value, feeHead: e.target.value }))} placeholder="Fee head" /><input type="number" min="1" className="input" value={structure.amount} onChange={(e) => setStructure((value) => ({ ...value, amount: e.target.value }))} placeholder="Amount ₹" /><input type="date" className="input" value={structure.dueDate} onChange={(e) => setStructure((value) => ({ ...value, dueDate: e.target.value }))} /><label className="text-sm flex items-center gap-2"><input type="checkbox" checked={structure.isOptional} onChange={(e) => setStructure((value) => ({ ...value, isOptional: e.target.checked }))} /> Optional fee</label></div><button className="btn-primary mt-4" disabled={!structure.className || !structure.feeHead.trim() || !structure.amount || structureMut.isPending} onClick={() => structureMut.mutate()}>{structureMut.isPending ? 'Saving…' : 'Save Fee Structure'}</button></div>
      <div className="card">{structuresQ.isLoading ? <TableSkeleton rows={6} cols={6} /> : structuresQ.isError ? <div style={{ color: '#C62828' }}>{apiErrorText(structuresQ.error)}</div> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Class</th><th>Term</th><th>Fee Head</th><th>Amount</th><th>Due Date</th><th>Type</th></tr></thead><tbody>{(structuresQ.data?.structures || []).map((row) => <tr key={row.id}><td>Class {row.class_name}</td><td>{row.term}</td><td><b>{row.fee_head}</b></td><td>{formatCurrency(row.amount)}</td><td>{formatDate(row.due_date)}</td><td>{row.is_optional ? 'Optional' : 'Mandatory'}</td></tr>)}</tbody></table>{!(structuresQ.data?.structures || []).length && <div className="py-10 text-center" style={{ color: 'var(--slate)' }}>No fee structure configured for this academic year.</div>}</div>}</div>
    </>}

    {paying && <div className="fixed inset-0 z-[1200] grid place-items-center p-4" style={{ background: 'rgba(13,27,62,.55)' }}><div className="card w-full max-w-md" style={{ background: 'white' }}><div className="flex justify-between"><div><h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>Collect Fee</h3><p className="text-xs" style={{ color: 'var(--slate)' }}>{paying.name} · Outstanding {formatCurrency(paying.outstanding)}</p></div><button onClick={() => setPaying(null)}>✕</button></div><input type="number" min="0.01" max={Number(paying.outstanding)} step="0.01" className="input mt-4" value={payment.amount} onChange={(e) => setPayment((value) => ({ ...value, amount: e.target.value }))} /><select className="input select mt-3" value={payment.paymentMode} onChange={(e) => setPayment((value) => ({ ...value, paymentMode: e.target.value }))}>{['CASH', 'UPI', 'BANK_TRANSFER', 'RAZORPAY', 'CHEQUE', 'DD'].map((mode) => <option key={mode} value={mode}>{mode.replaceAll('_', ' ')}</option>)}</select><input className="input mt-3" placeholder="Transaction / reference (optional)" value={payment.transactionRef} onChange={(e) => setPayment((value) => ({ ...value, transactionRef: e.target.value }))} /><textarea className="input mt-3" rows={2} placeholder="Notes" value={payment.notes} onChange={(e) => setPayment((value) => ({ ...value, notes: e.target.value }))} /><button className="btn-primary w-full justify-center mt-4" disabled={paymentMut.isPending || Number(payment.amount) <= 0 || Number(payment.amount) > Number(paying.outstanding)} onClick={() => paymentMut.mutate()}>{paymentMut.isPending ? 'Recording…' : 'Record Payment'}</button></div></div>}
    {receipt && <div className="fixed inset-0 z-[1200] grid place-items-center p-4" style={{ background: 'rgba(13,27,62,.55)' }}><div className="card w-full max-w-md" id="school-fee-receipt" style={{ background: 'white' }}><div className="text-center"><div className="text-4xl">✅</div><h3 className="font-display font-bold text-xl mt-2" style={{ color: 'var(--forest)' }}>Payment Receipt</h3></div><div className="mt-5 space-y-2 text-sm"><div className="flex justify-between"><span>Receipt</span><b>{receipt.receiptNumber}</b></div><div className="flex justify-between"><span>Student</span><b>{receipt.studentName}</b></div><div className="flex justify-between"><span>Class</span><b>{receipt.classLabel}</b></div><div className="flex justify-between"><span>Invoice</span><b>{receipt.invoiceNumber}</b></div><div className="flex justify-between"><span>Amount</span><b>{formatCurrency(receipt.payment?.amount)}</b></div><div className="flex justify-between"><span>Mode</span><b>{receipt.payment?.mode}</b></div><div className="flex justify-between"><span>Date</span><b>{receipt.payment?.paid_at ? new Date(receipt.payment.paid_at).toLocaleString('en-IN') : '—'}</b></div></div><div className="flex gap-2 mt-5"><button className="btn-primary flex-1 justify-center" onClick={() => window.print()}>🖨️ Print</button><button className="btn-outline flex-1 justify-center" onClick={() => setReceipt(null)}>Done</button></div></div></div>}
  </div>;
}
