// Best-effort WhatsApp/SMS messaging via HighLevel (GoHighLevel) v1 REST API.
//
// IMPORTANT: This is fire-and-forget and never throws. Automated sending depends
// on the HighLevel account having a connected WhatsApp/SMS channel. Regardless of
// whether sending succeeds, callers should ALWAYS surface a copyable link in the
// UI as the primary, guaranteed fallback.

const HL_BASE = "https://rest.gohighlevel.com/v1";

function getCreds() {
  return {
    apiKey: process.env.HIGHLEVEL_API_KEY,
    locationId: process.env.HIGHLEVEL_LOCATION_ID,
  };
}

export function isHighLevelConfigured(): boolean {
  const { apiKey, locationId } = getCreds();
  return !!(apiKey && locationId);
}

// Upsert a contact and return its id (or undefined on failure).
async function upsertContact(
  apiKey: string,
  phone: string,
  firstName?: string,
  lastName?: string,
): Promise<string | undefined> {
  try {
    const res = await fetch(`${HL_BASE}/contacts/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone,
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        tags: ["summer-staff"],
        source: "Production Planner — Summer Staff",
      }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 422 typically means the contact already exists; HighLevel returns its id.
      const existingId = body?.contact?.id ?? body?.id ?? body?.meta?.contactId;
      if (existingId) return existingId;
      console.error("[HighLevel] upsertContact failed:", res.status, JSON.stringify(body));
      return undefined;
    }
    return body?.contact?.id ?? body?.id;
  } catch (err) {
    console.error("[HighLevel] upsertContact network error:", err);
    return undefined;
  }
}

/**
 * Attempt to send a WhatsApp (falls back to SMS) message to a phone number.
 * Never throws. Returns true only if HighLevel accepted the message.
 */
export async function sendWhatsApp(
  phone: string,
  message: string,
  opts: { firstName?: string; lastName?: string } = {},
): Promise<boolean> {
  const { apiKey, locationId } = getCreds();
  if (!apiKey || !locationId) {
    console.warn("[HighLevel] Not configured — skipping send. Use the copyable link instead.");
    return false;
  }

  const contactId = await upsertContact(apiKey, phone, opts.firstName, opts.lastName);
  if (!contactId) {
    console.warn("[HighLevel] No contact id — cannot send message. Use the copyable link instead.");
    return false;
  }

  // Try WhatsApp first, then SMS as a fallback channel.
  for (const type of ["WhatsApp", "SMS"]) {
    try {
      const res = await fetch(`${HL_BASE}/conversations/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type, contactId, message }),
      });
      if (res.ok) {
        console.log(`[HighLevel] Sent ${type} to ${phone}`);
        return true;
      }
      const body = await res.text().catch(() => "");
      console.error(`[HighLevel] ${type} send failed:`, res.status, body);
    } catch (err) {
      console.error(`[HighLevel] ${type} send network error:`, err);
    }
  }
  return false;
}

// Fire-and-forget wrapper — schedules the send without blocking the caller.
export function sendWhatsAppAsync(
  phone: string,
  message: string,
  opts: { firstName?: string; lastName?: string } = {},
): void {
  sendWhatsApp(phone, message, opts).catch((err) =>
    console.error("[HighLevel] sendWhatsAppAsync error:", err),
  );
}
