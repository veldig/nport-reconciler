// Display helpers. None of these round: they only add digit grouping and trim trailing zeros,
// which leaves the numeric value identical to what was filed.

export function trimZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/0+$/, "").replace(/\.$/, "");
}

export function groupDigits(s: string): string {
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const [int, frac] = body.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + grouped + (frac !== undefined ? "." + frac : "");
}

/** Exact value with grouping, trailing zeros trimmed. Missing values say so explicitly. */
export function fmtExact(s: string | null | undefined): string {
  if (s == null || s === "") return "Not filed";
  return groupDigits(trimZeros(s));
}

export function fmtSigned(s: string | null | undefined): string {
  if (s == null) return "n/a";
  const t = fmtExact(s);
  return s.startsWith("-") || /^0(\.0*)?$/.test(trimZeros(s)) ? t : `+${t}`;
}

/** Compact USD for headline numbers only, labeled as approximate where used. */
export function fmtUsdCompact(s: string | null | undefined): string {
  if (!s) return "n/a";
  const n = Number(s);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(n);
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "n/a";
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export function fmtTimestamp(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  }).format(date);
}

export const TYPE_LABELS: Record<string, string> = {
  NEW_POSITION: "New position",
  REMOVED_POSITION: "Removed position",
  WEIGHT_CHANGE: "Weight change",
  VALUE_SHARE_MISMATCH: "Value vs shares",
  MISSING_IDENTIFIER: "Missing identifier",
  DUPLICATE_HOLDING: "Duplicate holding",
  NON_USD_CURRENCY: "Non-USD currency",
  IDENTIFIER_CHANGE: "Identifier change",
};

export const UNIT_LABELS: Record<string, string> = {
  NS: "shares",
  PA: "principal amount",
  NC: "contracts",
  OU: "other units",
};

export const ASSET_CAT_LABELS: Record<string, string> = {
  EC: "Equity, common",
  EP: "Equity, preferred",
  DBT: "Debt",
  STIV: "Short-term investment vehicle",
  RA: "Repurchase agreement",
  DE: "Derivative, equity",
  DFE: "Derivative, foreign exchange",
  DIR: "Derivative, interest rate",
  DCR: "Derivative, credit",
  DCO: "Derivative, commodity",
  DO: "Derivative, other",
  SN: "Structured note",
  LON: "Loan",
  ABS: "Asset-backed security",
};
