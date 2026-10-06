// Excel and PDF exports for the financial statements.
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const num = n => Math.round(Number(n || 0)).toLocaleString('en-US');

// rows: array of arrays (first row = headings). Money stays numeric in Excel so it can be summed.
export function exportXlsx(filename, sheetName, rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0].map((_, i) => ({ wch: Math.min(48, Math.max(10, ...rows.map(r => String(r[i] ?? '').length + 2))) }));
  XLSX.utils.book_append_sheet(wb, ws, String(sheetName).slice(0, 30));
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx');
}

// head: ['Code','Account','Debit','Credit'], body: array of arrays, foot: optional array of arrays
export function exportPdf({ filename, title, subtitle, head, body, foot, moneyColumns = [] }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 61, 58); doc.rect(0, 0, W, 70, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text('Amani SACCO', 40, 32);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(title, 40, 50);
  doc.setFontSize(9); doc.text(`Generated ${new Date().toLocaleString('en-GB')}`, W - 40, 50, { align: 'right' });
  doc.setTextColor(60);
  if (subtitle) { doc.setFontSize(10); doc.text(subtitle, 40, 92); }
  const money = row => row.map((c, i) => (moneyColumns.includes(i) && c !== '' && c != null && !Number.isNaN(Number(c)) ? num(c) : c));
  autoTable(doc, {
    startY: subtitle ? 104 : 90, head: [head], body: body.map(money), foot: foot ? foot.map(money) : undefined,
    styles: { fontSize: 9, cellPadding: 5 }, headStyles: { fillColor: [15, 61, 58] }, footStyles: { fillColor: [235, 240, 237], textColor: 20, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(moneyColumns.map(i => [i, { halign: 'right' }])),
  });
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`Page ${i} of ${pages}`, W - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
  }
  doc.save(filename.endsWith('.pdf') ? filename : filename + '.pdf');
}
