import { canShareDispatchConfirmation } from "../shared/dispatch-confirmation";
import { createDispatchToken } from "./dispatchConfirmationTokens";

export interface EmailDispatchConfirmation {
  reference: string;
  url: string;
}

type ShareableJob = Parameters<typeof canShareDispatchConfirmation>[0] & {
  id: string;
  poNumber?: string | null;
  jobNumber?: number | null;
  dispatchEmailQueuedAt?: Date | string | null;
};

export function buildEmailDispatchConfirmations(
  jobs: ShareableJob[],
  baseUrl: string,
  secret: string,
): EmailDispatchConfirmation[] {
  // Keep provider retry payloads identical, including consolidated orders whose
  // queue marker was set on only one job in the shipment.
  const queueTimes = jobs.map(job => job.dispatchEmailQueuedAt
    ? new Date(job.dispatchEmailQueuedAt).getTime() : NaN).filter(Number.isFinite);
  const issuedAt = queueTimes.length ? Math.min(...queueTimes) : Date.now();
  return jobs.filter(canShareDispatchConfirmation).map(job => ({
    reference: job.poNumber?.trim() || `Order ${job.jobNumber ?? "reference unavailable"}`,
    url: new URL(`/delivery-update/${createDispatchToken({
      ...job, dhlTrackingNumber: job.dhlTrackingNumber!,
    }, secret, issuedAt)}`, baseUrl).href,
  }));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function renderEmailDispatchConfirmations(links?: EmailDispatchConfirmation[]): string {
  if (!links?.length) return "";
  return `<div style="margin:24px 0;padding:20px;background:#f0f7f3;border:1px solid #d7e6dd;border-radius:10px;">
    <h3 style="margin:0 0 10px;font-size:17px;color:#176b55;">Share with your customer</h3>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3f3f46;">Copy and forward the relevant link below. Each opens a Merox-branded despatch confirmation with a Track your parcel button for DPD Local delivery updates. No planner sign-in is needed.</p>
    ${links.map(link => `<div style="margin:16px 0;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#18181b;">${escapeHtml(link.reference)}</p>
      <a href="${escapeHtml(link.url)}" style="display:inline-block;padding:14px 18px;background:#176b55;color:#ffffff;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">View customer confirmation</a>
      <p style="margin:10px 0 0;font-size:12px;line-height:1.6;word-break:break-all;overflow-wrap:anywhere;"><a href="${escapeHtml(link.url)}" style="color:#176b55;">${escapeHtml(link.url)}</a></p>
    </div>`).join("")}
    <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#71717a;">Share the link rather than this entire email. Anyone with a link can open it; links expire after 90 days.</p>
  </div>`;
}
