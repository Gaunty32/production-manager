import { and, eq } from "drizzle-orm";
import { customerUsers, customers } from "@shared/schema";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { db } from "./db";

const HIGHLEVEL_BASE_URL = "https://services.leadconnectorhq.com";
const CUSTOMER_TAGS = ["contract embroidery", "contract embroidery customer"];

type SyncContact = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
};

function clean(value: string | null | undefined) {
  return value?.trim() || undefined;
}

function normalizePhone(value: string | null | undefined) {
  const phone = clean(value);
  if (!phone) return undefined;
  const parsed = parsePhoneNumberFromString(phone, "GB");
  return parsed?.isValid() ? parsed.number : undefined;
}

function contactKey(contact: SyncContact) {
  const email = contact.email?.toLowerCase();
  if (email) return `email:${email}`;
  return contact.phone ? `phone:${contact.phone.replace(/\D/g, "")}` : null;
}

async function loadContacts() {
  const [allCustomers, activeUsers] = await Promise.all([
    db.select({
      id: customers.id,
      name: customers.name,
      firstName: customers.contactFirstName,
      lastName: customers.contactLastName,
      email: customers.email,
      phone: customers.telephone,
    }).from(customers),
    db.select({
      email: customerUsers.email,
      firstName: customerUsers.firstName,
      lastName: customerUsers.lastName,
      customerName: customers.name,
      customerPhone: customers.telephone,
    }).from(customerUsers)
      .innerJoin(customers, eq(customerUsers.customerId, customers.id))
      .where(eq(customerUsers.active, true)),
  ]);

  const contacts = new Map<string, SyncContact>();
  let skipped = 0;
  const add = (contact: SyncContact) => {
    const normalized = {
      email: clean(contact.email),
      phone: normalizePhone(contact.phone),
      firstName: clean(contact.firstName),
      lastName: clean(contact.lastName),
      companyName: clean(contact.companyName),
    };
    const key = contactKey(normalized);
    if (!key) {
      skipped += 1;
      return;
    }
    const existing = contacts.get(key);
    contacts.set(key, existing ? {
      email: existing.email || normalized.email,
      phone: existing.phone || normalized.phone,
      firstName: normalized.firstName || existing.firstName,
      lastName: normalized.lastName || existing.lastName,
      companyName: existing.companyName || normalized.companyName,
    } : normalized);
  };

  allCustomers.forEach((customer) => add({
    email: customer.email || undefined,
    phone: customer.phone || undefined,
    firstName: customer.firstName || undefined,
    lastName: customer.lastName || undefined,
    companyName: customer.name,
  }));
  activeUsers.forEach((user) => add({
    email: user.email,
    phone: user.customerPhone || undefined,
    firstName: user.firstName || undefined,
    lastName: user.lastName || undefined,
    companyName: user.customerName,
  }));

  return { contacts: [...contacts.values()], skipped };
}

async function parseResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function responseReason(body: any, fallback: string) {
  const reason = body?.message || body?.error || body?.msg;
  return typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 240) : fallback;
}

async function highLevelRequest(url: string, init: RequestInit) {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
    lastResponse = response;
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) ? retryAfter * 1000 : 750 * (attempt + 1)));
    }
  }
  return lastResponse!;
}

export async function syncCustomersToHighLevel() {
  const apiToken = process.env.HIGHLEVEL_API_TOKEN2?.trim().replace(/^Bearer\s+/i, "");
  const locationId = process.env.HIGHLEVEL_LOCATION_ID2?.trim();
  if (!apiToken || !locationId) throw new Error("HighLevel contact sync is not configured.");

  const { contacts, skipped } = await loadContacts();
  const headers = {
    Authorization: `Bearer ${apiToken}`,
    Version: "v3",
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  let synced = 0;
  const failures: Array<{ status: number; stage: "contact" | "tags"; reason: string }> = [];

  for (let index = 0; index < contacts.length; index += 4) {
    const batch = contacts.slice(index, index + 4);
    await Promise.all(batch.map(async (contact) => {
      try {
        const contactResponse = await highLevelRequest(`${HIGHLEVEL_BASE_URL}/contacts/upsert`, {
          method: "POST",
          headers,
          body: JSON.stringify({ ...contact, locationId, source: "Select Branding Solutions customer portal" }),
        });
        const contactBody = await parseResponse(contactResponse);
        const contactId = contactBody?.contact?.id || contactBody?.id;
        if (!contactResponse.ok || !contactId) {
          failures.push({
            status: contactResponse.status,
            stage: "contact",
            reason: responseReason(contactBody, "HighLevel rejected the contact"),
          });
          return;
        }
        const tagResponse = await highLevelRequest(`${HIGHLEVEL_BASE_URL}/contacts/${encodeURIComponent(contactId)}/tags`, {
          method: "POST",
          headers,
          body: JSON.stringify({ tags: CUSTOMER_TAGS }),
        });
        const tagBody = await parseResponse(tagResponse);
        if (!tagResponse.ok) {
          failures.push({
            status: tagResponse.status,
            stage: "tags",
            reason: responseReason(tagBody, "HighLevel rejected the tags"),
          });
          return;
        }
        synced += 1;
      } catch {
        failures.push({ status: 0, stage: "contact", reason: "HighLevel request timed out or could not connect" });
      }
    }));
    if (index + 4 < contacts.length) await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return {
    total: contacts.length,
    synced,
    skipped,
    failed: failures.length,
    failures: Object.values(failures.reduce<Record<string, { status: number; stage: "contact" | "tags"; reason: string; count: number }>>((groups, failure) => {
      const key = `${failure.stage}:${failure.status}:${failure.reason}`;
      groups[key] = groups[key]
        ? { ...groups[key], count: groups[key].count + 1 }
        : { ...failure, count: 1 };
      return groups;
    }, {})).slice(0, 20),
    tags: CUSTOMER_TAGS,
  };
}