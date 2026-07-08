/**
 * DPD Local API v3.2 integration (api.dpdlocal.co.uk)
 * Auth: Basic login → GeoSession token (cached ~12h).
 *
 * Required env vars: DPD_API_USERNAME, DPD_API_PASSWORD, DPD_ACCOUNT_NUMBER
 * Optional: DPD_SENDER_NAME, DPD_SENDER_LINE1, DPD_SENDER_TOWN,
 *           DPD_SENDER_POSTCODE, DPD_NETWORK_CODE (default "2^12" Parcel Next Day)
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
  parcels: Array<{ weight: number; customerReference?: string }>; // weight in grams
  reference?: string;
  notifyEmail?: string;
}

export interface DpdShipmentResult {
  trackingNumber: string;
  labelHtml: string | null;
  parcelNumbers: string[];
  shipmentJobId: number;
  trackingUrl: string;
}

/**
 * Channel Islands (JE/GY) use UK-style postcodes but sit outside the UK
 * customs territory — DPD requires customsValue + parcelDescription there.
 */
export function isChannelIslandsPostcode(postcode: string | null | undefined): boolean {
  if (!postcode) return false;
  return /^\s*(JE|GY)\d/i.test(postcode.trim());
}

const DPD_BASE = "https://api.dpdlocal.co.uk";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

class DpdService {
  private cachedSession: { token: string; expiresAt: number } | null = null;

  private get username(): string {
    return process.env.DPD_API_USERNAME || "";
  }
  private get password(): string {
    return process.env.DPD_API_PASSWORD || "";
  }
  private get accountNumber(): string {
    return process.env.DPD_ACCOUNT_NUMBER || "";
  }
  private get senderName(): string {
    // Generic by default — labels must not reveal our company details
    return process.env.DPD_SENDER_NAME || "Dispatch";
  }
  private get networkCode(): string {
    return process.env.DPD_NETWORK_CODE || "2^12";
  }

  isConfigured(): boolean {
    return !!(this.username && this.password && this.accountNumber);
  }

  private async login(): Promise<string> {
    if (this.cachedSession && Date.now() < this.cachedSession.expiresAt) {
      return this.cachedSession.token;
    }

    console.log("[DPD] Logging in to DPD Local API...");
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString("base64");
    const res = await fetch(`${DPD_BASE}/user/?action=login`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        GeoClient: `account/${this.accountNumber}`,
      },
    });

    if (res.status === 401) {
      throw new Error("DPD login failed: invalid username or password (HTTP 401)");
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`DPD login failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as { data?: { geoSession?: string } };
    const session = json?.data?.geoSession;
    if (!session) {
      throw new Error(`DPD login succeeded but returned no geoSession. Response: ${JSON.stringify(json)}`);
    }
    this.cachedSession = { token: session, expiresAt: Date.now() + SESSION_TTL_MS };
    return session;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const geoSession = await this.login();
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      GeoClient: `account/${this.accountNumber}`,
      GeoSession: geoSession,
    };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.isConfigured()) {
      return { ok: false, message: "DPD credentials are not configured" };
    }
    try {
      this.cachedSession = null; // force a fresh login for a true test
      await this.login();
      return { ok: true, message: "Connected successfully to DPD Local API. GeoSession token received." };
    } catch (e: any) {
      return { ok: false, message: e?.message || String(e) };
    }
  }

  async createShipment(request: DpdShipmentRequest): Promise<DpdShipmentResult> {
    if (!this.isConfigured()) {
      throw new Error("DPD API credentials are not configured");
    }

    const headers = await this.authHeaders();

    const numberOfParcels = Math.max(1, request.parcels.length);
    const totalWeightGrams = request.parcels.reduce((sum, p) => sum + (p.weight || 0), 0);
    const totalWeightKg = Math.max(0.1, Math.round((totalWeightGrams / 1000) * 100) / 100);

    const street = [request.recipient.houseNo, request.recipient.street].filter(Boolean).join(" ").trim();
    const reference = (request.reference || "").slice(0, 25);
    const channelIslands = isChannelIslandsPostcode(request.recipient.zipCode);

    const collectionDate = new Date().toISOString().split("T")[0] + "T09:00:00";

    const shipmentPayload = {
      jobId: null,
      collectionOnDelivery: false,
      invoice: null,
      collectionDate,
      consolidate: false,
      consignment: [
        {
          consignmentNumber: null,
          consignmentRef: reference,
          parcel: [],
          collectionDetails: {
            contactDetails: {
              contactName: this.senderName,
              telephone: "",
            },
            address: {
              organisation: this.senderName,
              countryCode: "GB",
              postcode: process.env.DPD_SENDER_POSTCODE || "",
              street: process.env.DPD_SENDER_LINE1 || "",
              locality: "",
              town: process.env.DPD_SENDER_TOWN || "",
              county: "",
            },
          },
          deliveryDetails: {
            contactDetails: {
              contactName: request.recipient.name,
              telephone: request.recipient.phone || "",
            },
            address: {
              organisation: request.recipient.name,
              countryCode: request.recipient.country || "GB",
              postcode: request.recipient.zipCode,
              street,
              locality: "",
              town: request.recipient.city,
              county: "",
            },
            notificationDetails: {
              email: request.notifyEmail || request.recipient.email || "",
              mobile: request.recipient.phone || "",
            },
          },
          networkCode: this.networkCode,
          numberOfParcels,
          totalWeight: totalWeightKg,
          shippingRef1: reference,
          shippingRef2: "",
          shippingRef3: "",
          customsValue: channelIslands ? 50 : null,
          deliveryInstructions: "",
          parcelDescription: channelIslands ? "Branded clothing / embroidered garments" : "",
          liabilityValue: null,
          liability: false,
        },
      ],
    };

    const shipRes = await fetch(`${DPD_BASE}/shipping/shipment`, {
      method: "POST",
      headers,
      body: JSON.stringify(shipmentPayload),
    });

    if (!shipRes.ok) {
      const body = await shipRes.text();
      throw new Error(`DPD shipment booking failed (${shipRes.status}): ${body}`);
    }

    const shipJson = (await shipRes.json()) as {
      data?: {
        jobId?: number;
        shipmentId?: number;
        consignmentDetail?: Array<{ consignmentNumber?: string; parcelNumbers?: string[] }>;
      } | null;
      error?:
        | { errorCode?: number | string; errorMessage?: string }
        | Array<{ errorCode?: number | string; errorMessage?: string }>
        | null;
    };

    const shipError = Array.isArray(shipJson.error) ? shipJson.error[0] : shipJson.error;
    if (shipError?.errorCode) {
      throw new Error(`DPD error ${shipError.errorCode}: ${shipError.errorMessage}`);
    }

    const detail = shipJson.data?.consignmentDetail?.[0];
    const consignmentNumber = (detail?.consignmentNumber ?? "").trim();
    const parcelNumbers = detail?.parcelNumbers ?? [];
    const jobId = shipJson.data?.jobId ?? shipJson.data?.shipmentId ?? 0;

    if (!consignmentNumber) {
      console.error("[DPD] Booking response missing consignment number:", JSON.stringify(shipJson));
      throw new Error("DPD did not return a consignment/tracking number — the shipment was not booked correctly.");
    }

    console.log(`[DPD] Shipment created — consignment: ${consignmentNumber}, jobId: ${jobId}`);

    const labelHtml = jobId ? await this.fetchLabel(jobId) : null;
    if (!jobId) {
      console.error("[DPD] No jobId in shipment response — cannot fetch label:", JSON.stringify(shipJson));
    }

    return {
      trackingNumber: consignmentNumber,
      labelHtml,
      parcelNumbers,
      shipmentJobId: jobId,
      trackingUrl: `https://track.dpdlocal.co.uk/search?reference=${consignmentNumber}&postcode=${encodeURIComponent(request.recipient.zipCode)}`,
    };
  }

  async fetchLabel(shipmentJobId: number): Promise<string | null> {
    try {
      const headers = await this.authHeaders();
      const res = await fetch(`${DPD_BASE}/shipping/shipment/${shipmentJobId}/label/`, {
        headers: { ...headers, Accept: "text/html" },
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`[DPD] Label fetch failed (${res.status}): ${body}`);
        return null;
      }
      const html = await res.text();
      console.log(`[DPD] Label fetched for jobId ${shipmentJobId} (${html.length} chars)`);
      return html;
    } catch (e: any) {
      console.error(`[DPD] Label fetch exception: ${e?.message || e}`);
      return null;
    }
  }
}

export const dpdService = new DpdService();
