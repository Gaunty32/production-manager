export type PricingTable = "2025" | "2026";

export interface PricingTier {
  minQty: number;
  maxQty: number | null; // null means unlimited
  prices: {
    maxStitches: number | null; // null means unlimited
    price: number | "POA"; // Price on Application
  }[];
}

export const PRICING_2025: PricingTier[] = [
  {
    minQty: 1,
    maxQty: 15,
    prices: [
      { maxStitches: 3000, price: 1.25 },
      { maxStitches: 5000, price: 1.35 },
      { maxStitches: 7500, price: 1.45 },
      { maxStitches: 10000, price: 1.55 },
      { maxStitches: 15000, price: 1.75 },
      { maxStitches: 20000, price: 1.95 },
      { maxStitches: 25000, price: 2.50 },
      { maxStitches: 50000, price: 5.00 },
      { maxStitches: null, price: "POA" },
    ],
  },
  {
    minQty: 16,
    maxQty: 99,
    prices: [
      { maxStitches: 3000, price: 1.15 },
      { maxStitches: 5000, price: 1.25 },
      { maxStitches: 7500, price: 1.35 },
      { maxStitches: 10000, price: 1.45 },
      { maxStitches: 15000, price: 1.65 },
      { maxStitches: 20000, price: 1.75 },
      { maxStitches: 25000, price: 1.95 },
      { maxStitches: 50000, price: 5.00 },
      { maxStitches: null, price: "POA" },
    ],
  },
  {
    minQty: 100,
    maxQty: 299,
    prices: [
      { maxStitches: 3000, price: 1.05 },
      { maxStitches: 5000, price: 1.15 },
      { maxStitches: 7500, price: 1.25 },
      { maxStitches: 10000, price: 1.35 },
      { maxStitches: 15000, price: 1.55 },
      { maxStitches: 20000, price: 1.65 },
      { maxStitches: 25000, price: 1.75 },
      { maxStitches: 50000, price: 5.00 },
      { maxStitches: null, price: "POA" },
    ],
  },
  {
    minQty: 300,
    maxQty: 599,
    prices: [
      { maxStitches: 3000, price: 0.95 },
      { maxStitches: 5000, price: 1.05 },
      { maxStitches: 7500, price: 1.15 },
      { maxStitches: 10000, price: 1.25 },
      { maxStitches: 15000, price: 1.45 },
      { maxStitches: 20000, price: 1.55 },
      { maxStitches: 25000, price: 1.65 },
      { maxStitches: 50000, price: 5.00 },
      { maxStitches: null, price: "POA" },
    ],
  },
  {
    minQty: 600,
    maxQty: 999,
    prices: [
      { maxStitches: 3000, price: 0.85 },
      { maxStitches: 5000, price: 0.95 },
      { maxStitches: 7500, price: 1.05 },
      { maxStitches: 10000, price: 1.15 },
      { maxStitches: 15000, price: 1.35 },
      { maxStitches: 20000, price: 1.45 },
      { maxStitches: 25000, price: 1.55 },
      { maxStitches: 50000, price: 5.00 },
      { maxStitches: null, price: "POA" },
    ],
  },
  {
    minQty: 1000,
    maxQty: null,
    prices: [
      { maxStitches: 3000, price: 0.75 },
      { maxStitches: 5000, price: 0.85 },
      { maxStitches: 7500, price: 0.95 },
      { maxStitches: 10000, price: 1.05 },
      { maxStitches: 15000, price: 1.25 },
      { maxStitches: 20000, price: 1.35 },
      { maxStitches: 25000, price: 1.45 },
      { maxStitches: 50000, price: 5.00 },
      { maxStitches: null, price: "POA" },
    ],
  },
];

export const PRICING_2026: PricingTier[] = [
  {
    minQty: 1,
    maxQty: 6,
    prices: [
      { maxStitches: 5000, price: 2.10 },
      { maxStitches: 7500, price: 2.20 },
      { maxStitches: 10000, price: 2.30 },
      { maxStitches: 15000, price: 2.40 },
      { maxStitches: 20000, price: 2.50 },
      { maxStitches: 25000, price: 5.00 },
      { maxStitches: 35000, price: 7.50 },
      { maxStitches: 50000, price: 10.00 },
      { maxStitches: null, price: "POA" },
    ],
  },
  {
    minQty: 7,
    maxQty: 99,
    prices: [
      { maxStitches: 5000, price: 1.45 },
      { maxStitches: 7500, price: 1.55 },
      { maxStitches: 10000, price: 1.75 },
      { maxStitches: 15000, price: 1.95 },
      { maxStitches: 20000, price: 2.25 },
      { maxStitches: 25000, price: 2.50 },
      { maxStitches: 35000, price: 3.75 },
      { maxStitches: 50000, price: 6.00 },
      { maxStitches: null, price: "POA" },
    ],
  },
  {
    minQty: 100,
    maxQty: 299,
    prices: [
      { maxStitches: 5000, price: 1.35 },
      { maxStitches: 7500, price: 1.45 },
      { maxStitches: 10000, price: 1.55 },
      { maxStitches: 15000, price: 1.75 },
      { maxStitches: 20000, price: 1.95 },
      { maxStitches: 25000, price: 2.25 },
      { maxStitches: 35000, price: 3.00 },
      { maxStitches: 50000, price: 5.00 },
      { maxStitches: null, price: "POA" },
    ],
  },
  {
    minQty: 300,
    maxQty: 599,
    prices: [
      { maxStitches: 5000, price: 1.15 },
      { maxStitches: 7500, price: 1.35 },
      { maxStitches: 10000, price: 1.45 },
      { maxStitches: 15000, price: 1.55 },
      { maxStitches: 20000, price: 1.75 },
      { maxStitches: 25000, price: 1.95 },
      { maxStitches: 35000, price: 2.50 },
      { maxStitches: 50000, price: 3.00 },
      { maxStitches: null, price: "POA" },
    ],
  },
  {
    minQty: 600,
    maxQty: 999,
    prices: [
      { maxStitches: 5000, price: 1.05 },
      { maxStitches: 7500, price: 1.15 },
      { maxStitches: 10000, price: 1.35 },
      { maxStitches: 15000, price: 1.45 },
      { maxStitches: 20000, price: 1.55 },
      { maxStitches: 25000, price: 1.75 },
      { maxStitches: 35000, price: 2.25 },
      { maxStitches: 50000, price: 2.50 },
      { maxStitches: null, price: "POA" },
    ],
  },
  {
    minQty: 1000,
    maxQty: null,
    prices: [
      { maxStitches: 5000, price: 0.95 },
      { maxStitches: 7500, price: 1.05 },
      { maxStitches: 10000, price: 1.25 },
      { maxStitches: 15000, price: 1.35 },
      { maxStitches: 20000, price: 1.45 },
      { maxStitches: 25000, price: 1.65 },
      { maxStitches: 35000, price: 2.15 },
      { maxStitches: 50000, price: 2.40 },
      { maxStitches: null, price: "POA" },
    ],
  },
];

export interface PriceLookupResult {
  unitPrice: number | "POA";
  totalPrice: number | "POA";
  tier: string;
  stitchRange: string;
}

export function getPrice(
  quantity: number,
  stitchCount: number,
  pricingTable: PricingTable = "2026"
): PriceLookupResult {
  const tiers = pricingTable === "2026" ? PRICING_2026 : PRICING_2025;

  // Find the quantity tier
  const tier = tiers.find(
    (t) => quantity >= t.minQty && (t.maxQty === null || quantity <= t.maxQty)
  );

  if (!tier) {
    throw new Error(`No pricing tier found for quantity ${quantity}`);
  }

  // Find the stitch count price (strict less than for upper bounds)
  const priceEntry = tier.prices.find(
    (p) => p.maxStitches === null || stitchCount < p.maxStitches
  );

  if (!priceEntry) {
    throw new Error(`No price found for stitch count ${stitchCount}`);
  }

  const tierLabel = `${tier.minQty}-${tier.maxQty || "999+"}`;
  const stitchRangeLabel = priceEntry.maxStitches
    ? `<${priceEntry.maxStitches.toLocaleString()}`
    : "50,000+";

  if (priceEntry.price === "POA") {
    return {
      unitPrice: "POA",
      totalPrice: "POA",
      tier: tierLabel,
      stitchRange: stitchRangeLabel,
    };
  }

  const totalPrice = priceEntry.price * quantity;

  return {
    unitPrice: priceEntry.price,
    totalPrice: parseFloat(totalPrice.toFixed(2)),
    tier: tierLabel,
    stitchRange: stitchRangeLabel,
  };
}

export function formatPrice(price: number | "POA"): string {
  if (price === "POA") {
    return "POA";
  }
  return `£${price.toFixed(2)}`;
}

export function calculateJobPrice(
  lineItems: Array<{ quantity: number; stitchCount: number }>,
  pricingTable: PricingTable = "2026"
): {
  lineItemPrices: PriceLookupResult[];
  totalPrice: number | "POA";
} {
  const lineItemPrices = lineItems.map((item) =>
    getPrice(item.quantity, item.stitchCount, pricingTable)
  );

  // If any line item is POA, the whole job is POA
  const hasPOA = lineItemPrices.some((item) => item.totalPrice === "POA");

  if (hasPOA) {
    return {
      lineItemPrices,
      totalPrice: "POA",
    };
  }

  const totalPrice = lineItemPrices.reduce(
    (sum, item) => sum + (item.totalPrice as number),
    0
  );

  return {
    lineItemPrices,
    totalPrice: parseFloat(totalPrice.toFixed(2)),
  };
}
