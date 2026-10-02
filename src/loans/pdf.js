import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const num = n => Math.round(Number(n || 0)).toLocaleString('en-US');
const day = d => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

// One-page-per-loan statement: terms, installment schedule, payments received.
export function downloadLoanStatement({ loan, schedule, payments, memberName }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 61, 58); doc.rect(0, 0, W, 78, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('Amani SACCO', 40, 38);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  doc.text('Loan statement', 40, 56);
  doc.text(`Generated ${new Date().toLocaleString('en-GB')}`, W - 40, 56, { align: 'right' });

  doc.setTextColor(22, 36, 31); doc.setFontSize(11);
  const left = [
    ['Borrower', memberName || loan.member_name || '-'],
    ['Loan reference', String(loan.loan_id || loan.id).slice(0, 8).toUpperCase()],
    ['Product', loan.product_name || 'Loan'],
    ['Status', (loan.stage || loan.status || '').replace('_', ' ')],
  ];
  const right = [
    ['Amount', `UGX ${num(loan.approved_amount || loan.principal)}`],
    ['Rate', `${loan.interest_rate}% a year, ${loan.interest_method}`],
    ['Term', `${loan.term_months} months`],
    ['Outstanding', `UGX ${num(loan.outstanding_balance)}`],
  ];
  let y = 108;
  left.forEach(([k, v], i) => {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(100); doc.text(k, 40, y + i * 18);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 36, 31); doc.text(String(v), 130, y + i * 18);
  });
  right.forEach(([k, v], i) => {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(100); doc.text(k, 320, y + i * 18);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 36, 31); doc.text(String(v), 400, y + i * 18);
  });

  autoTable(doc, {
    startY: y + 90,
    head: [['#', 'Due date', 'Principal', 'Interest', 'Penalty', 'Paid', 'Status']],
    body: (schedule || []).map(s => [
      s.installment_no, day(s.due_date), num(s.principal_due), num(s.interest_due), num(s.penalty_due),
      num(Number(s.principal_paid) + Number(s.interest_paid) + Number(s.penalty_paid)), s.status,
    ]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [15, 61, 58] },
    alternateRowStyles: { fillColor: [247, 245, 238] },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    didParseCell: d => { if (d.section === 'body' && d.column.index === 6 && d.cell.raw === 'overdue') d.cell.styles.textColor = [180, 69, 61]; },
  });

  if (payments && payments.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 24,
      head: [['Payment date', 'Amount (UGX)']],
      body: payments.map(p => [day(p.created_at), num(p.amount)]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [192, 138, 46] },
      columnStyles: { 1: { halign: 'right' } },
    });
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`Amani SACCO · loan statement · page ${i} of ${pages}`, W / 2, doc.internal.pageSize.getHeight() - 20, { align: 'center' });
  }
  doc.save(`Amani-SACCO-Loan-${String(loan.loan_id || loan.id).slice(0, 8)}.pdf`);
}
