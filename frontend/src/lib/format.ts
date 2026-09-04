// Indian numbering system formatting (lakh/crore) for price & volume.

function toNum(n: number | string | null | undefined): number | null {
  if (n === null || n === undefined || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

export function formatINR(n: number | string | null | undefined, opts: { decimals?: number } = {}): string {
  const num = toNum(n);
  if (num === null) return "—";
  const decimals = opts.decimals ?? 2;
  return "₹" + num.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatNumber(n: number | string | null | undefined): string {
  const num = toNum(n);
  if (num === null) return "—";
  return num.toLocaleString("en-IN");
}

export function formatPercent(n: number | string | null | undefined, withSign = true): string {
  const num = toNum(n);
  if (num === null) return "—";
  const s = withSign && num > 0 ? "+" : "";
  return `${s}${num.toFixed(2)}%`;
}

// Compact large numbers: 1,20,00,000 -> "1.2 Cr"
export function formatCompact(n: number | string | null | undefined): string {
  const num = toNum(n);
  if (num === null) return "—";
  const abs = Math.abs(num);
  if (abs >= 10000000) return (num / 10000000).toFixed(2) + " Cr";
  if (abs >= 100000) return (num / 100000).toFixed(2) + " L";
  if (abs >= 1000) return (num / 1000).toFixed(1) + " K";
  return String(num);
}

export function marketCapLabel(crores: number | string | null | undefined): string {
  const num = toNum(crores);
  if (num === null || num === 0) return "—";
  if (num >= 100000) return "₹" + (num / 100000).toFixed(2) + " L Cr";
  return "₹" + num.toLocaleString("en-IN") + " Cr";
}
