import { Resend } from 'resend';
import { generateOrderAcknowledgementPdf, type OrderAcknowledgementData } from './orderAcknowledgementPdf';

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
  // Use direct API key if available (most reliable for deployed environments)
  if (process.env.RESEND_API_KEY) {
    return {
      apiKey: process.env.RESEND_API_KEY,
      fromEmail: 'onboarding@resend.dev'
    };
  }

  // Fall back to Replit connector
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

function getBaseUrl() {
  return process.env.REPLIT_DOMAINS 
    ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` 
    : 'http://localhost:5000';
}

export async function sendPasswordResetEmail(email: string, resetToken: string) {
  const { client, fromEmail } = await getUncachableResendClient();
  
  const resetUrl = `${getBaseUrl()}/reset-password?token=${resetToken}`;
  
  const { data, error } = await client.emails.send({
    from: fromEmail || 'onboarding@resend.dev',
    to: email,
    subject: 'Password Reset Request - Production Manager',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>You requested to reset your password for Production Manager.</p>
        <p>Click the button below to reset your password. This link will expire in 1 hour.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">
          If you didn't request this, you can safely ignore this email.
        </p>
        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link into your browser:<br/>
          <a href="${resetUrl}" style="color: #4F46E5;">${resetUrl}</a>
        </p>
      </div>
    `,
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
  
  // Sanitize all customer-controlled fields
  const safeJobName = sanitizeHtml(jobDetails.jobName);
  const safeCustomerName = sanitizeHtml(jobDetails.customerName);
  const safePONumber = sanitizeHtml(jobDetails.poNumber);
  const safeDispatchDate = sanitizeHtml(jobDetails.requiredDispatchDate);
  
  const { data, error } = await client.emails.send({
    from: fromEmail || 'onboarding@resend.dev',
    to: staffEmails,
    subject: `New Job Submission: ${safeJobName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New Job Submission Received</h2>
        <p>A new job has been submitted by <strong>${safeCustomerName}</strong> and requires your review.</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Job Details:</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666;">Job Name:</td>
              <td style="padding: 8px 0; font-weight: bold;">${safeJobName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Customer:</td>
              <td style="padding: 8px 0; font-weight: bold;">${safeCustomerName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Quantity:</td>
              <td style="padding: 8px 0; font-weight: bold;">${jobDetails.quantity} garments</td>
            </tr>
            ${safePONumber ? `
            <tr>
              <td style="padding: 8px 0; color: #666;">PO Number:</td>
              <td style="padding: 8px 0; font-weight: bold;">${safePONumber}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0; color: #666;">Required Dispatch:</td>
              <td style="padding: 8px 0; font-weight: bold;">${safeDispatchDate}</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${viewUrl}" 
             style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Review in Holding Area
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px;">
          Please review and approve/reject this job within 24 hours.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error('Failed to send new job submission email:', error);
    // Don't throw - email failures shouldn't block job submission
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
  }
) {
  const { client, fromEmail } = await getUncachableResendClient();

  const orderRef = jobDetails.jobNumber || jobDetails.jobId.slice(0, 8).toUpperCase();

  // Generate PDF attachment
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

  const { data, error } = await client.emails.send({
    from: fromEmail || 'onboarding@resend.dev',
    to: customerEmail,
    subject: `Select Branding Solutions Ltd Order Acknowledgement - New Bank Details - Ref : ${orderRef}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
        <p>Thank you for your order.</p>
        <p>Please find attached your order acknowledgement. Please check this meets your requirements.
           It is important you check the garments, colours, sizes and quantities as well as the
           finishes to be applied.</p>
        <p>You can make payment by BACS or by card using the details below.
           Our bank details have recently been updated.</p>
        <p>
          <a href="https://buy.stripe.com/bIY16peJJ5j99Us144"
             style="color: #4F46E5;">https://buy.stripe.com/bIY16peJJ5j99Us144</a>
        </p>
        <p style="margin: 4px 0;">Select Branding Solutions Ltd</p>
        <p style="margin: 4px 0;">04-06-05</p>
        <p style="margin: 4px 0;">30422879</p>
        <br/>
        <p style="margin: 4px 0;">Regards</p>
        <br/>
        <p style="margin: 4px 0;">Select Uniforms</p>
        <p style="margin: 4px 0;">
          <a href="mailto:sales@selectuniforms.co.uk" style="color: #4F46E5;">sales@selectuniforms.co.uk</a>
        </p>
      </div>
    `,
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
  
  // Sanitize all customer-controlled and staff-controlled fields
  const safeJobName = sanitizeHtml(jobDetails.jobName);
  const safeRejectionReason = sanitizeHtml(jobDetails.rejectionReason);
  const safeRejectionMessage = sanitizeHtml(jobDetails.rejectionMessage);
  
  const { data, error } = await client.emails.send({
    from: fromEmail || 'onboarding@resend.dev',
    to: customerEmail,
    subject: `Job Update Required: ${safeJobName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ef4444;">Job Requires Updates</h2>
        <p>Your job <strong>${safeJobName}</strong> requires some updates before we can proceed.</p>
        
        ${safeRejectionReason ? `
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Reason:</h3>
          <p style="margin: 0; color: #333;">${safeRejectionReason}</p>
        </div>
        ` : ''}

        ${safeRejectionMessage ? `
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Message from our team:</h3>
          <p style="margin: 0; color: #333;">${safeRejectionMessage}</p>
        </div>
        ` : ''}

        <div style="text-align: center; margin: 30px 0;">
          <a href="${viewUrl}" 
             style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Job & Respond
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px;">
          Please use the chat feature in the job details page to discuss any questions or submit a revised order.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error('Failed to send job rejected email:', error);
    // Don't throw - email failures shouldn't block rejection
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

  const { error } = await client.emails.send({
    from: fromEmail || 'onboarding@resend.dev',
    to: customerEmail,
    subject: `New message about your job: ${safeJobName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New Message from Select Branding</h2>
        <p><strong>${safeStaffName}</strong> has sent you a message about your job <strong>${safeJobName}</strong>:</p>
        <div style="background-color: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #333; white-space: pre-line;">${safeMessage}</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${viewUrl}"
             style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View & Reply
          </a>
        </div>
      </div>
    `,
  });

  if (error) {
    console.error('Failed to send staff message notification to customer:', error);
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

  const { error } = await client.emails.send({
    from: fromEmail || 'onboarding@resend.dev',
    to: customerEmails,
    subject: emailSubject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
        <h2 style="color: #333;">New Message from Select Branding</h2>
        <p>${contextLine}</p>
        <div style="background-color: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4F46E5;">
          <p style="margin: 0; color: #333; white-space: pre-line;">${safeMessage}</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${details.portalUrl}"
             style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View &amp; Reply
          </a>
        </div>
        <p style="color: #666; font-size: 13px;">
          You can reply directly from your customer portal. If you have any questions, please don't hesitate to get in touch.
        </p>
        <p style="margin: 4px 0; color: #666; font-size: 13px;">Regards,</p>
        <p style="margin: 4px 0; color: #666; font-size: 13px;">Select Uniforms</p>
        <p style="margin: 4px 0;">
          <a href="mailto:sales@selectuniforms.co.uk" style="color: #4F46E5; font-size: 13px;">sales@selectuniforms.co.uk</a>
        </p>
      </div>
    `,
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

  const { error } = await client.emails.send({
    from: fromEmail || 'onboarding@resend.dev',
    to: ccEmails,
    subject: `[CC] Message to ${safeCustomerName} re: ${safeJobName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">You were CC'd on a customer message</h2>
        <p><strong>${safeSenderName}</strong> sent the following message to <strong>${safeCustomerName}</strong> about job <strong>${safeJobName}</strong>:</p>
        <div style="background-color: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #333; white-space: pre-line;">${safeMessage}</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${viewUrl}"
             style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Job
          </a>
        </div>
      </div>
    `,
  });

  if (error) {
    console.error('Failed to send CC email to staff:', error);
  }
}
