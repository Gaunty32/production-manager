import PDFDocument from 'pdfkit';

export type AckLineItem = {
  jobType: string;
  position?: string | null;
  description?: string | null;
  quantity: number;
  unitPrice?: number | null;
};

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
  shippingMethod?: string | null;
  lineItems?: AckLineItem[];
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
const COMPANY_TEL = 'Tel: 0113 246 0000';
const COMPANY_EMAIL = 'info@selectbranding.co.uk';
const COMPANY_WEB = 'www.selectbranding.co.uk';

function shippingLabel(method: string | null | undefined): string {
  if (!method) return '';
  switch (method) {
    case 'free_local':
      return 'Free local delivery — Tim delivers Tuesdays & Fridays before lunchtime';
    case 'customer_collection':
      return 'Customer Collection';
    case 'consolidated':
      return 'Consolidated Back to Customer';
    case 'direct_delivery':
      return 'Direct Delivery';
    default:
      return method;
  }
}

function parseAddressLines(address: string | null): string[] {
  if (!address) return [];
  return address.split(/\r?\n|,\s*/).map(l => l.trim()).filter(Boolean);
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatMoney(n: number): string {
  return '£' + n.toFixed(2);
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

    // ─── Header: "Order Acknowledgement" + company name ─────────────────────
    doc.fontSize(16).font('Helvetica-Bold')
      .text('Order Acknowledgement', margin, margin, { width: contentW, align: 'center' });

    const headerBottom = margin + 20;

    // ─── Company contact info row ────────────────────────────────────────────
    doc.fontSize(8).font('Helvetica').fillColor('#3f3f46')
      .text(
        `${COMPANY_NAME}   ${COMPANY_TEL}   ${COMPANY_EMAIL}   ${COMPANY_WEB}`,
        margin,
        headerBottom + 2,
        { width: contentW, align: 'center' }
      );

    const contactBottom = headerBottom + 16;

    // thin divider
    doc.moveTo(margin, contactBottom).lineTo(margin + contentW, contactBottom).lineWidth(0.5).strokeColor('#aaaaaa').stroke();
    doc.lineWidth(1).strokeColor('#000000');

    // ─── Two-column address block ────────────────────────────────────────────
    const colW = contentW / 2;
    const addrTop = contactBottom + 8;

    // Left: customer address
    const custLines = [data.customerName, ...parseAddressLines(data.deliveryAddress || data.customerAddress)];
    doc.fontSize(9).font('Helvetica').fillColor('#000000');
    custLines.forEach((line, i) => {
      doc.text(line, margin, addrTop + i * 12, { width: colW - 10 });
    });

    // Right: Select Branding address (right-aligned)
    const rightX = margin + colW;
    doc.fontSize(9).font('Helvetica');
    SELECT_ADDRESS.forEach((line, i) => {
      doc.text(line, rightX, addrTop + i * 12, { width: colW, align: 'right' });
    });

    const addrBottom = addrTop + Math.max(custLines.length, SELECT_ADDRESS.length) * 12 + 8;

    // ─── Info row (Order Date | Account No | Required By | Cust PO Ref | Order Ref) ─
    const infoTop = addrBottom + 4;
    const infoRowH = 26;
    const infoCols = [
      { label: 'Order Date', value: formatDate(data.orderDate) },
      { label: 'Account No', value: '—' },
      { label: 'Required By', value: data.requiredDispatchDate ? formatDate(data.requiredDispatchDate) : '—' },
      { label: 'Cust PO Ref', value: data.poNumber || '—' },
      { label: 'Order Ref', value: String(data.orderRef) },
    ];
    const infoColW = contentW / infoCols.length;

    doc.rect(margin, infoTop, contentW, infoRowH).fillColor('#1a3a6b').fill();
    infoCols.forEach((col, i) => {
      const x = margin + i * infoColW;
      doc.fontSize(7).font('Helvetica').fillColor('#cccccc')
        .text(col.label.toUpperCase(), x + 4, infoTop + 3, { width: infoColW - 8 });
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff')
        .text(col.value, x + 4, infoTop + 13, { width: infoColW - 8 });
    });
    doc.fillColor('#000000');

    // ─── Items table ──────────────────────────────────────────────────────────
    const tableTop = infoTop + infoRowH + 6;

    // Column definitions: ITEM | DESCRIPTION/FINISH | QTY | UNIT | TOTAL
    const tCols = [
      { label: 'ITEM', w: 0.30 },
      { label: 'DESCRIPTION / FINISH', w: 0.40 },
      { label: 'QTY', w: 0.08 },
      { label: 'UNIT', w: 0.11 },
      { label: 'TOTAL', w: 0.11 },
    ];
    const tColWidths = tCols.map(c => c.w * contentW);

    // Table header
    const tHeaderH = 16;
    doc.rect(margin, tableTop, contentW, tHeaderH).fillColor('#1a3a6b').fill();
    doc.fillColor('#000000');
    let tX = margin;
    tCols.forEach((col, i) => {
      const align = i >= 2 ? 'right' : 'left';
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff')
        .text(col.label, tX + 4, tableTop + 4, { width: tColWidths[i] - 8, align });
      tX += tColWidths[i];
    });
    doc.fillColor('#000000');

    // Build line items to render
    const lineItems: AckLineItem[] = (data.lineItems && data.lineItems.length > 0)
      ? data.lineItems
      : [{ jobType: 'Embroidery', description: data.jobName, quantity: data.quantity }];

    let currentY = tableTop + tHeaderH;
    let subtotal = 0;

    lineItems.forEach((item, idx) => {
      const isEven = idx % 2 === 0;
      const bgColor = isEven ? '#f9f9f9' : '#ffffff';

      // Build label for ITEM column: jobType + position
      const itemLabel = [
        item.jobType,
        item.position ? `— ${item.position}` : null,
      ].filter(Boolean).join(' ');

      // Description / Finish column
      const descLabel = item.description || '';

      // Calculate estimated row height (need to estimate text height)
      // Use single line height but with padding
      const rowH = 22;

      // Background
      doc.rect(margin, currentY, contentW, rowH).fillColor(bgColor).fill();
      doc.fillColor('#000000');

      // Vertical dividers
      let dvX = margin;
      tColWidths.forEach((w, i) => {
        dvX += w;
        if (i < tColWidths.length - 1) {
          doc.moveTo(dvX, currentY).lineTo(dvX, currentY + rowH)
            .lineWidth(0.3).strokeColor('#cccccc').stroke();
        }
      });
      doc.lineWidth(1).strokeColor('#000000');

      // Bottom border
      doc.moveTo(margin, currentY + rowH).lineTo(margin + contentW, currentY + rowH)
        .lineWidth(0.3).strokeColor('#dddddd').stroke();
      doc.lineWidth(1);

      // Cell content
      const cellY = currentY + 5;
      tX = margin;

      // ITEM
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#18181b')
        .text(itemLabel, tX + 4, cellY, { width: tColWidths[0] - 8, lineBreak: false });
      tX += tColWidths[0];

      // DESCRIPTION / FINISH
      doc.fontSize(8).font('Helvetica').fillColor('#3f3f46')
        .text(descLabel, tX + 4, cellY, { width: tColWidths[1] - 8, lineBreak: false });
      tX += tColWidths[1];

      // QTY
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#18181b')
        .text(String(item.quantity), tX + 4, cellY, { width: tColWidths[2] - 8, align: 'right', lineBreak: false });
      tX += tColWidths[2];

      // UNIT
      const unitStr = item.unitPrice != null ? formatMoney(item.unitPrice) : '';
      doc.fontSize(8).font('Helvetica').fillColor('#18181b')
        .text(unitStr, tX + 4, cellY, { width: tColWidths[3] - 8, align: 'right', lineBreak: false });
      tX += tColWidths[3];

      // TOTAL
      let rowTotal: number | null = null;
      if (item.unitPrice != null) {
        rowTotal = item.quantity * item.unitPrice;
        subtotal += rowTotal;
      }
      const totalStr = rowTotal != null ? formatMoney(rowTotal) : '';
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#18181b')
        .text(totalStr, tX + 4, cellY, { width: tColWidths[4] - 8, align: 'right', lineBreak: false });

      currentY += rowH;
    });

    // Outer table border
    doc.rect(margin, tableTop + tHeaderH, contentW, currentY - tableTop - tHeaderH)
      .lineWidth(0.5).strokeColor('#aaaaaa').stroke();
    doc.lineWidth(1).strokeColor('#000000');

    // ─── Subtotal / VAT / Total footer ──────────────────────────────────────
    const hasPrices = lineItems.some(li => li.unitPrice != null);
    if (hasPrices) {
      const vat = subtotal * 0.2;
      const total = subtotal + vat;
      const summaryRows = [
        { label: 'Subtotal (exc. VAT):', value: formatMoney(subtotal) },
        { label: 'VAT (20%):', value: formatMoney(vat) },
        { label: 'TOTAL (inc. VAT):', value: formatMoney(total), bold: true },
      ];
      const summaryLabelW = 140;
      const summaryValW = 80;
      const summaryX = margin + contentW - summaryLabelW - summaryValW;

      currentY += 6;
      summaryRows.forEach((row) => {
        if (row.bold) {
          doc.rect(summaryX, currentY, summaryLabelW + summaryValW, 18)
            .fillColor('#1a3a6b').fill();
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff')
            .text(row.label, summaryX + 4, currentY + 4, { width: summaryLabelW - 8, align: 'right' });
          doc.text(row.value, summaryX + summaryLabelW + 4, currentY + 4, { width: summaryValW - 8, align: 'right' });
          doc.fillColor('#000000');
          currentY += 18;
        } else {
          doc.fontSize(8.5).font('Helvetica').fillColor('#3f3f46')
            .text(row.label, summaryX + 4, currentY + 3, { width: summaryLabelW - 8, align: 'right' });
          doc.font('Helvetica-Bold').fillColor('#18181b')
            .text(row.value, summaryX + summaryLabelW + 4, currentY + 3, { width: summaryValW - 8, align: 'right' });
          currentY += 16;
        }
      });
    }

    // ─── Notes ───────────────────────────────────────────────────────────────
    if (data.notes) {
      currentY += 8;
      doc.fontSize(8).font('Helvetica-Oblique').fillColor('#555555')
        .text(`Notes: ${data.notes}`, margin, currentY, { width: contentW });
      currentY += 16;
    }

    // ─── Shipping / Collection ───────────────────────────────────────────────
    const shipLabel = shippingLabel(data.shippingMethod);
    if (shipLabel) {
      currentY += 6;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#18181b')
        .text('Shipping / Collection:', margin, currentY, { continued: true })
        .font('Helvetica').fillColor('#3f3f46')
        .text('  ' + shipLabel, { lineBreak: false });
      currentY += 14;
    }

    // ─── Delivery address ─────────────────────────────────────────────────────
    const addrLines = parseAddressLines(data.deliveryAddress || data.customerAddress);
    if (addrLines.length > 0) {
      currentY += 4;
      doc.fontSize(8).font('Helvetica').fillColor('#555555')
        .text('Delivery Address: ', margin, currentY, { continued: true })
        .fillColor('#18181b')
        .text(addrLines.join(', '), { width: contentW - 100, lineBreak: false });
      currentY += 14;
    }

    // ─── Page number ──────────────────────────────────────────────────────────
    doc.fontSize(7).fillColor('#aaaaaa')
      .text('1 of 1', margin, doc.page.height - 30, { width: contentW, align: 'right' });

    doc.end();
  });
}
