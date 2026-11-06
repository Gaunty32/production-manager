import type { StockingDetails, StockingRecipient } from "@shared/abode";

export function escapeStockingHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function renderStockingDeliveryNote(data: {
  brand: string; logoUrl: string; orderNumber: string; recipient: StockingRecipient;
  items: StockingDetails[];
}): string {
  const e = escapeStockingHtml;
  if (!/^https:\/\//i.test(data.logoUrl) && !/^\/objects\//.test(data.logoUrl)) {
    throw new Error("Add a valid customer logo before printing");
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Delivery note — ${e(data.orderNumber)}</title><style>
body{font:15px system-ui,sans-serif;color:#182d27;margin:0;padding:24px}main{max-width:760px;margin:auto}
header{display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap;border-bottom:2px solid #28634f;padding-bottom:20px}
img{max-width:200px;max-height:90px;object-fit:contain}h1{font-size:26px}address{font-style:normal;white-space:pre-line;line-height:1.6;margin:24px 0}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px 6px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}
th{font-size:12px}td.name{white-space:pre-wrap;font-weight:700}footer{margin-top:28px}@media(max-width:480px){body{padding:16px}th,td{padding:10px 4px;font-size:12px}}@media print{body{padding:0}}
</style></head><body><main><header><img src="${e(data.logoUrl)}" alt="${e(data.brand)}"><div><h1>Delivery note</h1><strong>Order ${e(data.orderNumber)}</strong></div></header>
<address>${e([data.recipient.name, data.recipient.line1, data.recipient.line2, data.recipient.town, data.recipient.county, data.recipient.postcode].filter(Boolean).join("\n"))}</address>
<p>Your personalised Christmas stockings</p><table><thead><tr><th>Name</th><th>Stocking</th><th>Font</th><th>Thread</th><th>Qty</th></tr></thead><tbody>
${data.items.map(item => `<tr><td class="name">${e(item.name)}</td><td>${e(item.colour)}</td><td>${e(item.font)}</td><td>${e(item.thread)}</td><td>1</td></tr>`).join("")}
</tbody></table><footer>Thank you for your order from ${e(data.brand)}.</footer></main></body></html>`;
}

export function renderStockingLabel(label: string, nonce: string): string {
  const safe = label.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shipment label</title>
<style>body{margin:16px;font:16px system-ui}button{padding:12px 20px;margin-bottom:12px}iframe{display:block;width:100%;height:85vh;border:0}@media print{button{display:none}}</style></head><body>
<button id="print">Print label</button><iframe id="label" title="DPD label" sandbox="allow-same-origin allow-modals" srcdoc="${escapeStockingHtml(safe)}"></iframe>
<script nonce="${nonce}">document.getElementById('print').onclick=()=>document.getElementById('label').contentWindow.print();</script></body></html>`;
}
