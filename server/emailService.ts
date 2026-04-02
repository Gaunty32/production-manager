import { Resend } from 'resend';

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
      fromEmail: 'noreply@selectbrandingsolutions.co.uk'
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
  }
) {
  const { client, fromEmail } = await getUncachableResendClient();
  
  const viewUrl = `${getBaseUrl()}/customer/job/${jobDetails.jobId}`;
  
  // Sanitize all customer-controlled fields
  const safeJobName = sanitizeHtml(jobDetails.jobName);
  
  const { data, error } = await client.emails.send({
    from: fromEmail || 'onboarding@resend.dev',
    to: customerEmail,
    subject: `Job Approved: ${safeJobName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">✓ Job Approved</h2>
        <p>Great news! Your job <strong>${safeJobName}</strong> has been approved and is now in production.</p>
        
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; border-left: 4px solid #10b981; margin: 20px 0;">
          <p style="margin: 0; color: #333;">
            Your order is now being processed and will be dispatched according to the requested schedule.
          </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${viewUrl}" 
             style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Job Details
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px;">
          If you have any questions, please contact us or use the chat feature in the job details page.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error('Failed to send job approved email:', error);
    // Don't throw - email failures shouldn't block approval
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
