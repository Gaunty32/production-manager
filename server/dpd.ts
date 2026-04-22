/**
 * DPD UK Shipping API Service
 * Uses the DPD Web Connect REST API (public-ws.dpd.com)
 * Authentication: login once per day, cache token for 24h
 */

export interface DpdShipmentRequest {
  recipient: {
    name: string;
    street: string;
    houseNo?: string;
    city: string;
    zipCode: string;
    country: string;
    phone?: string;
    email?: string;
  };
  parcels: Array<{ weight: number; customerReference?: string }>;
  reference?: string;
  notifyEmail?: string;
}

export interface DpdShipmentResult {
  trackingNumber: string;
  labelPdfBase64: string;
  parcelNumbers: string[];
}

interface DpdToken {
  token: string;
  depot: string;
  expiresAt: number;
}

const DPD_BASE_URL = "https://public-ws.dpd.com/restservices";
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours (token valid 24h, we refresh 1h early)

class DpdService {
  private cachedToken: DpdToken | null = null;

  private get username(): string {
    return process.env.DPD_API_USERNAME || "";
  }

  private get password(): string {
    return process.env.DPD_API_PASSWORD || "";
  }

  private get accountNumber(): string {
    return process.env.DPD_ACCOUNT_NUMBER || "";
  }

  isConfigured(): boolean {
    return !!(this.username && this.password && this.accountNumber);
  }

  private async getToken(): Promise<DpdToken> {
    // Return cached token if still valid
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken;
    }

    console.log("[DPD] Fetching new auth token...");

    const response = await fetch(`${DPD_BASE_URL}/LoginService/V2_0/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        login: {
          delisId: this.username,
          password: this.password,
          messageLanguage: "en_GB",
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DPD login failed (${response.status}): ${text}`);
    }

    const data = await response.json();

    if (!data.login?.authToken) {
      throw new Error("DPD login response missing authToken");
    }

    this.cachedToken = {
      token: data.login.authToken,
      depot: data.login.depot || "60",
      expiresAt: Date.now() + TOKEN_TTL_MS,
    };

    console.log(`[DPD] Auth token obtained, depot: ${this.cachedToken.depot}`);
    return this.cachedToken;
  }

  async createShipment(req: DpdShipmentRequest): Promise<DpdShipmentResult> {
    if (!this.isConfigured()) {
      throw new Error("DPD API credentials are not configured");
    }

    const tokenData = await this.getToken();

    // Strip spaces from UK postcode for DPD
    const zipCode = req.recipient.zipCode.replace(/\s/g, "").toUpperCase();

    const payload = {
      printOptions: {
        printerLanguage: "PDF",
        paperFormat: "A6",
        startPosition: "UPPER_LEFT",
      },
      order: {
        generalShipmentData: {
          sendingDepot: tokenData.depot,
          product: "CL", // Classic (standard DPD service)
          sender: {
            name1: "Select Branding Solutions",
            street: "Station Road",
            houseNo: "1",
            country: "GB",
            zipCode: "LS279EQ",
            city: "Leeds",
            phone: "01132523838",
            email: "info@selectuniforms.co.uk",
          },
          recipient: {
            name1: req.recipient.name,
            street: req.recipient.street,
            houseNo: req.recipient.houseNo || "1",
            country: req.recipient.country || "GB",
            zipCode: zipCode,
            city: req.recipient.city,
            phone: req.recipient.phone || "",
            email: req.recipient.email || "",
          },
        },
        parcels: req.parcels.map((p) => ({
          weight: p.weight || 1000, // grams
          customerReferenceNumber1: p.customerReference || req.reference || "",
        })),
        productAndServiceData: {
          orderType: "consignment",
          ...(req.notifyEmail ? {
            predict: {
              channel: 1,
              value: req.notifyEmail,
            },
          } : {}),
        },
      },
    };

    console.log("[DPD] Creating shipment for:", req.recipient.name);

    const response = await fetch(`${DPD_BASE_URL}/ShipmentService/V5_2/createShipmentWithLabels`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": tokenData.token,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    if (!response.ok) {
      // Token may have expired — clear cache so next request re-authenticates
      if (response.status === 401 || response.status === 403) {
        this.cachedToken = null;
      }
      throw new Error(`DPD shipment creation failed (${response.status}): ${responseText}`);
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("DPD returned non-JSON response");
    }

    // Extract parcel info from response
    const parcels = data.shipmentResponse?.parcels || [];
    if (!parcels.length) {
      throw new Error("DPD response contained no parcels");
    }

    const firstParcel = parcels[0];
    const trackingNumber = firstParcel.parcelNumber || firstParcel.trackId || "";
    const labelBase64 = firstParcel.label || "";

    if (!trackingNumber) {
      throw new Error("DPD response missing tracking number");
    }

    console.log(`[DPD] Shipment created. Tracking: ${trackingNumber}`);

    return {
      trackingNumber,
      labelPdfBase64: labelBase64,
      parcelNumbers: parcels.map((p: any) => p.parcelNumber || ""),
    };
  }

  invalidateToken() {
    this.cachedToken = null;
  }
}

export const dpdService = new DpdService();
