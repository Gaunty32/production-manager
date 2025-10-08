// Generate consistent, accessible pastel colors for customers
// Uses a hash function to ensure the same customer always gets the same color

const PASTEL_COLORS = [
  { bg: "bg-blue-100 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-900/50" },
  { bg: "bg-purple-100 dark:bg-purple-950/30", border: "border-purple-200 dark:border-purple-900/50" },
  { bg: "bg-pink-100 dark:bg-pink-950/30", border: "border-pink-200 dark:border-pink-900/50" },
  { bg: "bg-green-100 dark:bg-green-950/30", border: "border-green-200 dark:border-green-900/50" },
  { bg: "bg-yellow-100 dark:bg-yellow-950/30", border: "border-yellow-200 dark:border-yellow-900/50" },
  { bg: "bg-orange-100 dark:bg-orange-950/30", border: "border-orange-200 dark:border-orange-900/50" },
  { bg: "bg-teal-100 dark:bg-teal-950/30", border: "border-teal-200 dark:border-teal-900/50" },
  { bg: "bg-cyan-100 dark:bg-cyan-950/30", border: "border-cyan-200 dark:border-cyan-900/50" },
  { bg: "bg-indigo-100 dark:bg-indigo-950/30", border: "border-indigo-200 dark:border-indigo-900/50" },
  { bg: "bg-rose-100 dark:bg-rose-950/30", border: "border-rose-200 dark:border-rose-900/50" },
  { bg: "bg-emerald-100 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-900/50" },
  { bg: "bg-amber-100 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-900/50" },
];

// Simple hash function to convert string to number
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export function getCustomerColor(customerId: string): { bg: string; border: string } {
  const hash = hashString(customerId);
  const index = hash % PASTEL_COLORS.length;
  return PASTEL_COLORS[index];
}

export function getCustomerColorClasses(customerId: string): string {
  const color = getCustomerColor(customerId);
  return `${color.bg} ${color.border} border-l-4`;
}
