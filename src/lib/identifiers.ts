// Identifier hygiene. N-PORT filers often put placeholders like "N/A" or "000000000" in identifier fields.

const PLACEHOLDER = /^(n\/?a|none|null|0+|-+|x+)$/i;

export function cleanCusip(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toUpperCase();
  if (PLACEHOLDER.test(s)) return null;
  return /^[0-9A-Z*@#]{9}$/.test(s) ? s : null;
}

export function cleanIsin(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toUpperCase();
  if (PLACEHOLDER.test(s)) return null;
  return /^[A-Z]{2}[0-9A-Z]{9}[0-9]$/.test(s) ? s : null;
}

export function cleanLei(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toUpperCase();
  if (PLACEHOLDER.test(s)) return null;
  return /^[0-9A-Z]{20}$/.test(s) ? s : null;
}

export function normalizeName(v: string | null | undefined): string {
  return (v ?? "")
    .toUpperCase()
    .replace(/[.,'"()]/g, "")
    .replace(/\b(INC|CORP|CORPORATION|CO|LTD|PLC|LLC|SA|AG|NV|HOLDINGS?)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
