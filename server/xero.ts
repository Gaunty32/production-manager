import type { Job, Customer } from "@shared/schema";

export interface XeroInvoiceLineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode?: string;
  taxType?: string;
  itemCode?: string;
}

export interface XeroInvoice {
  type: "ACCREC"; // Accounts Receivable
  contact: {
    contactID?: string;
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
  tenant_id?: string;
}

export class XeroService {
  private apiUrl = "https://api.xero.com/api.xro/2.0";
  private authUrl = "https://login.xero.com/identity/connect/authorize";
  private tokenUrl = "https://identity.xero.com/connect/token";
  private connectionsUrl = "https://api.xero.com/connections";
  private clientId: string;
  private clientSecret: string;
  private tokens: XeroTokens | null = null;
  private pendingStates: Map<string, number> = new Map(); // state -> timestamp

  constructor() {
    this.clientId = process.env.XERO_CLIENT_ID || "";
    this.clientSecret = process.env.XERO_CLIENT_SECRET || "";

    if (!this.clientId || !this.clientSecret) {
      console.warn("Xero credentials not configured. Invoice creation will be unavailable.");
    }
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  isConnected(): boolean {
    return !!(this.tokens?.access_token && this.tokens?.tenant_id);
  }

  private generateState(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private cleanupExpiredStates() {
    const now = Date.now();
    const expiryTime = 10 * 60 * 1000; // 10 minutes
    const entries = Array.from(this.pendingStates.entries());
    for (const [state, timestamp] of entries) {
      if (now - timestamp > expiryTime) {
        this.pendingStates.delete(state);
      }
    }
  }

  getAuthorizationUrl(redirectUri: string): { authUrl: string; state: string } {
    this.cleanupExpiredStates();
    
    const state = this.generateState();
    this.pendingStates.set(state, Date.now());

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: "accounting.transactions accounting.contacts offline_access",
      state,
    });
    
    return {
      authUrl: `${this.authUrl}?${params.toString()}`,
      state
    };
  }

  validateState(state: string): boolean {
    const exists = this.pendingStates.has(state);
    if (exists) {
      this.pendingStates.delete(state);
    }
    return exists;
  }

  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<void> {
    try {
      console.log("=== XERO TOKEN EXCHANGE ===");
      console.log("Code:", code.substring(0, 10) + "...");
      console.log("Redirect URI:", redirectUri);
      
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      });

      console.log("Fetching access token from Xero...");
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(this.tokenUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      console.log("Token response status:", response.status);

      if (!response.ok) {
        const error = await response.text();
        console.error("Token exchange failed:", error);
        throw new Error("Authorization failed. Please try connecting again.");
      }

      const data = await response.json();
      console.log("Access token received, fetching tenant info...");
      
      // Fetch tenant ID from connections
      const connectionsResponse = await fetch(this.connectionsUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${data.access_token}`,
          "Content-Type": "application/json",
        },
      });

      console.log("Connections response status:", connectionsResponse.status);

      if (!connectionsResponse.ok) {
        const error = await connectionsResponse.text();
        console.error("Connections fetch failed:", error);
        throw new Error("Failed to retrieve organization information.");
      }

      const connections = await connectionsResponse.json();
      console.log("Connections received:", connections.length);
      
      if (!connections || connections.length === 0) {
        throw new Error("No Xero organizations found. Please ensure you have access to a Xero organization.");
      }

      // Use the first connection's tenant ID
      const tenantId = connections[0].tenantId;
      console.log("Tenant ID:", tenantId);

      this.tokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in * 1000),
        tenant_id: tenantId,
      };
      
      console.log("Token exchange complete!");
      console.log("=========================");
    } catch (error) {
      console.error("=== TOKEN EXCHANGE ERROR ===");
      console.error("Error:", error);
      console.error("============================");
      throw error;
    }
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
      throw new Error("Session expired. Please reconnect to Xero.");
    }

    const data = await response.json();
    this.tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
      tenant_id: this.tokens.tenant_id, // Preserve tenant ID
    };
  }

  async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("Xero is not configured.");
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

  getTenantId(): string {
    if (!this.tokens?.tenant_id) {
      throw new Error("No tenant ID available. Please reconnect to Xero.");
    }
    return this.tokens.tenant_id;
  }

  async findContact(customer: Customer): Promise<{ contactID: string; name: string } | null> {
    if (!this.isConfigured() || !this.isConnected()) {
      return null;
    }

    try {
      const token = await this.getAccessToken();
      const tenantId = this.getTenantId();

      // First try to find by exact name match
      let response = await fetch(`${this.apiUrl}/Contacts?where=Name=="${encodeURIComponent(customer.name)}"`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "xero-tenant-id": tenantId,
          "Accept": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.Contacts && data.Contacts.length > 0) {
          return {
            contactID: data.Contacts[0].ContactID,
            name: data.Contacts[0].Name,
          };
        }
      }

      // If no match by name and email exists, try to find by email
      if (customer.email) {
        response = await fetch(`${this.apiUrl}/Contacts?where=EmailAddress=="${encodeURIComponent(customer.email)}"`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
            "xero-tenant-id": tenantId,
            "Accept": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.Contacts && data.Contacts.length > 0) {
            return {
              contactID: data.Contacts[0].ContactID,
              name: data.Contacts[0].Name,
            };
          }
        }
      }

      // If still no match and phone exists, try to find by phone
      if (customer.telephone) {
        const phoneSearch = customer.telephone.replace(/\s/g, ''); // Remove spaces for comparison
        response = await fetch(`${this.apiUrl}/Contacts`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
            "xero-tenant-id": tenantId,
            "Accept": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.Contacts) {
            // Search through contacts for matching phone
            const match = data.Contacts.find((contact: any) => {
              const contactPhone = contact.Phones?.find((p: any) => 
                p.PhoneNumber?.replace(/\s/g, '') === phoneSearch
              );
              return !!contactPhone;
            });

            if (match) {
              return {
                contactID: match.ContactID,
                name: match.Name,
              };
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error("Error finding Xero contact:", error);
      return null;
    }
  }

  async createInvoice(job: Job, customer: Customer, unitPrice: number = 0): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error("Xero is not configured");
    }

    const token = await this.getAccessToken();

    // Try to find existing contact in Xero
    const xeroContact = await this.findContact(customer);

    const invoice: XeroInvoice = {
      type: "ACCREC",
      contact: xeroContact 
        ? { contactID: xeroContact.contactID, name: xeroContact.name }
        : { name: customer.name },
      lineItems: [
        {
          description: `${job.jobName} - PO: ${job.poNumber}`,
          quantity: job.quantity,
          unitAmount: unitPrice,
          accountCode: "4002",
          taxType: "OUTPUT2", // 20% VAT on income
          itemCode: "EMB", // Embroidery
        },
      ],
      date: job.goodsReceived ? new Date(job.goodsReceived).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      dueDate: new Date(job.requiredDispatchDate).toISOString().split('T')[0],
      reference: job.poNumber || undefined,
      status: "DRAFT",
    };

    const tenantId = this.getTenantId();

    const response = await fetch(`${this.apiUrl}/Invoices`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "xero-tenant-id": tenantId,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ Invoices: [invoice] }),
    });

    if (!response.ok) {
      throw new Error("Failed to create invoice in Xero. Please check your connection.");
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
    const tenantId = this.getTenantId();

    // Try to find existing contact in Xero
    const xeroContact = await this.findContact(customer);

    // Create line items from job line items
    const xeroLineItems: XeroInvoiceLineItem[] = lineItemsWithPricing.map(item => ({
      description: `${item.jobName}${item.poNumber ? ` (PO: ${item.poNumber})` : ''} - ${item.description}`,
      quantity: item.quantity,
      unitAmount: item.unitPrice,
      accountCode: "4002",
      taxType: "OUTPUT2", // 20% VAT on income
      itemCode: "EMB", // Embroidery
    }));

    // Get the most recent dates for invoice date and due date
    const mostRecentDate = jobs.reduce((latest, job) => {
      const jobDate = job.goodsReceived ? new Date(job.goodsReceived) : new Date();
      return jobDate > latest ? jobDate : latest;
    }, jobs[0].goodsReceived ? new Date(jobs[0].goodsReceived) : new Date());

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
      contact: xeroContact 
        ? { contactID: xeroContact.contactID, name: xeroContact.name }
        : { name: customer.name },
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
        "xero-tenant-id": tenantId,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ Invoices: [invoice] }),
    });

    if (!response.ok) {
      throw new Error("Failed to create invoice in Xero. Please check your connection.");
    }

    return response.json();
  }

  async getInvoices(): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error("Xero is not configured");
    }

    const token = await this.getAccessToken();
    const tenantId = this.getTenantId();

    const response = await fetch(`${this.apiUrl}/Invoices`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "xero-tenant-id": tenantId,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Failed to retrieve invoices from Xero.");
    }

    return response.json();
  }
}

export const xeroService = new XeroService();
