export type PricingTable = "2025" | "2026";
export type PrintSize = "A6" | "A5" | "A4" | "A3";

export interface PricingTier {
  minQty: number;
  maxQty: number | null; // null means unlimited
  prices: {
    maxStitches: number | null; // null means unlimited
    price: number | "POA"; // Price on Application
  }[];
}

export interface PrintPricingTier {
  minQty: number;
  maxQty: number | null; // null means unlimited
  prices: {
    A6: number;
    A5: number;
    A4: number;
    A3: number;
  };
}

// Print size to numeric code mapping (stored in stitchCount field for print jobs)
export const PRINT_SIZE_CODE = {
  A6: 1,
  A5: 2,
  A4: 3,
  A3: 4,
} as const;

export const CODE_TO_PRINT_SIZE = {
  1: "A6",
  2: "A5",
  3: "A4",
  4: "A3",
} as const;

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
      { maxStitches: null, price: "POA" },
    ],
  },
];

// Print Pricing Tables
export const PRINT_PRICING_2025: PrintPricingTier[] = [
  {
    minQty: 0,
    maxQty: 49,
    prices: {
      A6: 1.50,
      A5: 1.75,
      A4: 2.00,
      A3: 2.50,
    },
  },
  {
    minQty: 50,
    maxQty: 99,
    prices: {
      A6: 1.25,
      A5: 1.50,
      A4: 1.75,
      A3: 2.00,
    },
  },
  {
    minQty: 100,
    maxQty: null,
    prices: {
      A6: 1.00,
      A5: 1.25,
      A4: 1.50,
      A3: 1.75,
    },
  },
];

export const PRINT_PRICING_2026: PrintPricingTier[] = [
  {
    minQty: 0,
    maxQty: 49,
    prices: {
      A6: 1.75,
      A5: 2.00,
      A4: 2.50,
      A3: 3.50,
    },
  },
  {
    minQty: 50,
    maxQty: 99,
    prices: {
      A6: 1.50,
      A5: 1.75,
      A4: 2.00,
      A3: 2.50,
    },
  },
  {
    minQty: 100,
    maxQty: null,
    prices: {
      A6: 1.25,
      A5: 1.50,
      A4: 1.75,
      A3: 2.00,
    },
  },
];

export interface PriceLookupResult {
  unitPrice: number | "POA";
  totalPrice: number | "POA";
  tier: string;
  stitchRange: string;
}

export interface PrintPriceLookupResult {
  unitPrice: number;
  totalPrice: number;
  tier: string;
  printSize: string;
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

export function getPrintPrice(
  quantity: number,
  printSizeCode: number,
  pricingTable: PricingTable = "2026"
): PrintPriceLookupResult {
  const tiers = pricingTable === "2026" ? PRINT_PRICING_2026 : PRINT_PRICING_2025;
  
  // Find the quantity tier
  const tier = tiers.find(
    (t) => quantity >= t.minQty && (t.maxQty === null || quantity <= t.maxQty)
  );

  if (!tier) {
    throw new Error(`No print pricing tier found for quantity ${quantity}`);
  }

  // Get print size from code
  const printSize = CODE_TO_PRINT_SIZE[printSizeCode as keyof typeof CODE_TO_PRINT_SIZE];
  
  if (!printSize) {
    throw new Error(`Invalid print size code: ${printSizeCode}`);
  }

  const unitPrice = tier.prices[printSize];
  const totalPrice = unitPrice * quantity;

  const tierLabel = tier.maxQty === null 
    ? `${tier.minQty}+`
    : `${tier.minQty}-${tier.maxQty}`;

  return {
    unitPrice,
    totalPrice: parseFloat(totalPrice.toFixed(2)),
    tier: tierLabel,
    printSize,
  };
}

export interface FlatRatePriceLookupResult {
  unitPrice: number;
  totalPrice: number;
  tier: string;
  jobType: string;
}

export function getFlatRatePrice(
  quantity: number,
  jobType: string
): FlatRatePriceLookupResult {
  const unitPrice = 2.50;
  const totalPrice = unitPrice * quantity;

  return {
    unitPrice,
    totalPrice: parseFloat(totalPrice.toFixed(2)),
    tier: "Flat Rate",
    jobType,
  };
}

export function getBaggingPrice(
  quantity: number,
  pricingTable: PricingTable = "2026"
): FlatRatePriceLookupResult {
  // 30p for 2025 table, 40p for 2026 table
  const unitPrice = pricingTable === "2025" ? 0.30 : 0.40;
  const totalPrice = unitPrice * quantity;

  return {
    unitPrice,
    totalPrice: parseFloat(totalPrice.toFixed(2)),
    tier: "Flat Rate",
    jobType: "Bagging",
  };
}

export function calculateJobPrice(
  lineItems: Array<{ quantity: number; stitchCount: number; jobType?: string }>,
  pricingTable: PricingTable = "2026"
): {
  lineItemPrices: (PriceLookupResult | PrintPriceLookupResult | FlatRatePriceLookupResult)[];
  totalPrice: number | "POA";
} {
  const lineItemPrices = lineItems.map((item) => {
    // For bagging (30p or 40p per item based on pricing table)
    if (item.jobType === "Bagging") {
      return getBaggingPrice(item.quantity, pricingTable);
    }
    // For flat-rate job types (£2.50 each)
    if (item.jobType === "Print Initials/Name" || item.jobType === "Embroidery Initials/Name") {
      return getFlatRatePrice(item.quantity, item.jobType);
    }
    // For print jobs, use print pricing
    if (item.jobType === "Print") {
      return getPrintPrice(item.quantity, item.stitchCount, pricingTable);
    }
    // For embroidery and other types, use standard pricing
    return getPrice(item.quantity, item.stitchCount, pricingTable);
  });

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

export interface ShippingCostResult {
  cost: number | "TBA";
  description: string;
}

export function calculateShippingCost(
  packageType: "boxes" | "bags",
  packageCount: number
): ShippingCostResult {
  if (packageType === "bags") {
    return {
      cost: 0,
      description: "1 Bag",
    };
  }

  // Box pricing
  const boxPricing: Record<number, number> = {
    1: 7.50,
    2: 10.00,
    3: 15.00,
    4: 20.00,
  };

  if (packageCount <= 4) {
    return {
      cost: boxPricing[packageCount],
      description: `${packageCount} ${packageCount === 1 ? 'Box' : 'Boxes'}`,
    };
  }

  // More than 4 boxes
  return {
    cost: "TBA",
    description: `${packageCount} Boxes`,
  };
}
