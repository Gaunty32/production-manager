import { and, eq } from "drizzle-orm";
import { customerUsers, customers } from "@shared/schema";
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
      phone: clean(contact.phone),
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
  const failures: Array<{ status: number; stage: "contact" | "tags" }> = [];

  for (let index = 0; index < contacts.length; index += 4) {
    const batch = contacts.slice(index, index + 4);
    await Promise.all(batch.map(async (contact) => {
      try {
        const contactResponse = await fetch(`${HIGHLEVEL_BASE_URL}/contacts/upsert`, {
          method: "POST",
          headers,
          body: JSON.stringify({ ...contact, locationId, source: "Select Branding Solutions customer portal" }),
          signal: AbortSignal.timeout(12000),
        });
        const contactBody = await parseResponse(contactResponse);
        const contactId = contactBody?.contact?.id || contactBody?.id;
        if (!contactResponse.ok || !contactId) {
          failures.push({ status: contactResponse.status, stage: "contact" });
          return;
        }
        const tagResponse = await fetch(`${HIGHLEVEL_BASE_URL}/contacts/${encodeURIComponent(contactId)}/tags`, {
          method: "POST",
          headers,
          body: JSON.stringify({ tags: CUSTOMER_TAGS }),
          signal: AbortSignal.timeout(12000),
        });
        await tagResponse.text();
        if (!tagResponse.ok) {
          failures.push({ status: tagResponse.status, stage: "tags" });
          return;
        }
        synced += 1;
      } catch {
        failures.push({ status: 0, stage: "contact" });
      }
    }));
    if (index + 4 < contacts.length) await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return {
    total: contacts.length,
    synced,
    skipped,
    failed: failures.length,
    failures: failures.slice(0, 20),
    tags: CUSTOMER_TAGS,
  };
}