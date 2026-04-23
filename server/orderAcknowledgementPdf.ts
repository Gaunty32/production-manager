import PDFDocument from 'pdfkit';

export type OrderAcknowledgementData = {
  orderRef: number | string;
  orderDate: Date;
  requiredDispatchDate: Date | null;
  jobName: string;
  quantity: number;
  poNumber: string | null;
  notes: string | null;
  customerName: string;
  customerAddress: string | null;
  deliveryAddress: string | null;
};

const SELECT_ADDRESS = [
  'Spence Mills',
  'Mill Lane',
  'Leeds',
  'West Yorkshire',
  'LS13 3HE',
  'United Kingdom',
];

const COMPANY_NAME = 'Select Branding Solutions Ltd';

function parseAddressLines(address: string | null): string[] {
  if (!address) return [];
  return address.split(/\r?\n|,\s*/).map(l => l.trim()).filter(Boolean);
}

export function generateOrderAcknowledgementPdf(data: OrderAcknowledgementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const margin = 40;
    const contentW = pageW - margin * 2;

    // ─── Header row ───────────────────────────────────────────────────────────
    // "Order Acknowledgement" centred, company name right-aligned
    doc.fontSize(18).font('Helvetica-Bold')
      .text('Order Acknowledgement', margin, margin, { width: contentW, align: 'center' });

    doc.fontSize(10).font('Helvetica-Bold')
      .text(COMPANY_NAME, margin, margin + 2, { width: contentW, align: 'right' });

    const headerBottom = margin + 22;

    // ─── Three-column address block ──────────────────────────────────────────
    const colW = contentW / 3;
    const addrTop = headerBottom + 10;

    // Left: customer address
    const custLines = [data.customerName, ...parseAddressLines(data.deliveryAddress || data.customerAddress)];
    doc.fontSize(9).font('Helvetica');
    custLines.forEach((line, i) => {
      doc.text(line, margin, addrTop + i * 13, { width: colW - 5 });
    });

    // Centre: "SELECT Uniforms" logo text block
    const centreX = margin + colW;
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a4e8a')
      .text('SELECT', centreX, addrTop, { width: colW, align: 'center' });
    doc.fontSize(11).font('Helvetica').fillColor('#1a4e8a')
      .text('Uniforms', centreX, addrTop + 17, { width: colW, align: 'center' });
    doc.fillColor('#000000');

    // Right: Select Branding address
    const rightX = margin + colW * 2;
    doc.fontSize(9).font('Helvetica');
    SELECT_ADDRESS.forEach((line, i) => {
      doc.text(line, rightX, addrTop + i * 13, { width: colW - 5, align: 'right' });
    });

    const addrBottom = addrTop + Math.max(custLines.length, SELECT_ADDRESS.length) * 13 + 10;

    // ─── Info row (Order Date, Account No, Date Required, Cust Ref, Order Ref) ─
    const infoTop = addrBottom + 6;
    const infoRowH = 28;
    const infoCols = [
      { label: 'Order Date', value: formatDate(data.orderDate) },
      { label: 'Account No', value: '' },
      { label: 'Date Required', value: data.requiredDispatchDate ? formatDate(data.requiredDispatchDate) : '' },
      { label: 'Cust Ref', value: data.poNumber || '' },
      { label: 'Order Ref', value: String(data.orderRef) },
    ];
    const infoColW = contentW / infoCols.length;

    // draw outer border
    doc.rect(margin, infoTop, contentW, infoRowH).stroke();
    infoCols.forEach((col, i) => {
      const x = margin + i * infoColW;
      if (i > 0) {
        doc.moveTo(x, infoTop).lineTo(x, infoTop + infoRowH).stroke();
      }
      doc.fontSize(7).font('Helvetica').fillColor('#555555')
        .text(col.label, x + 4, infoTop + 3, { width: infoColW - 8 });
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000')
        .text(col.value, x + 4, infoTop + 13, { width: infoColW - 8 });
    });

    const tableTop = infoTop + infoRowH + 8;

    // ─── Items table ──────────────────────────────────────────────────────────
    const tCols = [
      { label: 'Item', w: 0.12 },
      { label: 'Description', w: 0.45 },
      { label: 'Quantity', w: 0.14 },
      { label: 'Unit Price', w: 0.15 },
      { label: 'Total', w: 0.14 },
    ];

    // Header
    const tColWidths = tCols.map(c => c.w * contentW);
    const tHeaderH = 18;
    doc.rect(margin, tableTop, contentW, tHeaderH).fillAndStroke('#e8e8e8', '#aaaaaa');
    let tX = margin;
    tCols.forEach((col, i) => {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000')
        .text(col.label, tX + 4, tableTop + 4, { width: tColWidths[i] - 8, align: i >= 2 ? 'right' : 'left' });
      tX += tColWidths[i];
    });

    // Single data row
    const rowTop = tableTop + tHeaderH;
    const rowH = 20;
    doc.rect(margin, rowTop, contentW, rowH).stroke('#aaaaaa');
    tX = margin;
    const rowValues = [
      '',
      data.jobName,
      String(data.quantity),
      '',
      '',
    ];
    rowValues.forEach((val, i) => {
      if (i > 0) doc.moveTo(margin + tColWidths.slice(0, i).reduce((a, b) => a + b, 0), rowTop)
        .lineTo(margin + tColWidths.slice(0, i).reduce((a, b) => a + b, 0), rowTop + rowH).stroke('#aaaaaa');
      doc.fontSize(9).font('Helvetica').fillColor('#000000')
        .text(val, tX + 4, rowTop + 4, { width: tColWidths[i] - 8, align: i >= 2 ? 'right' : 'left' });
      tX += tColWidths[i];
    });

    if (data.notes) {
      const notesTop = rowTop + rowH + 4;
      doc.fontSize(8).font('Helvetica-Oblique').fillColor('#555555')
        .text(`Notes: ${data.notes}`, margin, notesTop, { width: contentW });
    }

    // ─── Delivery address note ─────────────────────────────────────────────
    const footerTop = rowTop + rowH + (data.notes ? 30 : 14);
    doc.fontSize(8).font('Helvetica').fillColor('#555555')
      .text('Delivery Address (if applicable):', margin, footerTop)
      .moveDown(0.3)
      .font('Helvetica').fillColor('#000000')
      .text(parseAddressLines(data.deliveryAddress || data.customerAddress).join(', ') || '', { width: contentW / 2 });

    // ─── Page number ──────────────────────────────────────────────────────────
    doc.fontSize(8).fillColor('#555555')
      .text('1 of 1', margin, doc.page.height - 30, { width: contentW, align: 'right' });

    doc.end();
  });
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
