// Thai Baht money helpers. Amounts are stored as integer *satang* (minor units) per the house
// money rule — never a float. Parse user baht input → satang; format satang → ฿ for display.

const baht = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 2,
});

// User types baht ("25", "25.50"). Round to the nearest satang. Returns null on empty/non-numeric
// input so the caller can surface a validation error instead of storing NaN.
export function parseBahtToSatang(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

// satang (integer minor units) → "฿25.50".
export function formatSatang(satang: number): string {
  return baht.format(satang / 100);
}
