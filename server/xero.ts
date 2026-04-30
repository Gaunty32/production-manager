import type { Job, Customer } from "@shared/schema";
import { storage } from "./storage";

export interface XeroInvoiceLineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode?: string;
  taxType?: string;
  itemCode?: string; // Xero item code (e.g., "Emb", "Carriage")
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

  private async saveTokens(): Promise<void> {
    if (!this.tokens) return;
    try {
      await storage.setAppSetting("xero_tokens", JSON.stringify(this.tokens));
    } catch (e) {
      console.error("Failed to persist Xero tokens:", e);
    }
  }

  async loadTokensFromDb(): Promise<void> {
    try {
      const raw = await storage.getAppSetting("xero_tokens");
      if (raw) {
        const parsed = JSON.parse(raw) as XeroTokens;
        if (parsed.access_token && parsed.refresh_token && parsed.tenant_id) {
          this.tokens = parsed;
          console.log("Xero tokens restored from database");
        }
      }
    } catch (e) {
      console.error("Failed to load Xero tokens from database:", e);
    }
  }

  disconnect(): void {
    console.log("Disconnecting from Xero...");
    this.tokens = null;
    console.log("Xero connection cleared");
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
      
      await this.saveTokens();
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
    await this.saveTokens();
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

      const headers = {
        "Authorization": `Bearer ${token}`,
        "xero-tenant-id": tenantId,
        "Accept": "application/json",
      };

      // 1. If we have a stored Xero Contact ID, use it directly — most reliable
      if (customer.xeroContactId) {
        const response = await fetch(`${this.apiUrl}/Contacts/${customer.xeroContactId}`, {
          method: "GET",
          headers,
        });
        if (response.ok) {
          const data = await response.json();
          const contact = data.Contacts?.[0];
          if (contact) {
            console.log(`✓ Matched Xero contact by stored ID: ${customer.xeroContactId} → ${contact.Name}`);
            return { contactID: contact.ContactID, name: contact.Name };
          }
        }
        // Stored ID didn't work — fall through to search
        console.log(`! Stored xeroContactId ${customer.xeroContactId} not found in Xero, falling back to search`);
      }

      // 2. Exact name match
      const nameWhere = `Name=="${customer.name.replace(/"/g, '\\"')}"`;
      let response = await fetch(`${this.apiUrl}/Contacts?where=${encodeURIComponent(nameWhere)}`, {
        method: "GET",
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.Contacts && data.Contacts.length > 0) {
          console.log(`✓ Matched Xero contact by name: ${customer.name} → ${data.Contacts[0].Name}`);
          return { contactID: data.Contacts[0].ContactID, name: data.Contacts[0].Name };
        }
      }

      // 3. Email match
      if (customer.email) {
        const emailWhere = `EmailAddress=="${customer.email.replace(/"/g, '\\"')}"`;
        response = await fetch(`${this.apiUrl}/Contacts?where=${encodeURIComponent(emailWhere)}`, {
          method: "GET",
          headers,
        });

        if (response.ok) {
          const data = await response.json();
          if (data.Contacts && data.Contacts.length > 0) {
            console.log(`✓ Matched Xero contact by email: ${customer.email} → ${data.Contacts[0].Name}`);
            return { contactID: data.Contacts[0].ContactID, name: data.Contacts[0].Name };
          }
        }
      }

      // 4. searchTerm fallback — Xero's own fuzzy search (handles spelling/case differences)
      const searchTerm = customer.name.split(/\s+/).slice(0, 2).join(" "); // first two words
      if (searchTerm.length >= 3) {
        response = await fetch(
          `${this.apiUrl}/Contacts?searchTerm=${encodeURIComponent(searchTerm)}&includeArchived=false`,
          { method: "GET", headers }
        );

        if (response.ok) {
          const data = await response.json();
          const contacts: any[] = data.Contacts || [];
          if (contacts.length > 0) {
            // Pick the closest match by normalising both names
            const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
            const customerNorm = normalise(customer.name);
            const match = contacts.find(c => normalise(c.Name).includes(customerNorm) || customerNorm.includes(normalise(c.Name)));
            const best = match || contacts[0];
            console.log(`✓ Matched Xero contact by searchTerm "${searchTerm}" → ${best.Name}`);
            return { contactID: best.ContactID, name: best.Name };
          }
        }
      }

      console.log(`✗ No Xero contact match found for: ${customer.name}`);
      return null;
    } catch (error) {
      console.error("Error finding Xero contact:", error);
      return null;
    }
  }

  // Create a new contact in Xero using customer details from our system
  async createContact(customer: Customer): Promise<{ contactID: string; name: string } | null> {
    if (!this.isConfigured() || !this.isConnected()) return null;

    try {
      const token = await this.getAccessToken();
      const tenantId = this.getTenantId();

      const contactPayload: any = { Name: customer.name };
      if (customer.contactFirstName) contactPayload.FirstName = customer.contactFirstName;
      if (customer.contactLastName) contactPayload.LastName = customer.contactLastName;
      if (customer.email) contactPayload.EmailAddress = customer.email;
      if (customer.telephone) {
        contactPayload.Phones = [{ PhoneType: "DEFAULT", PhoneNumber: customer.telephone }];
      }
      if (customer.address) contactPayload.Addresses = [{ AddressType: "STREET", AttentionTo: customer.name, City: customer.address }];

      const response = await fetch(`${this.apiUrl}/Contacts`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "xero-tenant-id": tenantId,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ Contacts: [contactPayload] }),
      });

      if (!response.ok) {
        console.error("Failed to create Xero contact:", await response.text());
        return null;
      }

      const data = await response.json();
      const created = data.Contacts?.[0];
      if (created) {
        console.log(`✓ Created new Xero contact: ${created.Name} (${created.ContactID})`);
        return { contactID: created.ContactID, name: created.Name };
      }
      return null;
    } catch (error) {
      console.error("Error creating Xero contact:", error);
      return null;
    }
  }

  // Update an existing Xero contact with current details (name, phone, address)
  async updateContact(contactID: string, customer: Customer): Promise<void> {
    if (!this.isConfigured() || !this.isConnected()) return;
    try {
      const token = await this.getAccessToken();
      const tenantId = this.getTenantId();
      const updatePayload: any = { ContactID: contactID, Name: customer.name };
      if (customer.contactFirstName) updatePayload.FirstName = customer.contactFirstName;
      if (customer.contactLastName) updatePayload.LastName = customer.contactLastName;
      if (customer.email) updatePayload.EmailAddress = customer.email;
      const response = await fetch(`${this.apiUrl}/Contacts/${contactID}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "xero-tenant-id": tenantId,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ Contacts: [updatePayload] }),
      });
      if (!response.ok) {
        console.error("Failed to update Xero contact:", await response.text());
      } else {
        console.log(`✓ Updated Xero contact details for: ${customer.name} (${contactID})`);
      }
    } catch (error) {
      console.error("Error updating Xero contact:", error);
    }
  }

  // Find an existing Xero contact or create one if not found
  // Also syncs first/last name to existing contacts when available
  async findOrCreateContact(customer: Customer): Promise<{ contactID: string; name: string } | null> {
    const existing = await this.findContact(customer);
    if (existing) {
      // Sync name details if we have them — fire-and-forget
      if (customer.contactFirstName || customer.contactLastName) {
        this.updateContact(existing.contactID, customer).catch((e) =>
          console.error("Non-fatal: failed to sync Xero contact name:", e)
        );
      }
      return existing;
    }
    console.log(`Creating new Xero contact for: ${customer.name}`);
    return this.createContact(customer);
  }

  // Determine the sales account code based on customer name
  private getSalesAccountCode(customerName: string): string {
    // PC Sports uses a dedicated sales account
    if (customerName.toLowerCase().includes("pc sports")) {
      return "4006";
    }
    return "4002";
  }

  // Build Xero line items from priced items, applying the correct account code
  private buildXeroLineItems(
    lineItemsWithPricing: Array<{ jobName: string; poNumber: string | null; description: string; quantity: number; unitPrice: number; stitchCount: number; itemCode: string }>,
    accountCode: string
  ): XeroInvoiceLineItem[] {
    return lineItemsWithPricing.map(item => {
      let description = '';

      if (item.itemCode === "CARRIAGE") {
        description = item.description;
      } else if (item.itemCode === "EMB Set-Up") {
        description = item.description;
      } else if (item.itemCode === "Print DTF" || item.itemCode === "PRINT") {
        const positionPart = item.description ? `, ${item.description}` : '';
        description = `${item.jobName}${positionPart}`;
        if (item.poNumber) description += ` (PO: ${item.poNumber})`;
      } else if (item.itemCode === "OTHER" || item.itemCode === "BAG") {
        description = item.description || item.jobName;
        if (item.poNumber) description += ` (PO: ${item.poNumber})`;
      } else {
        // Embroidery: include stitch count
        description = `${item.jobName}, ${item.stitchCount} Stitches`;
        if (item.poNumber) description += ` (PO: ${item.poNumber})`;
      }

      const lineItem: any = {
        description,
        quantity: item.quantity,
        unitAmount: item.unitPrice,
        accountCode,
        taxType: "OUTPUT2", // 20% VAT
      };

      if (item.itemCode === "CARRIAGE") {
        lineItem.itemCode = "Carriage";
      } else if (item.itemCode === "Print DTF") {
        lineItem.itemCode = "DTF";
      } else if (item.itemCode === "Emb" || item.itemCode === "BAG") {
        lineItem.itemCode = item.itemCode;
      }
      // EMB Set-Up: no itemCode (not a recognised Xero inventory item)

      return lineItem;
    });
  }

  async createInvoice(
    job: Job, 
    customer: Customer, 
    lineItemsWithPricing: Array<{ jobName: string; poNumber: string | null; description: string; quantity: number; unitPrice: number; stitchCount: number; itemCode: string }>
  ): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error("Xero is not configured");
    }

    const token = await this.getAccessToken();

    // Find existing Xero contact or create a new one with customer details
    const xeroContact = await this.findOrCreateContact(customer);

    const accountCode = this.getSalesAccountCode(customer.name);
    const xeroLineItems = this.buildXeroLineItems(lineItemsWithPricing, accountCode);

    const invoice: XeroInvoice = {
      type: "ACCREC",
      contact: xeroContact 
        ? { contactID: xeroContact.contactID, name: xeroContact.name }
        : { name: customer.name },
      lineItems: xeroLineItems,
      date: job.goodsReceived ? new Date(job.goodsReceived).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      dueDate: job.requiredDispatchDate ? new Date(job.requiredDispatchDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
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
    lineItemsWithPricing: Array<{ jobName: string; poNumber: string | null; description: string; quantity: number; unitPrice: number; stitchCount: number; itemCode: string }>
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

    // Find existing Xero contact or create a new one with customer details
    const xeroContact = await this.findOrCreateContact(customer);

    const accountCode = this.getSalesAccountCode(customer.name);
    const xeroLineItems = this.buildXeroLineItems(lineItemsWithPricing, accountCode);

    // Helper function: Get the most recent Friday (last Friday or today if it's Friday)
    const getLastFriday = (): Date => {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = Sunday, 5 = Friday
      
      // If today is Friday (5), use today
      if (dayOfWeek === 5) {
        return new Date(today.getFullYear(), today.getMonth(), today.getDate());
      }
      
      // Otherwise, calculate days back to last Friday
      // Saturday (6) -> 1 day back, Sunday (0) -> 2 days back, etc.
      const daysToSubtract = dayOfWeek === 6 ? 1 : (dayOfWeek + 2);
      const lastFriday = new Date(today);
      lastFriday.setDate(today.getDate() - daysToSubtract);
      
      return new Date(lastFriday.getFullYear(), lastFriday.getMonth(), lastFriday.getDate());
    };

    // Calculate invoice date as the last Friday (end of week invoicing)
    const invoiceDate = getLastFriday();
    
    // Calculate due date as 14 days from invoice date
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + 14);

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
      date: invoiceDate.toISOString().split('T')[0],
      dueDate: dueDate.toISOString().split('T')[0],
      reference: poNumbers || undefined,
      status: "DRAFT",
    };

    const payload = { Invoices: [invoice] };
    
    console.log("=== XERO INVOICE CREATION ===");
    console.log("Sending invoice to Xero for customer:", customer.name);
    console.log("Line items count:", xeroLineItems.length);
    console.log("Line items:", JSON.stringify(xeroLineItems, null, 2));
    
    const response = await fetch(`${this.apiUrl}/Invoices`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "xero-tenant-id": tenantId,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("=== XERO API ERROR ===");
      console.error("Status:", response.status);
      console.error("Response:", errorText);
      
      // Try to parse the error response
      let errorMessage = "Failed to create invoice in Xero";
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.Elements && errorData.Elements[0]?.ValidationErrors) {
          const validationErrors = errorData.Elements[0].ValidationErrors;
          errorMessage = validationErrors.map((e: any) => e.Message).join("; ");
        } else if (errorData.Message) {
          errorMessage = errorData.Message;
        }
      } catch (e) {
        // If parsing fails, use the raw error text
        errorMessage = errorText || errorMessage;
      }
      
      console.error("Parsed error:", errorMessage);
      console.error("======================");
      throw new Error(errorMessage);
    }

    console.log("Invoice created successfully!");
    console.log("=============================");
    return response.json();
  }

  async getInvoicesForContact(contactId: string): Promise<Array<{
    InvoiceID: string;
    InvoiceNumber: string;
    Date: string;
    DueDate: string;
    Status: string;
    SubTotal: number;
    TotalTax: number;
    Total: number;
    AmountDue: number;
    AmountPaid: number;
    Reference: string;
    CurrencyCode: string;
  }>> {
    if (!this.isConfigured() || !this.isConnected()) return [];

    const token = await this.getAccessToken();
    const tenantId = this.getTenantId();

    const params = new URLSearchParams({
      ContactIDs: contactId,
      order: "Date DESC",
      Statuses: "DRAFT,SUBMITTED,AUTHORISED,PAID,VOIDED",
    });

    const response = await fetch(`${this.apiUrl}/Invoices?${params}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "xero-tenant-id": tenantId,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      console.error("Failed to fetch Xero invoices for contact", contactId);
      return [];
    }

    const data = await response.json();
    return (data.Invoices || []).filter((inv: any) => inv.Type === "ACCREC");
  }

  async streamInvoicePdf(invoiceId: string): Promise<Response> {
    if (!this.isConfigured() || !this.isConnected()) {
      throw new Error("Xero not connected");
    }

    const token = await this.getAccessToken();
    const tenantId = this.getTenantId();

    return fetch(`${this.apiUrl}/Invoices/${invoiceId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "xero-tenant-id": tenantId,
        "Accept": "application/pdf",
      },
    });
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

  // Fetch specific invoices by their invoice numbers (batched)
  async getInvoicesByNumbers(invoiceNumbers: string[]): Promise<Array<{ InvoiceNumber: string; SubTotal: number; Total: number; Status: string }>> {
    if (!this.isConfigured()) {
      throw new Error("Xero is not configured");
    }
    if (invoiceNumbers.length === 0) return [];

    const token = await this.getAccessToken();
    const tenantId = this.getTenantId();

    const allInvoices: Array<{ InvoiceNumber: string; SubTotal: number; Total: number; Status: string }> = [];

    // Xero allows up to 100 invoice numbers per request
    const BATCH_SIZE = 100;
    for (let i = 0; i < invoiceNumbers.length; i += BATCH_SIZE) {
      const batch = invoiceNumbers.slice(i, i + BATCH_SIZE);
      const params = new URLSearchParams({ InvoiceNumbers: batch.join(",") });

      const response = await fetch(`${this.apiUrl}/Invoices?${params}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "xero-tenant-id": tenantId,
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`Xero invoice fetch failed for batch: ${text}`);
        continue;
      }

      const data = await response.json();
      if (data.Invoices) {
        allInvoices.push(...data.Invoices);
      }
    }

    return allInvoices;
  }
}

export const xeroService = new XeroService();
