import { Resend } from 'resend';
import { generateOrderAcknowledgementPdf, type OrderAcknowledgementData } from './orderAcknowledgementPdf';
import { recordEmailSent } from './emailBudget';

let connectionSettings: any;

// Sanitize HTML to prevent injection attacks in emails
function sanitizeHtml(text: string | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getCredentials() {
  if (process.env.RESEND_API_KEY) {
    return {
      apiKey: process.env.RESEND_API_KEY,
      fromEmail: 'info@selectbranding.co.uk'
    };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email};
}

async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail
  };
}

// Reply-to for chat notification emails — replies to this address bounce, so
// customers are steered back to the portal to reply instead of replying by email.
const NO_REPLY_ADDRESS = 'noreply@selectbranding.co.uk';

/** Prominent notice used in chat notification emails so customers reply in the portal. */
function noReplyNotice(): string {
  return `
    <div style="background-color:#fef3c7;border-radius:6px;padding:12px 16px;margin:16px 0;">
      <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">
        Please do not reply to this email — replies are not monitored.
        Use the "View &amp; Reply" button above to respond in your customer portal.
      </p>
    </div>
  `;
}

/** Sends an email via Resend and records it in the daily budget tracker. */
async function sendEmail(
  client: Resend,
  params: Parameters<Resend['emails']['send']>[0],
): ReturnType<Resend['emails']['send']> {
  // Always set replyTo so replies land in a real inbox, not spam
  const enriched = {
    replyTo: 'info@selectbranding.co.uk',
    ...params,
  };
  const result = await client.emails.send(enriched);
  if (!result.error) recordEmailSent();
  return result;
}

function getBaseUrl() {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
  if (process.env.REPLIT_DOMAINS) return `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`;
  return 'http://localhost:5000';
}

// ─── Branded email wrapper ────────────────────────────────────────────────────
// All emails share this shell so branding updates happen in one place.
function brandedEmail(bodyHtml: string, opts?: { customerLogoUrl?: string | null; customerName?: string | null; noReply?: boolean }): string {
  const sbLogoUrl = `${getBaseUrl()}/logo.png`;
  const customerLogo = opts?.customerLogoUrl;
  const customerName = opts?.customerName ?? 'Customer';

  const headerContent = customerLogo
    ? `<!-- Dual-logo header: SB logo + customer logo side by side -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td width="44%" align="right" style="padding-right:12px;vertical-align:middle;">
            <img src="${sbLogoUrl}" alt="Select Branding Solutions" height="52" style="max-height:52px;max-width:160px;height:auto;display:inline-block;" />
          </td>
          <td width="12%" align="center" style="vertical-align:middle;">
            <span style="font-size:18px;color:#d4d4d8;font-weight:300;">&times;</span>
          </td>
          <td width="44%" align="left" style="padding-left:12px;vertical-align:middle;">
            <img src="${customerLogo}" alt="${customerName}" height="52" style="max-height:52px;max-width:160px;height:auto;display:inline-block;" />
          </td>
        </tr>
      </table>`
    : `<img src="${sbLogoUrl}" alt="Select Branding Solutions" width="220" style="max-width:220px;height:auto;display:block;margin:0 auto;" />`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background-color:#ffffff;border-radius:8px 8px 0 0;padding:28px 40px;text-align:center;border-bottom:1px solid #e4e4e7;">
              ${headerContent}
            </td>
          </tr>

          <!-- Accent bar -->
          <tr>
            <td style="background-color:#4f46e5;height:4px;line-height:4px;font-size:0;">&nbsp;</td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:36px 40px;border-radius:0;color:#18181b;line-height:1.65;font-size:15px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f4f4f5;border-top:1px solid #e4e4e7;border-radius:0 0 8px 8px;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#3f3f46;">Select Branding Solutions Ltd</p>
              <p style="margin:0;font-size:12px;color:#71717a;">
                <a href="mailto:info@selectbranding.co.uk" style="color:#4f46e5;text-decoration:none;">info@selectbranding.co.uk</a>
              </p>
              <p style="margin:12px 0 0;font-size:11px;color:#a1a1aa;">
                ${opts?.noReply
                  ? 'This is an automated notification — please do not reply to this email. To respond, use your customer portal.'
                  : 'You can reply to this email and it will reach our team at <a href="mailto:info@selectbranding.co.uk" style="color:#4f46e5;text-decoration:none;">info@selectbranding.co.uk</a>.'}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Button helper ────────────────────────────────────────────────────────────
function ctaButton(url: string, label: string): string {
  return `
    <div style="text-align:center;margin:32px 0;">
      <a href="${url}"
         style="display:inline-block;background-color:#4f46e5;color:#ffffff;font-size:15px;font-weight:600;
                padding:14px 32px;border-radius:6px;text-decoration:none;letter-spacing:0.2px;">
        ${label}
      </a>
    </div>`;
}

// ─── Info table helper ────────────────────────────────────────────────────────
function infoTable(rows: { label: string; value: string }[]): string {
  const rowsHtml = rows.map(r => `
    <tr>
      <td style="padding:8px 12px;color:#71717a;font-size:13px;white-space:nowrap;width:160px;">${r.label}</td>
      <td style="padding:8px 12px;color:#18181b;font-size:13px;font-weight:600;">${r.value}</td>
    </tr>`).join('');
  return `
    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e4e4e7;border-radius:6px;border-collapse:collapse;margin:20px 0;">
      ${rowsHtml}
    </table>`;
}

// ─── Divider ──────────────────────────────────────────────────────────────────
const divider = `<hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;" />`;

// ─── Small muted text ─────────────────────────────────────────────────────────
function muted(text: string): string {
  return `<p style="color:#71717a;font-size:13px;margin:8px 0;">${text}</p>`;
}

// =============================================================================
// Email senders
// =============================================================================

export async function sendNewLogoSetupEmail(params: {
  customerName: string;
  jobName: string;
}) {
  const { client, fromEmail } = await getUncachableResendClient();
  const safeCustomerName = sanitizeHtml(params.customerName);
  const safeJobName = sanitizeHtml(params.jobName);
  const viewUrl = `${getBaseUrl()}/holding-area`;

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">Digitising Required</h2>
    <p style="margin:0 0 12px;">A customer has submitted a new job and indicated that it requires <strong>digitising</strong> (new logo setup).</p>
    ${infoTable([
      { label: 'Customer', value: safeCustomerName },
      { label: 'Job Name', value: safeJobName },
      { label: 'Charge', value: '£12.00' },
      { label: 'Lead Time', value: '48 hours for sample' },
    ])}
    ${ctaButton(viewUrl, 'View in Holding Area')}
    ${muted('Please set up the logo and send a sample to the customer before this job enters production.')}
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: ['chris@selectuniforms.co.uk', 'james@selectuniforms.co.uk'],
    subject: `Digitising Required: ${safeJobName} (${safeCustomerName})`,
    html: brandedEmail(body),
  });

  if (error) {
    console.error('Failed to send new logo setup email:', error);
  }
}

export async function sendNewPrintJobEmail(params: {
  customerName: string;
  jobName: string;
  jobId: string;
}) {
  const { client, fromEmail } = await getUncachableResendClient();
  const safeCustomerName = sanitizeHtml(params.customerName);
  const safeJobName = sanitizeHtml(params.jobName);
  const viewUrl = `${getBaseUrl()}/jobs/${params.jobId}`;

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">New Print Job Added</h2>
    <p style="margin:0 0 12px;">A job has been added with a <strong>Print</strong> line item.</p>
    ${infoTable([
      { label: 'Customer', value: safeCustomerName },
      { label: 'Job Name', value: safeJobName },
    ])}
    ${ctaButton(viewUrl, 'View Job')}
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: ['chris@selectbranding.co.uk'],
    subject: `New Print Job: ${safeJobName} (${safeCustomerName})`,
    html: brandedEmail(body),
  });

  if (error) {
    console.error('Failed to send new print job email:', error);
  }
}

export async function sendPasswordResetEmail(email: string, resetToken: string) {
  const { client, fromEmail } = await getUncachableResendClient();
  const resetUrl = `${getBaseUrl()}/reset-password?token=${resetToken}`;

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">Password Reset Request</h2>
    <p style="margin:0 0 12px;">You requested to reset your password for the Production Manager.</p>
    <p style="margin:0 0 4px;">Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
    ${ctaButton(resetUrl, 'Reset Password')}
    ${divider}
    ${muted("If you didn't request a password reset, you can safely ignore this email.")}
    ${muted(`Or paste this link into your browser: <a href="${resetUrl}" style="color:#4f46e5;">${resetUrl}</a>`)}
  `;

  const { data, error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: email,
    subject: 'Password Reset Request – Production Manager',
    html: brandedEmail(body),
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
  return data;
}

export async function sendStaffAppInviteEmail(params: {
  to: string;
  staffName: string;
  inviterName: string;
  setPasswordUrl: string;
  appUrl: string;
  isExistingUser: boolean;
}) {
  const { client, fromEmail } = await getUncachableResendClient();
  const firstName = sanitizeHtml(params.staffName.split(" ")[0]);
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">Welcome to the Select Branding staff app</h2>
    <p style="margin:0 0 12px;">Hi ${firstName},</p>
    <p style="margin:0 0 12px;">${sanitizeHtml(params.inviterName)} has set you up on our Production Manager — the app we use to run jobs, holidays and shifts. From your phone you can:</p>
    <ul style="margin:0 0 16px;padding-left:20px;color:#18181b;">
      <li style="margin-bottom:6px;"><strong>See the jobs</strong> in production and which ones are allocated to you</li>
      <li style="margin-bottom:6px;"><strong>Mark your own jobs complete</strong> as you finish them</li>
      <li style="margin-bottom:6px;"><strong>Book holidays</strong> — requests with 7+ days notice are approved automatically when cover is available</li>
      <li style="margin-bottom:6px;"><strong>Check your holiday allowance</strong> and see what you have left</li>
    </ul>
    <p style="margin:0 0 4px;"><strong>Step 1 — Set your password</strong>${params.isExistingUser ? " (or reset it if you already have one)" : ""}:</p>
    ${ctaButton(params.setPasswordUrl, 'Set My Password')}
    <p style="margin:16px 0 4px;"><strong>Step 2 — Add the app to your phone's home screen:</strong></p>
    <ol style="margin:0 0 16px;padding-left:20px;color:#18181b;">
      <li style="margin-bottom:6px;">Open <a href="${params.appUrl}" style="color:#4f46e5;">${params.appUrl}</a> on your phone</li>
      <li style="margin-bottom:6px;">On iPhone: tap the Share button, then <strong>Add to Home Screen</strong></li>
      <li style="margin-bottom:6px;">On Android: tap the browser menu (three dots), then <strong>Add to Home screen</strong></li>
      <li>It will then work just like a normal app</li>
    </ol>
    <p style="margin:0 0 12px;">Sign in with this email address (<strong>${sanitizeHtml(params.to)}</strong>) and the password you set.</p>
    ${divider}
    ${muted('The password link expires in 72 hours — if it runs out, use "Forgot password" on the sign-in page or ask a manager to resend this invite.')}
  `;

  const { data, error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: params.to,
    subject: 'Your Select Branding staff app — set up in 2 minutes',
    html: brandedEmail(body),
  });
  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
  return data;
}

export async function sendHolidayRequestNotificationEmail(params: {
  to: string;
  staffName: string;
  startDate: string;
  endDate: string;
  days: number;
  autoApproved: boolean;
  reason?: string;
}) {
  const { client, fromEmail } = await getUncachableResendClient();
  const range = params.startDate === params.endDate ? params.startDate : `${params.startDate} to ${params.endDate}`;
  const body = params.autoApproved
    ? `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">Holiday auto-approved</h2>
    <p style="margin:0 0 12px;"><strong>${sanitizeHtml(params.staffName)}</strong> booked <strong>${params.days} day${params.days === 1 ? "" : "s"}</strong> off (${sanitizeHtml(range)}).</p>
    <p style="margin:0 0 12px;">This was approved automatically: at least 7 days notice was given and no more than one other person is off at the same time.</p>
    ${ctaButton(`${getBaseUrl()}/holidays`, 'View Holidays')}
    ${divider}
    ${muted('No action is needed — this is for your information.')}
  `
    : `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">Holiday request needs approval</h2>
    <p style="margin:0 0 12px;"><strong>${sanitizeHtml(params.staffName)}</strong> requested <strong>${params.days} day${params.days === 1 ? "" : "s"}</strong> off (${sanitizeHtml(range)}).</p>
    ${params.reason ? `<p style="margin:0 0 12px;">It could not be approved automatically: ${sanitizeHtml(params.reason)}.</p>` : ""}
    ${ctaButton(`${getBaseUrl()}/holidays`, 'Review Request')}
  `;

  const { data, error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: params.to,
    subject: params.autoApproved
      ? `Holiday auto-approved: ${params.staffName} (${range})`
      : `Holiday request from ${params.staffName} needs approval`,
    html: brandedEmail(body),
  });
  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
  return data;
}

export async function sendLoginCodeEmail(email: string, code: string) {
  const { client, fromEmail } = await getUncachableResendClient();

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">Your sign-in code</h2>
    <p style="margin:0 0 12px;">Use the code below to sign in to the Production Manager. It expires in <strong>10 minutes</strong>.</p>
    <div style="margin:24px 0;text-align:center;">
      <span style="display:inline-block;font-size:34px;font-weight:700;letter-spacing:10px;color:#18181b;background:#f4f4f5;border-radius:8px;padding:16px 28px;">${code}</span>
    </div>
    ${divider}
    ${muted("If you didn't try to sign in, you can safely ignore this email — no one can access your account without this code.")}
  `;

  const { data, error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: email,
    subject: `${code} is your sign-in code – Production Manager`,
    html: brandedEmail(body),
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
  return data;
}

export async function sendNewJobSubmissionEmail(
  staffEmails: string[],
  jobDetails: {
    jobName: string;
    customerName: string;
    quantity: number;
    poNumber: string | null;
    requiredDispatchDate: string;
    jobId: string;
  }
) {
  const { client, fromEmail } = await getUncachableResendClient();
  const viewUrl = `${getBaseUrl()}/holding-area`;

  const safeJobName = sanitizeHtml(jobDetails.jobName);
  const safeCustomerName = sanitizeHtml(jobDetails.customerName);
  const safePONumber = sanitizeHtml(jobDetails.poNumber);
  const safeDispatchDate = sanitizeHtml(jobDetails.requiredDispatchDate);

  const tableRows = [
    { label: 'Job Name', value: safeJobName },
    { label: 'Customer', value: safeCustomerName },
    { label: 'Quantity', value: `${jobDetails.quantity} garments` },
    ...(safePONumber ? [{ label: 'PO Number', value: safePONumber }] : []),
    { label: 'Required Dispatch', value: safeDispatchDate },
  ];

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">New Job Submission Received</h2>
    <p style="margin:0 0 12px;">A new job has been submitted by <strong>${safeCustomerName}</strong> and requires your review.</p>
    ${infoTable(tableRows)}
    ${ctaButton(viewUrl, 'Review in Holding Area')}
    ${muted('Please review and approve or reject this job within 24 hours.')}
  `;

  const { data, error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: staffEmails,
    subject: `New Job Submission: ${safeJobName}`,
    html: brandedEmail(body),
  });

  if (error) {
    console.error('Failed to send new job submission email:', error);
  }
  return data;
}

export async function sendJobApprovedEmail(
  customerEmail: string,
  jobDetails: {
    jobName: string;
    customerName: string;
    jobId: string;
    jobNumber?: number | null;
    quantity?: number;
    poNumber?: string | null;
    notes?: string | null;
    requiredDispatchDate?: Date | null;
    customerAddress?: string | null;
    deliveryAddress?: string | null;
    orderDate?: Date;
    stripePaymentLink?: string | null;
    creditAccount?: boolean;
    shippingMethod?: string | null;
    lineItems?: Array<{ jobType: string; position?: string | null; description?: string | null; quantity: number; unitPrice?: number | null }>;
  }
) {
  const { client, fromEmail } = await getUncachableResendClient();
  const orderRef = jobDetails.jobNumber || jobDetails.jobId.slice(0, 8).toUpperCase();

  let pdfAttachment: { filename: string; content: string } | undefined;
  try {
    const pdfData: OrderAcknowledgementData = {
      orderRef,
      orderDate: jobDetails.orderDate || new Date(),
      requiredDispatchDate: jobDetails.requiredDispatchDate || null,
      jobName: jobDetails.jobName,
      quantity: jobDetails.quantity || 0,
      poNumber: jobDetails.poNumber || null,
      notes: jobDetails.notes || null,
      customerName: jobDetails.customerName,
      customerAddress: jobDetails.customerAddress || null,
      deliveryAddress: jobDetails.deliveryAddress || null,
      shippingMethod: jobDetails.shippingMethod || null,
      lineItems: jobDetails.lineItems || [],
    };
    const pdfBuffer = await generateOrderAcknowledgementPdf(pdfData);
    pdfAttachment = {
      filename: `Order-Acknowledgement-${orderRef}.pdf`,
      content: pdfBuffer.toString('base64'),
    };
  } catch (pdfError) {
    console.error('Failed to generate order acknowledgement PDF:', pdfError);
  }

  const effectiveStripeLink = jobDetails.stripePaymentLink || "https://buy.stripe.com/bIY16peJJ5j99Us144";
  const isCreditAccount = jobDetails.creditAccount !== false;

  const paymentBlock = isCreditAccount
    ? `
      <p style="margin:0 0 12px;">You can make payment by BACS or by card using the details below. <strong>Our bank details have recently been updated.</strong></p>
      <div style="background-color:#f4f4f5;border-radius:6px;padding:20px 24px;margin:20px 0;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#18181b;">Payment by card:</p>
        <p style="margin:0 0 12px;">
          <a href="${effectiveStripeLink}" style="color:#4f46e5;">${effectiveStripeLink}</a>
        </p>
        <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#18181b;">Payment by BACS:</p>
        <p style="margin:0 0 2px;font-size:14px;color:#3f3f46;">Select Branding Solutions Ltd</p>
        <p style="margin:0 0 2px;font-size:14px;color:#3f3f46;">Sort code: 04-06-05</p>
        <p style="margin:0;font-size:14px;color:#3f3f46;">Account: 30422879</p>
      </div>`
    : `
      <p style="margin:0 0 12px;">To confirm your order, please complete payment using the secure link below.</p>
      <div style="background-color:#f4f4f5;border-radius:6px;padding:20px 24px;margin:20px 0;text-align:center;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#18181b;">Pay securely by card:</p>
        <a href="${effectiveStripeLink}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:15px;margin-top:4px;">Pay Now</a>
        <p style="margin:12px 0 0;font-size:12px;color:#71717a;">Or copy this link: <a href="${effectiveStripeLink}" style="color:#4f46e5;">${effectiveStripeLink}</a></p>
      </div>`;

  const body = `
    <p style="margin:0 0 12px;">Thank you for your order.</p>
    <p style="margin:0 0 12px;">Please find your order acknowledgement attached. Kindly check it meets your requirements — it's important you verify garments, colours, sizes, quantities, and finishes to be applied.</p>
    ${paymentBlock}
    ${divider}
    <p style="margin:0 0 2px;">Regards,</p>
    <p style="margin:0;font-weight:600;">Select Branding Solutions</p>
  `;

  const { data, error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: customerEmail,
    subject: `Order Acknowledgement – New Bank Details – Ref: ${orderRef}`,
    html: brandedEmail(body),
    ...(pdfAttachment ? { attachments: [pdfAttachment] } : {}),
  });

  if (error) {
    console.error('Failed to send job approved email:', error);
  }
  return data;
}

export async function sendJobRejectedEmail(
  customerEmail: string,
  jobDetails: {
    jobName: string;
    customerName: string;
    jobId: string;
    rejectionReason: string | null;
    rejectionMessage: string | null;
  }
) {
  const { client, fromEmail } = await getUncachableResendClient();
  const viewUrl = `${getBaseUrl()}/customer/job/${jobDetails.jobId}`;

  const safeJobName = sanitizeHtml(jobDetails.jobName);
  const safeRejectionReason = sanitizeHtml(jobDetails.rejectionReason);
  const safeRejectionMessage = sanitizeHtml(jobDetails.rejectionMessage);

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">Job Requires Updates</h2>
    <p style="margin:0 0 12px;">Your job <strong>${safeJobName}</strong> requires some updates before we can proceed.</p>

    ${safeRejectionReason ? `
    <div style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px 20px;margin:16px 0;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:0.5px;">Reason</p>
      <p style="margin:0;color:#18181b;">${safeRejectionReason}</p>
    </div>` : ''}

    ${safeRejectionMessage ? `
    <div style="background-color:#f4f4f5;border-radius:6px;padding:16px 20px;margin:16px 0;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#3f3f46;text-transform:uppercase;letter-spacing:0.5px;">Message from our team</p>
      <p style="margin:0;color:#18181b;">${safeRejectionMessage}</p>
    </div>` : ''}

    ${ctaButton(viewUrl, 'View Job &amp; Respond')}
    ${muted('Please use the chat feature in the job details page to discuss any questions or submit a revised order.')}
  `;

  const { data, error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: customerEmail,
    subject: `Job Update Required: ${safeJobName}`,
    html: brandedEmail(body),
  });

  if (error) {
    console.error('Failed to send job rejected email:', error);
  }
  return data;
}

export async function sendStaffMessageToCustomerEmail(
  customerEmail: string,
  details: {
    staffName: string;
    jobName: string;
    message: string;
    jobId: string;
  }
) {
  const { client, fromEmail } = await getUncachableResendClient();
  const viewUrl = `${getBaseUrl()}/customer/job/${details.jobId}`;
  const safeJobName = sanitizeHtml(details.jobName);
  const safeStaffName = sanitizeHtml(details.staffName);
  const safeMessage = sanitizeHtml(details.message);

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">New Message from Select Branding</h2>
    <p style="margin:0 0 12px;"><strong>${safeStaffName}</strong> has sent you a message about your order <strong>${safeJobName}</strong>:</p>
    <div style="background-color:#f4f4f5;border-left:4px solid #4f46e5;border-radius:0 6px 6px 0;padding:16px 20px;margin:16px 0;">
      <p style="margin:0;color:#18181b;white-space:pre-line;">${safeMessage}</p>
    </div>
    ${ctaButton(viewUrl, 'View &amp; Reply')}
    ${noReplyNotice()}
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: customerEmail,
    subject: `New message about your order: ${safeJobName}`,
    html: brandedEmail(body, { noReply: true }),
    replyTo: NO_REPLY_ADDRESS,
  });

  if (error) {
    console.error('Failed to send staff message notification to customer:', error);
  }
}

export async function sendTeamInviteEmail(
  email: string,
  details: {
    firstName: string | null;
    inviterName: string;
    companyName: string;
    inviteUrl: string;
    isReset: boolean;
  }
) {
  const { client, fromEmail } = await getUncachableResendClient();
  const safeName = sanitizeHtml(details.firstName);
  const safeInviter = sanitizeHtml(details.inviterName);
  const safeCompany = sanitizeHtml(details.companyName);

  const greeting = safeName ? `Hi ${safeName},` : 'Hello,';
  const action = details.isReset ? 'reset your password' : 'set up your password';
  const subject = details.isReset
    ? `Reset your ${safeCompany} portal password`
    : `You've been invited to the ${safeCompany} customer portal`;

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">
      ${details.isReset ? 'Password Reset' : 'Welcome to the Customer Portal'}
    </h2>
    <p style="margin:0 0 12px;">${greeting}</p>
    ${details.isReset
      ? `<p style="margin:0 0 12px;"><strong>Select Branding</strong> has requested a password reset for your <strong>${safeCompany}</strong> customer portal account.</p>`
      : `<p style="margin:0 0 12px;"><strong>Select Branding</strong> has invited you to access the <strong>${safeCompany}</strong> customer portal.</p>`
    }
    <p style="margin:0 0 4px;">Click the button below to ${action}. This link will expire in <strong>48 hours</strong>.</p>
    ${ctaButton(details.inviteUrl, details.isReset ? 'Reset Password' : 'Accept Invitation')}
    ${divider}
    ${muted("If you weren't expecting this email, you can safely ignore it.")}
    <p style="margin:8px 0 0;">Regards,<br/><strong>Select Branding Solutions</strong></p>
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: email,
    ...(details.isReset ? {} : { cc: ['chris@selectbranding.co.uk', 'james@selectbranding.co.uk'] }),
    subject,
    html: brandedEmail(body),
  });

  if (error) {
    console.error('Failed to send team invite email:', error);
  }
}

export async function sendNewChatEmail(
  customerEmails: string[],
  details: {
    staffName: string;
    subject: string;
    firstMessage: string;
    portalUrl: string;
    isJobChat: boolean;
    jobName?: string;
  }
) {
  if (!customerEmails.length) return;
  const { client, fromEmail } = await getUncachableResendClient();
  const safeStaffName = sanitizeHtml(details.staffName);
  const safeSubject = sanitizeHtml(details.subject);
  const safeMessage = sanitizeHtml(details.firstMessage);
  const safeJobName = sanitizeHtml(details.jobName ?? null);

  const emailSubject = details.isJobChat
    ? `New message about your order: ${safeJobName || safeSubject}`
    : `New message from Select Branding: ${safeSubject}`;

  const contextLine = details.isJobChat
    ? `<strong>${safeStaffName}</strong> has started a conversation about your order <strong>${safeJobName || safeSubject}</strong>:`
    : `<strong>${safeStaffName}</strong> has sent you a new message:`;

  const messagesUrl = `${getBaseUrl()}/customer/messages`;
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">New Message from Select Branding</h2>
    <p style="margin:0 0 12px;">${contextLine}</p>
    <div style="background-color:#f4f4f5;border-left:4px solid #4f46e5;border-radius:0 6px 6px 0;padding:16px 20px;margin:16px 0;">
      <p style="margin:0;color:#18181b;white-space:pre-line;">${safeMessage}</p>
    </div>
    ${ctaButton(details.portalUrl, 'View &amp; Reply')}
    ${noReplyNotice()}
    ${divider}
    <p style="color:#71717a;font-size:13px;margin:8px 0;">
      You can reply directly from your customer portal. If you have any questions, please don't hesitate to get in touch.
    </p>
    <p style="color:#71717a;font-size:13px;margin:16px 0 4px;">
      <strong style="color:#52525b;">Managing email notifications:</strong> You are receiving this email because message notifications are turned on for your account.
      To turn them off — or back on — open your
      <a href="${messagesUrl}" style="color:#4f46e5;text-decoration:underline;">Messages page</a>
      in the customer portal, then click the <strong>bell icon</strong> in the top-right corner of the page and toggle
      <em>Email me when a new message arrives</em>.
    </p>
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: customerEmails,
    subject: emailSubject,
    html: brandedEmail(body, { noReply: true }),
    replyTo: NO_REPLY_ADDRESS,
  });

  if (error) {
    console.error('Failed to send new chat notification email:', error);
  }
}

export async function sendStaffMessageCCEmail(
  ccEmails: string[],
  details: {
    senderName: string;
    jobName: string;
    customerName: string;
    message: string;
    jobId: string;
  }
) {
  if (!ccEmails.length) return;
  const { client, fromEmail } = await getUncachableResendClient();
  const viewUrl = `${getBaseUrl()}/staff/job/${details.jobId}`;
  const safeJobName = sanitizeHtml(details.jobName);
  const safeSenderName = sanitizeHtml(details.senderName);
  const safeCustomerName = sanitizeHtml(details.customerName);
  const safeMessage = sanitizeHtml(details.message);

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">You were CC'd on a customer message</h2>
    <p style="margin:0 0 12px;"><strong>${safeSenderName}</strong> sent the following message to <strong>${safeCustomerName}</strong> about job <strong>${safeJobName}</strong>:</p>
    <div style="background-color:#f4f4f5;border-left:4px solid #4f46e5;border-radius:0 6px 6px 0;padding:16px 20px;margin:16px 0;">
      <p style="margin:0;color:#18181b;white-space:pre-line;">${safeMessage}</p>
    </div>
    ${ctaButton(viewUrl, 'View Job')}
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: ccEmails,
    subject: `[CC] Message to ${safeCustomerName} re: ${safeJobName}`,
    html: brandedEmail(body),
  });

  if (error) {
    console.error('Failed to send CC email to staff:', error);
  }
}

// ─── Customer-to-staff new message notification ────────────────────────────────
export async function sendCustomerMessageNotificationEmail(
  staffEmails: string[],
  details: {
    customerName: string;
    jobName: string;
    jobId: string;
    message: string;
  }
): Promise<void> {
  if (!staffEmails.length) return;
  const { client, fromEmail } = await getUncachableResendClient();

  const viewUrl = `${getBaseUrl()}/staff/job/${details.jobId}`;
  const safeName = sanitizeHtml(details.customerName);
  const safeJob = sanitizeHtml(details.jobName);
  const safeMsg = sanitizeHtml(details.message);

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">New Message from a Customer</h2>
    <p style="margin:0 0 12px;"><strong>${safeName}</strong> has replied on order <strong>${safeJob}</strong>:</p>
    <div style="background-color:#f4f4f5;border-left:4px solid #4f46e5;border-radius:0 6px 6px 0;padding:16px 20px;margin:16px 0;">
      <p style="margin:0;color:#18181b;white-space:pre-line;">${safeMsg}</p>
    </div>
    ${ctaButton(viewUrl, 'View &amp; Reply')}
    ${muted('You are receiving this because you have email notifications enabled. You can turn them off in your profile on the Messages page.')}
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: staffEmails,
    subject: `New customer message — ${details.jobName}`,
    html: brandedEmail(body),
  });

  if (error) {
    console.error('Failed to send customer message notification email:', error);
  }
}

// ─── Customer direct message → notify staff ───────────────────────────────────
export async function sendCustomerDirectMessageNotificationEmail(
  staffEmails: string[],
  details: {
    customerName: string;
    subject: string;
    message: string;
  }
): Promise<void> {
  if (!staffEmails.length) return;
  const { client, fromEmail } = await getUncachableResendClient();

  const viewUrl = `${getBaseUrl()}/messages`;
  const safeName = sanitizeHtml(details.customerName);
  const safeSubject = sanitizeHtml(details.subject);
  const safeMsg = sanitizeHtml(details.message);

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">New Direct Message from a Customer</h2>
    <p style="margin:0 0 12px;"><strong>${safeName}</strong> sent a message in <strong>${safeSubject}</strong>:</p>
    <div style="background-color:#f4f4f5;border-left:4px solid #4f46e5;border-radius:0 6px 6px 0;padding:16px 20px;margin:16px 0;">
      <p style="margin:0;color:#18181b;white-space:pre-line;">${safeMsg}</p>
    </div>
    ${ctaButton(viewUrl, 'View &amp; Reply')}
    ${muted('You are receiving this because you have email notifications enabled. You can turn them off in your profile on the Messages page.')}
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: staffEmails,
    subject: `New message from ${safeName} — ${safeSubject}`,
    html: brandedEmail(body),
  });

  if (error) {
    console.error('Failed to send customer direct message notification email:', error);
  }
}

// ─── Re-engagement email ───────────────────────────────────────────────────────
// =============================================================================
// Demo access request email
// =============================================================================

export async function sendDemoAccessEmail(params: {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  portalUrl: string;
}): Promise<void> {
  const { client, fromEmail } = await getUncachableResendClient();

  const safeName = sanitizeHtml(`${params.firstName} ${params.lastName}`.trim());
  const safeFirst = sanitizeHtml(params.firstName);
  const safeCompany = sanitizeHtml(params.company);

  const companyLine = safeCompany
    ? `<p style="margin:0 0 18px;color:#71717a;font-size:13px;">Requested by: ${safeName}${safeCompany ? ` &mdash; ${safeCompany}` : ''}</p>`
    : '';

  const body = `
    <p style="margin:0 0 18px;">Hi ${safeFirst},</p>
    <p style="margin:0 0 18px;">
      Thanks for your interest in the <strong>Select Branding Production System</strong>!
      We've put together an interactive demo of our customer portal so you can see exactly
      what your team would experience day-to-day.
    </p>
    <p style="margin:0 0 18px;">
      The demo includes a live order tracker, job messaging, invoice history, team management,
      and more — no login required, just click the button below to explore.
    </p>
    ${ctaButton(params.portalUrl, 'Explore the Customer Portal')}
    <p style="margin:0 0 18px;">
      Someone from our team will also be in touch shortly to arrange a guided walkthrough
      of the full system. If you have any questions in the meantime, just reply to this email.
    </p>
    <p style="margin:0 0 8px;">
      Best wishes,<br />
      <strong>The Select Branding Solutions Team</strong>
    </p>
    ${companyLine}
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: params.email,
    cc: ['chris@selectbranding.co.uk', 'james@selectuniforms.co.uk'],
    subject: `Your demo access to the Select Branding Production System`,
    html: brandedEmail(body),
  });

  if (error) {
    throw new Error(`Failed to send demo access email to ${params.email}: ${JSON.stringify(error)}`);
  }
}

// Strip CR/LF and control characters so user input can never inject email headers
function cleanHeader(text: string): string {
  return text.replace(/[\r\n\x00-\x1f\x7f]/g, ' ').trim();
}

export async function sendWebsiteEnquiryEmails(params: {
  name: string;
  company: string;
  email: string;
  phone: string;
  service: string;
  message: string;
  demoUrl: string;
}): Promise<void> {
  const { client, fromEmail } = await getUncachableResendClient();
  const from = fromEmail || 'info@selectbranding.co.uk';

  const safeName = sanitizeHtml(params.name);
  const safeFirst = sanitizeHtml(params.name.split(' ')[0] || params.name);
  const safeMessage = sanitizeHtml(params.message);

  // 1. Internal notification to the sales inbox
  const internalBody = `
    <h2 style="margin:0 0 18px;font-size:18px;color:#18181b;">New website enquiry</h2>
    ${infoTable([
      { label: 'Name', value: safeName },
      { label: 'Company', value: sanitizeHtml(params.company) || '—' },
      { label: 'Email', value: sanitizeHtml(params.email) },
      { label: 'Phone', value: sanitizeHtml(params.phone) || '—' },
      { label: 'Interested in', value: sanitizeHtml(params.service) || '—' },
    ])}
    ${params.message ? `<p style="margin:0 0 8px;font-weight:600;">Message:</p><p style="margin:0 0 18px;white-space:pre-wrap;">${safeMessage}</p>` : ''}
    ${muted('This lead has also been added to HighLevel with the tag "website-enquiry".')}
  `;
  const internal = await sendEmail(client, {
    from,
    to: 'info@selectbranding.co.uk',
    replyTo: params.email,
    subject: `Website enquiry — ${cleanHeader(params.name)}${params.company ? ` (${cleanHeader(params.company)})` : ''}`,
    html: brandedEmail(internalBody),
  });
  if (internal.error) {
    throw new Error(`Failed to send enquiry notification: ${JSON.stringify(internal.error)}`);
  }

  // 2. Confirmation to the prospect (best-effort — don't fail the request if this bounces)
  const confirmBody = `
    <p style="margin:0 0 18px;">Hi ${safeFirst},</p>
    <p style="margin:0 0 18px;">
      Thanks for getting in touch with <strong>Select Branding Solutions</strong> — we've received
      your enquiry and one of the team will come back to you shortly, usually the same working day.
    </p>
    <p style="margin:0 0 18px;">
      In the meantime, you can explore a live demo of our customer portal — the same order tracking,
      messaging and invoicing system our customers use every day.
    </p>
    ${ctaButton(params.demoUrl, 'Explore the Customer Portal')}
    <p style="margin:0 0 8px;">
      Best wishes,<br />
      <strong>The Select Branding Solutions Team</strong>
    </p>
  `;
  const confirm = await sendEmail(client, {
    from,
    to: params.email,
    subject: 'Thanks for your enquiry — Select Branding Solutions',
    html: brandedEmail(confirmBody),
  });
  if (confirm.error) {
    console.error('[Enquiry] Confirmation email failed:', JSON.stringify(confirm.error));
  }
}

export async function sendReEngagementEmail(customer: {
  name: string;
  email: string;
  contactFirstName?: string | null;
  logoUrl?: string | null;
}): Promise<void> {
  const { client, fromEmail } = await getUncachableResendClient();

  const safeName = sanitizeHtml(customer.name);
  const greeting = customer.contactFirstName
    ? `Hi ${sanitizeHtml(customer.contactFirstName)},`
    : `Hi there,`;

  const portalUrl = `https://production.selectbranding.co.uk/customer/login`;

  const body = `
    <p style="margin:0 0 18px;">${greeting}</p>
    <p style="margin:0 0 18px;">
      It's been a little while since we last worked together at <strong>${safeName}</strong>, and we just
      wanted to check in to say hello and see how things are going.
    </p>
    <p style="margin:0 0 18px;">
      Whether you have new projects in the pipeline, a question about pricing, or just want to
      catch up — we're here and always happy to help.
    </p>
    <p style="margin:0 0 18px;">
      If there's anything we could have done better last time, we'd genuinely love to hear your
      thoughts. Your feedback helps us improve and means a lot to the team.
    </p>
    <p style="margin:0 0 28px;">
      You can log in to your customer portal any time to check on existing orders or submit new ones:
    </p>
    ${ctaButton(portalUrl, 'Visit Your Portal')}
    <p style="margin:24px 0 0;">
      Looking forward to hearing from you.
    </p>
    <p style="margin:8px 0 0;">
      Warm regards,<br />
      <strong>The Select Branding Solutions Team</strong>
    </p>
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: customer.email,
    subject: `Checking in from Select Branding Solutions`,
    html: brandedEmail(body, { customerLogoUrl: customer.logoUrl, customerName: customer.name }),
  });

  if (error) {
    throw new Error(`Failed to send re-engagement email to ${customer.email}: ${JSON.stringify(error)}`);
  }
}

export async function sendMobileGuideEmail(params: {
  to: string;
  firstName: string | null;
  companyName: string | null;
}) {
  const { client, fromEmail } = await getUncachableResendClient();
  const safeName = sanitizeHtml(params.firstName);
  const safeCompany = sanitizeHtml(params.companyName);
  const portalUrl = `${getBaseUrl()}/customer/login`;
  const greeting = safeName ? `Hi ${safeName},` : 'Hello,';

  const stepStyle = `padding:10px 14px;margin:0;border-bottom:1px solid #e4e4e7;`;
  const stepNumStyle = `display:inline-block;background:#4f46e5;color:#fff;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;font-size:12px;font-weight:700;margin-right:10px;flex-shrink:0;`;
  const platformHeading = `font-size:15px;font-weight:700;color:#18181b;margin:20px 0 4px;`;

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">
      Use Production Planner on your phone
    </h2>
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 20px;">
      The <strong>${safeCompany ? safeCompany + ' ' : ''}Production Planner</strong> portal works as a fully-featured app on your phone — no app store download required. You can check your order status, send messages, and submit new jobs right from your home screen.
    </p>

    ${divider}

    <p style="${platformHeading}">iPhone &amp; iPad (Safari)</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e4e4e7;border-radius:6px;border-collapse:collapse;margin:12px 0 20px;">
      <tr><td style="${stepStyle}"><span style="${stepNumStyle}">1</span>Open <strong>Safari</strong> and go to the portal link below</td></tr>
      <tr><td style="${stepStyle}"><span style="${stepNumStyle}">2</span>Tap the <strong>Share</strong> button at the bottom of the screen (the square with an arrow pointing up)</td></tr>
      <tr><td style="${stepStyle}"><span style="${stepNumStyle}">3</span>Scroll down the share sheet and tap <strong>"Add to Home Screen"</strong></td></tr>
      <tr><td style="padding:10px 14px;margin:0;"><span style="${stepNumStyle}">4</span>Tap <strong>"Add"</strong> in the top-right corner — the app icon will appear on your home screen</td></tr>
    </table>
    <p style="color:#71717a;font-size:13px;margin:0 0 8px;">
      Note: This must be done in <strong>Safari</strong> — it will not work from Chrome or other browsers on iOS. Requires iOS 16.4 or later for push notifications.
    </p>

    ${divider}

    <p style="${platformHeading}">Android (Chrome)</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e4e4e7;border-radius:6px;border-collapse:collapse;margin:12px 0 20px;">
      <tr><td style="${stepStyle}"><span style="${stepNumStyle}">1</span>Open <strong>Chrome</strong> and go to the portal link below</td></tr>
      <tr><td style="${stepStyle}"><span style="${stepNumStyle}">2</span>Tap the <strong>three-dot menu</strong> (&#8942;) in the top-right corner</td></tr>
      <tr><td style="${stepStyle}"><span style="${stepNumStyle}">3</span>Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong></td></tr>
      <tr><td style="padding:10px 14px;margin:0;"><span style="${stepNumStyle}">4</span>Tap <strong>"Add"</strong> to confirm — the app icon will appear on your home screen</td></tr>
    </table>

    ${divider}

    <p style="margin:0 0 8px;font-weight:600;color:#18181b;">What you can do in the app:</p>
    <ul style="margin:0 0 20px;padding-left:20px;color:#3f3f46;line-height:2;">
      <li>Track the live status of all your orders in production</li>
      <li>Send and receive messages directly with the team</li>
      <li>Submit new job requests</li>
      <li>View invoices and documents</li>
    </ul>

    ${ctaButton(portalUrl, 'Open the Portal')}

    ${divider}
    <p style="margin:8px 0 0;">If you have any trouble getting set up, just reply to this email or send us a message through the portal and we will help.</p>
    <p style="margin:12px 0 0;">Best regards,<br/><strong>Select Branding Solutions</strong></p>
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: params.to,
    cc: ['chris@selectbranding.co.uk', 'james@selectuniforms.co.uk'],
    subject: 'How to use Production Planner on your phone',
    html: brandedEmail(body),
  });

  if (error) {
    throw new Error(`Failed to send mobile guide email to ${params.to}: ${JSON.stringify(error)}`);
  }
}

export async function sendPaymentReceiptEmail(params: {
  customerEmail: string;
  customerName: string;
  reference: string;
  subtotal: number;
  vatAmount: number;
  totalIncVat: number;
  lineItems: { jobName: string; jobType: string; quantity: number; price: number }[];
  paymentIntentId?: string;
}) {
  const { client, fromEmail } = await getUncachableResendClient();

  const itemRows = params.lineItems.map(li => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;font-size:14px;color:#18181b;">${sanitizeHtml(li.jobName)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;font-size:14px;color:#3f3f46;">${sanitizeHtml(li.jobType)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;font-size:14px;color:#3f3f46;text-align:center;">${li.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;font-size:14px;color:#18181b;text-align:right;">£${li.price.toFixed(2)}</td>
    </tr>
  `).join('');

  const body = `
    <p style="margin:0 0 12px;">Hi ${sanitizeHtml(params.customerName)},</p>
    <p style="margin:0 0 20px;">Thank you — your payment has been received. Please find your receipt below.</p>

    <div style="background-color:#f4f4f5;border-radius:6px;padding:16px 20px;margin:0 0 20px;">
      <p style="margin:0 0 4px;font-size:13px;color:#71717a;">Payment reference</p>
      <p style="margin:0;font-size:15px;font-weight:700;color:#18181b;font-family:monospace;">${sanitizeHtml(params.reference)}</p>
      ${params.paymentIntentId ? `<p style="margin:4px 0 0;font-size:12px;color:#a1a1aa;">Stripe: ${sanitizeHtml(params.paymentIntentId)}</p>` : ''}
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
      <thead>
        <tr style="background-color:#f4f4f5;">
          <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">Job</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">Type</th>
          <th style="padding:8px 12px;text-align:center;font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">Qty</th>
          <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">Price ex. VAT</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:320px;margin-left:auto;">
      <tr>
        <td style="padding:4px 0;font-size:14px;color:#71717a;">Subtotal ex. VAT</td>
        <td style="padding:4px 0;font-size:14px;color:#18181b;text-align:right;">£${params.subtotal.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:14px;color:#71717a;">VAT (20%)</td>
        <td style="padding:4px 0;font-size:14px;color:#18181b;text-align:right;">£${params.vatAmount.toFixed(2)}</td>
      </tr>
      <tr style="border-top:2px solid #e4e4e7;">
        <td style="padding:8px 0 4px;font-size:15px;font-weight:700;color:#18181b;">Total paid</td>
        <td style="padding:8px 0 4px;font-size:15px;font-weight:700;color:#18181b;text-align:right;">£${params.totalIncVat.toFixed(2)}</td>
      </tr>
    </table>

    ${divider}
    <p style="margin:0 0 4px;font-size:13px;color:#71717a;">Note: carriage charges are invoiced separately.</p>
    ${divider}
    <p style="margin:0 0 2px;">Regards,</p>
    <p style="margin:0;font-weight:600;">Select Branding Solutions</p>
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: params.customerEmail,
    cc: 'accounts@selectuniforms.co.uk',
    subject: `Payment Receipt — ${params.reference}`,
    html: brandedEmail(body),
  });

  if (error) {
    console.error('Failed to send payment receipt email:', error);
  }
}

export async function sendDispatchNotificationEmail(
  customerEmails: string[],
  details: {
    customerName: string;
    jobNames: string[];
    trackingNumber: string;
    portalUrl: string;
    customerLogoUrl?: string | null;
  }
) {
  if (!customerEmails.length) return;
  const { client, fromEmail } = await getUncachableResendClient();
  const safeName = sanitizeHtml(details.customerName);
  const safeTracking = sanitizeHtml(details.trackingNumber);
  const jobList = details.jobNames.map(j => `<li style="margin:4px 0;color:#18181b;font-size:14px;">${sanitizeHtml(j)}</li>`).join('');

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">Your Order Has Been Dispatched</h2>
    <p style="margin:0 0 12px;font-size:15px;color:#3f3f46;">Hi ${safeName},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#3f3f46;">Great news — your order has been dispatched via DPD and is on its way to you.</p>
    ${infoTable([{ label: 'DPD Tracking Number', value: safeTracking }])}
    <p style="margin:16px 0 8px;font-size:14px;font-weight:600;color:#18181b;">Order(s) included:</p>
    <ul style="margin:0 0 20px;padding-left:20px;">${jobList}</ul>
    <p style="margin:0 0 20px;font-size:14px;color:#71717a;">Log in to your customer portal to view full tracking details and order status.</p>
    ${ctaButton(details.portalUrl, 'Track Your Order')}
    ${muted('If you have any questions about your delivery, please don\'t hesitate to get in touch.')}
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: customerEmails,
    subject: `Your order has been dispatched — DPD tracking: ${safeTracking}`,
    html: brandedEmail(body, { customerLogoUrl: details.customerLogoUrl, customerName: details.customerName }),
  });

  if (error) {
    console.error('Failed to send dispatch notification email:', error);
  }
}

// ─── @Mention Notification ────────────────────────────────────────────────────
export async function sendMentionNotificationEmail(details: {
  mentionedName: string;
  mentionedEmail: string;
  senderName: string;
  messageText: string;
  contextLabel: string; // e.g. "School Hoodie — Keeps London"
  contextUrl: string;
}): Promise<void> {
  const { client, fromEmail } = await getUncachableResendClient();

  // Truncate long messages for the email preview
  const preview = details.messageText.length > 400
    ? details.messageText.slice(0, 397) + '…'
    : details.messageText;

  // Highlight the @handle in the message snippet
  const highlighted = preview.replace(
    /@(\w+)/g,
    `<span style="font-weight:600;color:#6366f1;">@$1</span>`
  );

  const body = `
    <p style="margin:0 0 12px;font-size:14px;color:#71717a;">
      <strong style="color:#18181b;">${details.senderName}</strong> mentioned you in a message:
    </p>
    <blockquote style="margin:0 0 20px;padding:12px 16px;background:#f4f4f5;border-left:3px solid #6366f1;border-radius:0 4px 4px 0;font-size:14px;line-height:1.6;color:#18181b;">
      ${highlighted}
    </blockquote>
    <p style="margin:0 0 20px;font-size:13px;color:#71717a;">Context: <strong style="color:#18181b;">${details.contextLabel}</strong></p>
    ${ctaButton(details.contextUrl, 'Open Conversation')}
    ${muted('You received this because you were @mentioned in a staff message.')}
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: [details.mentionedEmail],
    subject: `${details.senderName} mentioned you: "${details.contextLabel}"`,
    html: brandedEmail(body),
  });

  if (error) {
    console.error('Failed to send @mention notification email:', error);
  }
}

// ─── Feature Request Notification ─────────────────────────────────────────────
export async function sendFeatureRequestNotificationEmail(details: {
  title: string;
  description: string;
  submitterName: string;
  submitterType: string;
  submitterEmail?: string | null;
}): Promise<void> {
  const { client, fromEmail } = await getUncachableResendClient();

  const body = `
    <p style="margin:0 0 16px;font-size:15px;font-weight:600;">New Feature Request</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
      <tr><td style="padding:8px 12px;background:#f4f4f5;border-radius:4px 4px 0 0;font-size:13px;color:#71717a;width:120px;">From</td>
          <td style="padding:8px 12px;background:#f9f9fb;border-radius:4px 4px 0 0;font-size:14px;">${details.submitterName} <span style="color:#71717a;">(${details.submitterType})</span>${details.submitterEmail ? ` &middot; ${details.submitterEmail}` : ''}</td></tr>
      <tr><td style="padding:8px 12px;background:#f4f4f5;font-size:13px;color:#71717a;">Title</td>
          <td style="padding:8px 12px;background:#f9f9fb;font-size:14px;font-weight:600;">${details.title}</td></tr>
      <tr><td style="padding:8px 12px;background:#f4f4f5;border-radius:0 0 4px 4px;font-size:13px;color:#71717a;vertical-align:top;">Details</td>
          <td style="padding:8px 12px;background:#f9f9fb;border-radius:0 0 4px 4px;font-size:14px;white-space:pre-wrap;">${details.description}</td></tr>
    </table>
    ${ctaButton('https://production.selectbranding.co.uk/feature-requests', 'Review &amp; Prioritise')}
    ${muted('Only super admins can see this page.')}
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: ['chris@selectbranding.co.uk'],
    subject: `New feature suggestion: "${details.title}"`,
    html: brandedEmail(body),
  });

  if (error) {
    console.error('Failed to send feature request notification email:', error);
  }
}

export async function sendDeliverabilityTestEmail(params: { to: string; cc?: string }) {
  const { client, fromEmail } = await getUncachableResendClient();

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">Email Deliverability Test</h2>
    <p style="margin:0 0 12px;">This is a test email sent from the Select Branding Solutions production management system to check email deliverability and spam scoring.</p>
    ${infoTable([
      { label: 'Sent from', value: 'info@selectbranding.co.uk' },
      { label: 'Via', value: 'Resend (resend.com)' },
      { label: 'Reply-To', value: 'info@selectbranding.co.uk' },
      { label: 'Purpose', value: 'Deliverability test' },
    ])}
    <p style="margin:16px 0 0;font-size:14px;color:#3f3f46;">If you received this in your inbox (not spam), the email configuration is working correctly.</p>
  `;

  const sendParams: Parameters<Resend['emails']['send']>[0] = {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: [params.to],
    subject: 'Select Branding Solutions — Email Deliverability Test',
    html: brandedEmail(body),
  };
  if (params.cc) (sendParams as any).cc = [params.cc];

  const { error } = await sendEmail(client, sendParams);
  if (error) {
    console.error('Failed to send deliverability test email:', error);
    throw new Error(JSON.stringify(error));
  }
}

// ─── Broadcast email to all customers ────────────────────────────────────────
export function buildBroadcastEmailHtml(message: string, recipientFirstName?: string | null): string {
  const safeMessage = sanitizeHtml(message).replace(/\r\n/g, '\n').replace(/\n/g, '<br />');
  const greeting = recipientFirstName?.trim()
    ? `<p style="margin:0 0 18px;">Hi ${sanitizeHtml(recipientFirstName.trim())},</p>`
    : '';
  const body = `
    ${greeting}
    <p style="margin:0 0 18px;">${safeMessage}</p>
    <p style="margin:0 0 8px;">
      Best wishes,<br />
      <strong>The Select Branding Solutions Team</strong>
    </p>
  `;
  return brandedEmail(body);
}

export async function sendBroadcastEmail(params: {
  to: string;
  subject: string;
  message: string;
  recipientFirstName?: string | null;
}): Promise<void> {
  const { client, fromEmail } = await getUncachableResendClient();
  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: params.to,
    subject: params.subject,
    html: buildBroadcastEmailHtml(params.message, params.recipientFirstName),
  });
  if (error) {
    throw new Error(`Failed to send broadcast email to ${params.to}: ${JSON.stringify(error)}`);
  }
}

// ── Inactive customer notifications (internal, to James) ────────────────────

export interface InactiveCustomerRow {
  name: string;
  email: string | null;
  daysSinceLastOrder: number;
  lastOrderDate: string | null;
  checkInSentAt: string | null;
}

function inactiveCustomersTable(rows: InactiveCustomerRow[]): string {
  const cell = `padding:8px 10px;border-bottom:1px solid #e4e4e7;font-size:13px;text-align:left;`;
  const head = `${cell}font-weight:700;background:#fafafa;`;
  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
  };
  return `
    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e4e4e7;border-radius:6px;border-collapse:collapse;margin:12px 0 20px;">
      <tr>
        <th style="${head}">Customer</th>
        <th style="${head}">Last order</th>
        <th style="${head}">Weeks inactive</th>
        <th style="${head}">Check-in email</th>
      </tr>
      ${rows.map(r => `
      <tr>
        <td style="${cell}"><strong>${sanitizeHtml(r.name)}</strong></td>
        <td style="${cell}">${fmtDate(r.lastOrderDate)}</td>
        <td style="${cell}">${Math.floor(r.daysSinceLastOrder / 7)} (${r.daysSinceLastOrder} days)</td>
        <td style="${cell}">${r.checkInSentAt ? `Sent ${fmtDate(r.checkInSentAt)}` : 'Not yet sent'}</td>
      </tr>`).join('')}
    </table>
  `;
}

export async function sendInactiveCustomerAlertEmail(params: {
  to: string;
  customers: InactiveCustomerRow[];
}): Promise<void> {
  const { client, fromEmail } = await getUncachableResendClient();
  const n = params.customers.length;
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">
      ${n} customer${n === 1 ? '' : 's'} now inactive for 3+ months
    </h2>
    <p style="margin:0 0 12px;">
      The customer${n === 1 ? '' : 's'} below ${n === 1 ? 'has' : 'have'} not placed an order for over 3 months.
      Worth an honest conversation about whether the account should stay open — an open but inactive
      account benefits nobody, and closing it frees up capacity for active customers.
    </p>
    ${inactiveCustomersTable(params.customers)}
    <p style="margin:0;color:#71717a;font-size:13px;">
      Sent automatically by Production Planner when a customer passes 3 months without an order.
    </p>
  `;
  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: params.to,
    cc: 'chris@selectbranding.co.uk',
    subject: `${n} customer${n === 1 ? '' : 's'} inactive for 3+ months — consider closing`,
    html: brandedEmail(body, { noReply: true }),
  });
  if (error) {
    throw new Error(`Failed to send inactive-customer alert: ${JSON.stringify(error)}`);
  }
}

export async function sendMonthlyInactiveReportEmail(params: {
  to: string;
  monthLabel: string;
  activeCustomerCount: number;
  eightWeekPlus: InactiveCustomerRow[];
  threeMonthPlus: InactiveCustomerRow[];
}): Promise<void> {
  const { client, fromEmail } = await getUncachableResendClient();
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">
      Inactive customer report — ${sanitizeHtml(params.monthLabel)}
    </h2>
    <p style="margin:0 0 18px;">
      Currently <strong>${params.activeCustomerCount}</strong> open customer accounts.
      ${params.threeMonthPlus.length + params.eightWeekPlus.length === 0
        ? 'No customers look inactive right now — nothing to action this month.'
        : 'The lists below show who has gone quiet and who to consider offboarding.'}
    </p>
    ${params.threeMonthPlus.length > 0 ? `
    <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#18181b;">
      Consider making inactive — no orders for 3+ months (${params.threeMonthPlus.length})
    </p>
    <p style="margin:0 0 8px;color:#71717a;font-size:13px;">
      Time for an honest conversation about closing these accounts to free up capacity.
    </p>
    ${inactiveCustomersTable(params.threeMonthPlus)}` : ''}
    ${params.eightWeekPlus.length > 0 ? `
    <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#18181b;">
      Going quiet — no orders for 8+ weeks (${params.eightWeekPlus.length})
    </p>
    <p style="margin:0 0 8px;color:#71717a;font-size:13px;">
      These customers get a friendly check-in email automatically.
    </p>
    ${inactiveCustomersTable(params.eightWeekPlus)}` : ''}
    <p style="margin:0;color:#71717a;font-size:13px;">
      Sent automatically by Production Planner on the 1st of each month.
    </p>
  `;
  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: params.to,
    cc: 'chris@selectbranding.co.uk',
    subject: `Inactive customer report — ${params.monthLabel}`,
    html: brandedEmail(body, { noReply: true }),
  });
  if (error) {
    throw new Error(`Failed to send monthly inactive report: ${JSON.stringify(error)}`);
  }
}

// ─── Weekly performance summary (internal) ───────────────────────────────────

export interface WeeklySummaryMetric {
  label: string;
  lastWeek: string;
  average: string; // rolling 16-week average
  /** Raw values — when both present, a green/red change chip is shown */
  lastWeekValue?: number | null;
  averageValue?: number | null;
  /** Show this metric as one of the big headline cards at the top */
  headline?: boolean;
}

function summaryDeltaChip(m: WeeklySummaryMetric): string {
  if (m.lastWeekValue == null || m.averageValue == null || m.averageValue === 0) {
    return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#f4f4f5;color:#71717a;font-size:11px;font-weight:700;">&ndash;</span>`;
  }
  const pct = ((m.lastWeekValue - m.averageValue) / m.averageValue) * 100;
  if (Math.abs(pct) < 1) {
    return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#f4f4f5;color:#52525b;font-size:11px;font-weight:700;">level</span>`;
  }
  const up = pct > 0;
  const bg = up ? '#dcfce7' : '#fee2e2';
  const fg = up ? '#15803d' : '#b91c1c';
  const arrow = up ? '&#9650;' : '&#9660;';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${bg};color:${fg};font-size:11px;font-weight:700;">${arrow} ${Math.abs(pct).toFixed(0)}%</span>`;
}

export interface WeeklySummaryTeamRow {
  name: string;
  lastWeek: number; // line items completed last week
  average: number; // rolling average per week
}

export async function sendWeeklySummaryEmail(params: {
  to: string[];
  weekLabel: string; // e.g. "w/c 27 July 2026"
  weeksAveraged: number;
  metrics: WeeklySummaryMetric[];
  team?: WeeklySummaryTeamRow[];
}): Promise<void> {
  const { client, fromEmail } = await getUncachableResendClient();

  const headline = params.metrics.filter(m => m.headline).slice(0, 3);
  const rest = params.metrics.filter(m => !headline.includes(m));

  const headlineCards = headline.length > 0 ? `
    <table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:0 0 20px;table-layout:fixed;">
      <tr>
        ${headline.map(m => `
        <td style="background:linear-gradient(135deg,#eef2ff,#f5f3ff);border:1px solid #e0e7ff;border-radius:12px;padding:16px 14px;text-align:center;vertical-align:top;">
          <div style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${sanitizeHtml(m.label)}</div>
          <div style="font-size:30px;font-weight:800;color:#18181b;line-height:1;margin-bottom:8px;">${sanitizeHtml(m.lastWeek)}</div>
          <div>${summaryDeltaChip(m)}</div>
          <div style="font-size:11px;color:#71717a;margin-top:6px;">avg ${sanitizeHtml(m.average)}</div>
        </td>`).join('')}
      </tr>
    </table>` : '';

  const rows = rest.map((m, i) => `
    <tr>
      <td style="padding:11px 14px;background:${i % 2 === 0 ? '#fafafa' : '#ffffff'};border-bottom:1px solid #f4f4f5;font-size:13px;color:#3f3f46;${i === 0 ? 'border-top-left-radius:10px;' : ''}${i === rest.length - 1 ? 'border-bottom-left-radius:10px;border-bottom:none;' : ''}">${sanitizeHtml(m.label)}</td>
      <td style="padding:11px 14px;background:${i % 2 === 0 ? '#fafafa' : '#ffffff'};border-bottom:1px solid #f4f4f5;font-size:15px;color:#18181b;text-align:right;font-weight:800;${i === rest.length - 1 ? 'border-bottom:none;' : ''}">${sanitizeHtml(m.lastWeek)}</td>
      <td style="padding:11px 14px;background:${i % 2 === 0 ? '#fafafa' : '#ffffff'};border-bottom:1px solid #f4f4f5;font-size:13px;color:#71717a;text-align:right;${i === rest.length - 1 ? 'border-bottom:none;' : ''}">${sanitizeHtml(m.average)}</td>
      <td style="padding:11px 14px;background:${i % 2 === 0 ? '#fafafa' : '#ffffff'};border-bottom:1px solid #f4f4f5;text-align:right;${i === 0 ? 'border-top-right-radius:10px;' : ''}${i === rest.length - 1 ? 'border-bottom-right-radius:10px;border-bottom:none;' : ''}">${summaryDeltaChip(m)}</td>
    </tr>`).join('');

  const body = `
    <div style="border-left:4px solid #6366f1;padding-left:12px;margin:0 0 18px;">
      <h2 style="margin:0 0 4px;font-size:21px;font-weight:800;color:#18181b;">
        Weekly performance summary
      </h2>
      <p style="margin:0;color:#6366f1;font-size:14px;font-weight:700;">${sanitizeHtml(params.weekLabel)}</p>
      <p style="margin:4px 0 0;color:#71717a;font-size:12px;">
        Last completed week (Monday to Sunday) against the rolling ${params.weeksAveraged}-week average
      </p>
    </div>
    ${headlineCards}
    ${rest.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;border:1px solid #e4e4e7;border-radius:10px;">
      <thead>
        <tr>
          <th style="padding:9px 14px;background:#18181b;font-size:11px;color:#ffffff;text-align:left;text-transform:uppercase;letter-spacing:0.05em;border-top-left-radius:10px;">Metric</th>
          <th style="padding:9px 14px;background:#18181b;font-size:11px;color:#ffffff;text-align:right;text-transform:uppercase;letter-spacing:0.05em;">Last week</th>
          <th style="padding:9px 14px;background:#18181b;font-size:11px;color:#ffffff;text-align:right;text-transform:uppercase;letter-spacing:0.05em;">${params.weeksAveraged}-wk avg</th>
          <th style="padding:9px 14px;background:#18181b;font-size:11px;color:#ffffff;text-align:right;text-transform:uppercase;letter-spacing:0.05em;border-top-right-radius:10px;">vs avg</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>` : ''}
    ${params.team && params.team.length > 0 ? `
    <p style="margin:0 0 8px;font-size:15px;font-weight:800;color:#18181b;">Team performance — line items completed</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;border:1px solid #e4e4e7;border-radius:10px;">
      <thead>
        <tr>
          <th style="padding:9px 14px;background:#18181b;font-size:11px;color:#ffffff;text-align:left;text-transform:uppercase;letter-spacing:0.05em;border-top-left-radius:10px;">Team member</th>
          <th style="padding:9px 14px;background:#18181b;font-size:11px;color:#ffffff;text-align:right;text-transform:uppercase;letter-spacing:0.05em;">Last week</th>
          <th style="padding:9px 14px;background:#18181b;font-size:11px;color:#ffffff;text-align:right;text-transform:uppercase;letter-spacing:0.05em;">${params.weeksAveraged}-wk avg</th>
          <th style="padding:9px 14px;background:#18181b;font-size:11px;color:#ffffff;text-align:right;text-transform:uppercase;letter-spacing:0.05em;border-top-right-radius:10px;">vs avg</th>
        </tr>
      </thead>
      <tbody>
        ${params.team.map((t, i) => {
          const bg = i % 2 === 0 ? '#fafafa' : '#ffffff';
          const last = i === params.team!.length - 1;
          return `
        <tr>
          <td style="padding:11px 14px;background:${bg};border-bottom:1px solid #f4f4f5;font-size:13px;color:#3f3f46;font-weight:600;${last ? 'border-bottom:none;border-bottom-left-radius:10px;' : ''}">${sanitizeHtml(t.name)}</td>
          <td style="padding:11px 14px;background:${bg};border-bottom:1px solid #f4f4f5;font-size:15px;color:#18181b;text-align:right;font-weight:800;${last ? 'border-bottom:none;' : ''}">${Math.round(t.lastWeek).toLocaleString('en-GB')}</td>
          <td style="padding:11px 14px;background:${bg};border-bottom:1px solid #f4f4f5;font-size:13px;color:#71717a;text-align:right;${last ? 'border-bottom:none;' : ''}">${Math.round(t.average).toLocaleString('en-GB')}</td>
          <td style="padding:11px 14px;background:${bg};border-bottom:1px solid #f4f4f5;text-align:right;${last ? 'border-bottom:none;border-bottom-right-radius:10px;' : ''}">${summaryDeltaChip({ label: t.name, lastWeek: '', average: '', lastWeekValue: t.lastWeek, averageValue: t.average })}</td>
        </tr>`;
        }).join('')}
      </tbody>
    </table>` : ''}
    <p style="margin:0;color:#71717a;font-size:12px;">
      Sent automatically by Production Planner every Monday morning. The full report is under Reports &rarr; Weekly Output.
    </p>
  `;
  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: params.to,
    subject: `Weekly performance summary — ${params.weekLabel}`,
    html: brandedEmail(body, { noReply: true }),
  });
  if (error) {
    throw new Error(`Failed to send weekly summary: ${JSON.stringify(error)}`);
  }
}
