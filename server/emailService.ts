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

/** Sends an email via Resend and records it in the daily budget tracker. */
async function sendEmail(
  client: Resend,
  params: Parameters<Resend['emails']['send']>[0],
): ReturnType<Resend['emails']['send']> {
  const result = await client.emails.send(params);
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
function brandedEmail(bodyHtml: string, opts?: { customerLogoUrl?: string | null; customerName?: string | null }): string {
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
                This email was sent from an automated system. Please do not reply directly to this message.
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
  const viewUrl = `${getBaseUrl()}/dashboard/holding-area`;

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
  const viewUrl = `${getBaseUrl()}/dashboard/holding-area`;

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
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: customerEmail,
    subject: `New message about your order: ${safeJobName}`,
    html: brandedEmail(body),
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

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#18181b;">New Message from Select Branding</h2>
    <p style="margin:0 0 12px;">${contextLine}</p>
    <div style="background-color:#f4f4f5;border-left:4px solid #4f46e5;border-radius:0 6px 6px 0;padding:16px 20px;margin:16px 0;">
      <p style="margin:0;color:#18181b;white-space:pre-line;">${safeMessage}</p>
    </div>
    ${ctaButton(details.portalUrl, 'View &amp; Reply')}
    ${muted('You can reply directly from your customer portal. If you have any questions, please don\'t hesitate to get in touch.')}
  `;

  const { error } = await sendEmail(client, {
    from: fromEmail || 'info@selectbranding.co.uk',
    to: customerEmails,
    subject: emailSubject,
    html: brandedEmail(body),
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
  loginUrl: string;
  demoEmail: string;
  demoPassword: string;
}): Promise<void> {
  const { client, fromEmail } = await getUncachableResendClient();

  const safeName = sanitizeHtml(`${params.firstName} ${params.lastName}`.trim());
  const safeFirst = sanitizeHtml(params.firstName);
  const safeCompany = sanitizeHtml(params.company);
  const safeEmail = sanitizeHtml(params.demoEmail);
  const safePassword = sanitizeHtml(params.demoPassword);

  const companyLine = safeCompany
    ? `<p style="margin:0 0 18px;color:#71717a;font-size:13px;">Requested by: ${safeName}${safeCompany ? ` &mdash; ${safeCompany}` : ''}</p>`
    : '';

  const body = `
    <p style="margin:0 0 18px;">Hi ${safeFirst},</p>
    <p style="margin:0 0 18px;">
      Thanks for your interest in the <strong>Select Branding Production System</strong>!
      Your demo account is ready — you can log in right now to explore the platform.
    </p>
    <p style="margin:0 0 18px;">
      You'll be seeing our <em>real system</em> in action, with customer names and financial
      figures anonymised so everything remains confidential. All the core functionality —
      the production queue, scheduling, invoicing, messaging, and reports — is live and
      working as our team uses it every day.
    </p>
    ${infoTable([
      { label: 'Login email', value: safeEmail },
      { label: 'Password', value: safePassword },
    ])}
    ${ctaButton(params.loginUrl, 'Open the Demo')}
    <p style="margin:0 0 18px;">
      If you have any questions or would like a guided walkthrough, just reply to this email
      or reach out directly — we'd love to chat.
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
    subject: 'How to use Production Planner on your phone',
    html: brandedEmail(body),
  });

  if (error) {
    throw new Error(`Failed to send mobile guide email to ${params.to}: ${JSON.stringify(error)}`);
  }
}
