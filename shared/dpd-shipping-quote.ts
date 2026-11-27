import { z } from "zod";
import { calculateShippingCost } from "./pricing";

export const DPD_QUOTE_VERSION = "2026-03-09-estimate";
export const dpdRegionSchema = z.enum(["uk", "northern_ireland", "highlands", "islands", "isle_of_man", "channel_islands", "isle_of_wight", "scilly"]);
export type DpdRegion = z.infer<typeof dpdRegionSchema>;
export const dpdQuoteInputSchema = z.object({
  postcode: z.string().trim().min(5).max(12),
  region: dpdRegionSchema,
  service: z.enum(["next_day", "two_day"]),
  packageType: z.enum(["boxes", "bags"]),
  packageCount: z.coerce.number().int().min(1).max(50),
  totalWeightKg: z.coerce.number().positive().max(1500),
  dispatchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid dispatch date"),
  // This is an explicit staff allowance, not an inferred contractual rate.
  carriagePerParcel: z.coerce.number().min(0).max(100),
  extraCharges: z.coerce.number().min(0).max(5000).default(0),
  congestion: z.boolean().default(false),
  confirmedTariff: z.boolean().refine(value => value, "Confirm the destination tariff"),
});
export type DpdQuoteInput = z.infer<typeof dpdQuoteInputSchema>;
export type DpdShippingQuote = {
  version: string;
  input: DpdQuoteInput;
  regionLabel: string;
  serviceLabel: string;
  billableWeightKg: number;
  breakdown: { label: string; amount: number }[];
  estimatedDpdCost: number;
  markupPercent: number;
  markupAmount: number;
  customerCharge: number;
  warnings: string[];
  approvedAt?: string;
  approvedBy?: string;
};

export const DPD_REGION_LABELS: Record<DpdRegion, string> = {
  uk: "Standard UK", northern_ireland: "Northern Ireland", highlands: "Scottish Highlands",
  islands: "Scottish Islands", isle_of_man: "Isle of Man", channel_islands: "Channel Islands",
  isle_of_wight: "Isle of Wight", scilly: "Isles of Scilly",
};
export function normaliseDpdPostcode(value: string): string {
  const compact = value.toUpperCase().replace(/\s/g, "");
  return compact.length > 3 ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : compact;
}

export function getOrderPostcodeReview(job: {
  dispatchPostcode?: string | null; deliveryAddressType?: string | null; deliveryAddress?: string | null;
  shippingMethod?: string | null; requestedShippingMethod?: string | null;
}, customerAddress?: string | null) {
  if (job.deliveryAddressType === "collection" ||
    ["customer_collection", "free_local"].includes(job.shippingMethod || job.requestedShippingMethod || "")) return null;
  const address = job.deliveryAddressType === "custom" ? job.deliveryAddress : job.deliveryAddress || customerAddress;
  const postcode = job.dispatchPostcode?.trim() ||
    address?.match(/\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/i)?.[0] || "";
  return { postcode: normaliseDpdPostcode(postcode), ...inspectDpdPostcode(postcode) };
}

// The Scottish service guide describes transit times, not the account's pricing
// boundaries. In particular, a Scottish Two Day route can still use UK pricing.
export function inspectDpdPostcode(value: string): {
  region: DpdRegion | null; warning: string | null; valid: boolean;
} {
  const postcode = normaliseDpdPostcode(value);
  const match = postcode.match(/^([A-Z]{1,2})(\d{1,2})[A-Z]? \d[A-Z]{2}$/);
  if (!match) return { region: null, warning: "Enter a complete UK-format delivery postcode. International destinations need a separate quote.", valid: false };
  const [, area, digits] = match;
  const district = Number(digits);
  const fixed: DpdRegion | undefined = area === "BT" ? "northern_ireland"
    : ["JE", "GY"].includes(area) ? "channel_islands"
    : area === "IM" ? "isle_of_man"
    : area === "PO" && district >= 30 && district <= 41 ? "isle_of_wight"
    : area === "TR" && district >= 21 && district <= 25 ? "scilly" : undefined;
  if (fixed) return { region: fixed, warning: `${DPD_REGION_LABELS[fixed]}: a higher destination tariff applies. Check the service before buying a label.`, valid: true };
  const scottishReview = ["IV", "KW", "HS", "ZE"].includes(area)
    || (area === "AB" && district >= 31 && ![32, 39].includes(district))
    || (area === "FK" && district >= 17 && district <= 21)
    || (area === "KA" && [27, 28].includes(district))
    || (area === "PA" && district >= 20)
    || (area === "PH" && district >= 15);
  if (scottishReview) return {
    region: null, valid: true,
    warning: "Scottish extended-service postcode: verify whether the UK, Highlands or Islands tariff applies. Two Day does not automatically mean an offshore price. The account's Scottish Delivery Zone surcharge is £0.",
  };
  return {
    region: "uk", valid: true,
    warning: ["EC", "WC", "E", "N", "NW", "SE", "SW", "W"].includes(area)
      ? "London postcode: check DPD's congestion-charge applicability. The account rate is £0.95; it is not automatically added for all London postcodes."
      : null,
  };
}

export function dpdServicesForRegion(region: DpdRegion): ("next_day" | "two_day")[] {
  return ["uk", "northern_ireland", "isle_of_wight"].includes(region) ? ["next_day", "two_day"] : ["two_day"];
}
const money = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

export function calculateDpdShippingQuote(raw: DpdQuoteInput): DpdShippingQuote {
  const input = dpdQuoteInputSchema.parse(raw);
  input.postcode = normaliseDpdPostcode(input.postcode);
  const destination = inspectDpdPostcode(input.postcode);
  if (!destination.valid) throw new Error(destination.warning!);
  if (destination.region && destination.region !== input.region) throw new Error("The chosen tariff does not match this delivery postcode.");
  if (!dpdServicesForRegion(input.region).includes(input.service)) throw new Error("This service is not quoted for the selected destination.");
  if (input.dispatchDate < "2026-03-09") throw new Error("This quotation applies from 9 March 2026.");
  if (input.totalWeightKg > input.packageCount * 30) throw new Error("Standard parcels must not exceed 30kg each. Use a separate freight quote.");
  if (input.packageType === "bags" && (input.packageCount !== 1 || input.totalWeightKg > 5 || input.region !== "uk" || input.service !== "next_day")) {
    throw new Error("Automatic bag estimates support one UK Next Day Expresspak up to 5kg only. Use a separate quote for this shipment.");
  }
  const billableWeightKg = Math.ceil(input.totalWeightKg);
  const tariff: Record<DpdRegion, [number, number, number]> = {
    uk: [4.98, 20, 0.20],
    northern_ireland: input.service === "two_day" ? [9, 10, 1.45] : [20, 10, 2.25],
    highlands: [12, 10, 1.17], islands: [12, 10, 1.52],
    isle_of_man: [12, 10, 1.52], channel_islands: [17, 10, 1.52],
    isle_of_wight: [10, 10, 1.12], scilly: [16.60, 10, 1.52],
  };
  const [base, included, additional] = tariff[input.region];
  const carriage = input.packageType === "bags" ? (billableWeightKg <= 1 ? 4.25 : 4.50)
    : money(base + Math.max(0, billableWeightKg - included) * additional);
  const globalEnergy = money(input.packageCount * 0.18);
  const allowance = money(input.packageCount * input.carriagePerParcel);
  const peak = input.dispatchDate >= "2026-11-16" && input.dispatchDate <= "2026-12-31" ? money(input.packageCount * 0.30) : 0;
  const clearance = input.region === "northern_ireland" ? 0.50 : 0;
  const congestion = input.congestion ? 0.95 : 0;
  const fuelRate = input.region === "uk" ? 18.70 : 26.25;
  // Conservative estimating convention, disclosed in every quote. The supplied
  // summary invoices cannot establish DPD's fuel treatment of every surcharge.
  const subtotal = money(carriage + globalEnergy + allowance + peak + clearance + congestion + input.extraCharges);
  const fuel = money(subtotal * fuelRate / 100);
  const estimatedDpdCost = money(subtotal + fuel);
  const markupPercent = input.packageType === "boxes" && input.packageCount > 4 ? 20 : 0;
  const markupAmount = money(estimatedDpdCost * markupPercent / 100);
  const fixed = calculateShippingCost(input.packageType, input.packageCount);
  const customerCharge = typeof fixed.cost === "number" ? fixed.cost : money(estimatedDpdCost + markupAmount);
  const warnings = [
    "Estimate only, excluding VAT. DPD's final measured weight and additional charges may differ.",
    "Weight is rounded up to whole kg. Fuel is conservatively estimated on carriage and all entered surcharges; exact DPD treatment needs consignment-level billing verification.",
    "The carriage surcharge is a staff-entered allowance, not a verified DPD rate. Check it against your account.",
    "Relabelling, third-party collections, non-conveyable and oversize fees are excluded unless entered as extra charges. Each standard parcel must be within DPD's size and 30kg limits.",
  ];
  if (destination.warning) warnings.push(destination.warning);
  if (input.dispatchDate > "2026-12-31") warnings.push("Future fuel, carriage and peak rates need reconfirming; the loaded seasonal dates cover 2026 only.");
  if (markupPercent === 0) warnings.push("Your existing small-shipment customer tariff is unchanged. A destination surcharge is not automatically passed to the customer.");
  return {
    version: DPD_QUOTE_VERSION, input, regionLabel: DPD_REGION_LABELS[input.region],
    serviceLabel: input.service === "two_day" ? "Two Day (islands may take 2–5 days)" : "Next Day",
    billableWeightKg, estimatedDpdCost, markupPercent, markupAmount, customerCharge, warnings,
    breakdown: [
      { label: "Base carriage", amount: carriage },
      { label: "Global energy (£0.18 / parcel)", amount: globalEnergy },
      { label: "Carriage surcharge allowance", amount: allowance },
      { label: "Peak surcharge", amount: peak },
      { label: "NI clearance", amount: clearance },
      { label: "Congestion (if confirmed)", amount: congestion },
      { label: "Other charges entered", amount: input.extraCharges },
      { label: `Fuel allowance (${fuelRate}%)`, amount: fuel },
    ],
  };
}
