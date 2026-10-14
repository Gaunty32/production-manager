import { brandedEmail } from "./emailService";

export interface AwaitingGarmentsEmail {
  to: string[];
  customerName: string;
  firstName: string;
  jobs: Array<{ id: string; number: number | null; name: string; po: string | null; quantity: number; waitingSince: string }>;
}
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));
const dateLabel = (date: string) => new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric",
}).format(new Date(date));

export function buildAwaitingGarmentsReminderEmail(email: AwaitingGarmentsEmail) {
  const subject = "A quick update on garments for your outstanding jobs";
  const intro = "The following jobs have been waiting to be booked into production for at least seven days. This usually means we are still waiting for the garments, although our records may need updating.";
  const action = "Could you please let us know when the garments will arrive? If you have already sent them, please reply with the delivery date or tracking details so we can check and update the jobs.";
  const rows = email.jobs.map(job => `<tr>
    <td style="padding:10px;border-bottom:1px solid #e4e4e7">${escapeHtml(String(job.number ?? "—"))}</td>
    <td style="padding:10px;border-bottom:1px solid #e4e4e7">${escapeHtml(job.name)}</td>
    <td style="padding:10px;border-bottom:1px solid #e4e4e7">${escapeHtml(job.po || "—")}</td>
    <td style="padding:10px;border-bottom:1px solid #e4e4e7">${job.quantity}</td>
    <td style="padding:10px;border-bottom:1px solid #e4e4e7">${dateLabel(job.waitingSince)}</td>
  </tr>`).join("");
  const html = brandedEmail(`
    <h2 style="font-size:20px">Awaiting garments — outstanding jobs</h2>
    <p>Hi ${escapeHtml(email.firstName)},</p><p>${intro}</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e4e4e7">
      <thead><tr style="background:#f4f4f5">
        ${["Job #", "Job", "PO", "Quantity", "Waiting since"].map(label => `<th style="padding:10px;text-align:left">${label}</th>`).join("")}
      </tr></thead><tbody>${rows}</tbody>
    </table>
    <p>${action}</p><p>If these jobs are no longer required, please let us know.</p>
    <p>Kind regards,<br><strong>Select Branding Solutions</strong></p>
  `, { customerName: email.customerName });
  const text = [
    `Hi ${email.firstName},`, "", intro, "",
    ...email.jobs.map(job => `Job ${job.number ?? "—"}: ${job.name} | PO: ${job.po || "—"} | Quantity: ${job.quantity} | Waiting since: ${dateLabel(job.waitingSince)}`),
    "", action, "", "If these jobs are no longer required, please let us know.",
    "", "Kind regards,", "Select Branding Solutions",
  ].join("\n");
  return { subject, html, text };
}
