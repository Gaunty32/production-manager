import type { Job, Customer } from "@shared/schema";

export interface XeroInvoiceLineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode?: string;
}

export interface XeroInvoice {
  type: "ACCREC"; // Accounts Receivable
  contact: {
    name: string;
  };
  lineItems: XeroInvoiceLineItem[];
  date: string;
  dueDate: string;
  reference?: string;
  status: "DRAFT" | "SUBMITTED" | "AUTHORISED";
}

interface XeroTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp
}

export class XeroService {
  private apiUrl = "https://api.xero.com/api.xro/2.0";
  private authUrl = "https://login.xero.com/identity/connect/authorize";
  private tokenUrl = "https://identity.xero.com/connect/token";
  private clientId: string;
  private clientSecret: string;
  private tenantId: string;
  private tokens: XeroTokens | null = null;

  constructor() {
    this.clientId = process.env.XERO_CLIENT_ID || "";
    this.clientSecret = process.env.XERO_CLIENT_SECRET || "";
    this.tenantId = process.env.XERO_TENANT_ID || "";

    if (!this.clientId || !this.clientSecret || !this.tenantId) {
      console.warn("Xero credentials not configured. Invoice creation will be unavailable.");
    }
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.tenantId);
  }

  isConnected(): boolean {
    return !!(this.tokens?.access_token);
  }

  getAuthorizationUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: "accounting.transactions accounting.contacts offline_access",
    });
    return `${this.authUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<void> {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    const data = await response.json();
    this.tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
    };
  }

  async refreshAccessToken(): Promise<void> {
    if (!this.tokens?.refresh_token) {
      throw new Error("No refresh token available");
    }

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.tokens.refresh_token,
    });

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh access token: ${error}`);
    }

    const data = await response.json();
    this.tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
    };
  }

  async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("Xero is not configured. Please set XERO_CLIENT_ID, XERO_CLIENT_SECRET, and XERO_TENANT_ID environment variables.");
    }

    // Check if token exists and is still valid
    if (this.tokens?.access_token) {
      // Refresh if expiring within 5 minutes
      if (this.tokens.expires_at < Date.now() + (5 * 60 * 1000)) {
        await this.refreshAccessToken();
      }
      return this.tokens.access_token;
    }

    throw new Error("Not connected to Xero. Please authorize the application first.");
  }

  async createInvoice(job: Job, customer: Customer, unitPrice: number = 0): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error("Xero is not configured");
    }

    const token = await this.getAccessToken();

    const invoice: XeroInvoice = {
      type: "ACCREC",
      contact: {
        name: customer.name,
      },
      lineItems: [
        {
          description: `${job.jobName} - PO: ${job.poNumber}`,
          quantity: job.quantity,
          unitAmount: unitPrice,
        },
      ],
      date: new Date(job.dateReceived).toISOString().split('T')[0],
      dueDate: new Date(job.requiredDispatchDate).toISOString().split('T')[0],
      reference: job.poNumber || undefined,
      status: "DRAFT",
    };

    const response = await fetch(`${this.apiUrl}/Invoices`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "xero-tenant-id": this.tenantId,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ Invoices: [invoice] }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Xero API error: ${error}`);
    }

    return response.json();
  }

  async createConsolidatedInvoice(
    jobs: Job[], 
    customer: Customer, 
    lineItemsWithPricing: Array<{ jobName: string; poNumber: string | null; description: string; quantity: number; unitPrice: number }>
  ): Promise<any> {
    if (!this.isConfigured()) {
      // Return mock response for demo/testing purposes
      console.log("Xero not configured - returning mock invoice response");
      const mockInvoiceId = `DEMO-INV-${Date.now()}`;
      return {
        Invoices: [{
          InvoiceID: mockInvoiceId,
          InvoiceNumber: `INV-${String(Date.now()).slice(-6)}`,
          Type: "ACCREC",
          Contact: { Name: customer.name },
          Status: "DRAFT",
        }]
      };
    }

    const token = await this.getAccessToken();

    // Create line items from job line items
    const xeroLineItems: XeroInvoiceLineItem[] = lineItemsWithPricing.map(item => ({
      description: `${item.jobName}${item.poNumber ? ` (PO: ${item.poNumber})` : ''} - ${item.description}`,
      quantity: item.quantity,
      unitAmount: item.unitPrice,
    }));

    // Get the most recent dates for invoice date and due date
    const mostRecentDate = jobs.reduce((latest, job) => {
      const jobDate = new Date(job.dateReceived);
      return jobDate > latest ? jobDate : latest;
    }, new Date(jobs[0].dateReceived));

    const mostRecentDueDate = jobs.reduce((latest, job) => {
      const jobDueDate = new Date(job.requiredDispatchDate);
      return jobDueDate > latest ? jobDueDate : latest;
    }, new Date(jobs[0].requiredDispatchDate));

    // Combine all PO numbers for reference
    const poNumbers = jobs
      .map(j => j.poNumber)
      .filter(Boolean)
      .join(", ");

    const invoice: XeroInvoice = {
      type: "ACCREC",
      contact: {
        name: customer.name,
      },
      lineItems: xeroLineItems,
      date: mostRecentDate.toISOString().split('T')[0],
      dueDate: mostRecentDueDate.toISOString().split('T')[0],
      reference: poNumbers || undefined,
      status: "DRAFT",
    };

    const response = await fetch(`${this.apiUrl}/Invoices`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "xero-tenant-id": this.tenantId,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ Invoices: [invoice] }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Xero API error: ${error}`);
    }

    return response.json();
  }

  async getInvoices(): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error("Xero is not configured");
    }

    const token = await this.getAccessToken();

    const response = await fetch(`${this.apiUrl}/Invoices`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "xero-tenant-id": this.tenantId,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Xero API error: ${error}`);
    }

    return response.json();
  }
}

export const xeroService = new XeroService();
