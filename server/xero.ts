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

export class XeroService {
  private apiUrl = "https://api.xero.com/api.xro/2.0";
  private clientId: string;
  private clientSecret: string;
  private tenantId: string;
  private accessToken: string | null = null;

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

  async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("Xero is not configured. Please set XERO_CLIENT_ID, XERO_CLIENT_SECRET, and XERO_TENANT_ID environment variables.");
    }

    // Check for access token in environment variable
    const envToken = process.env.XERO_ACCESS_TOKEN;
    if (envToken) {
      return envToken;
    }

    // Return in-memory token if available (set via OAuth flow)
    if (this.accessToken) {
      return this.accessToken;
    }

    throw new Error("No access token available. Please set XERO_ACCESS_TOKEN environment variable or implement OAuth flow.");
  }

  setAccessToken(token: string) {
    this.accessToken = token;
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
      reference: job.poNumber,
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
