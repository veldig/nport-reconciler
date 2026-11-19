// Exact decimal arithmetic on the string values filed in N-PORT.
// Values are never converted to floating point for display; deltas and sums are exact.

export interface Dec {
  n: bigint; // unscaled integer
  scale: number; // digits after the decimal point
}

const DEC_RE = /^([+-])?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

export function parseDec(input: string | null | undefined): Dec | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (s === "" || /^n\/?a$/i.test(s)) return null;
  const m = DEC_RE.exec(s);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) return null;
  const sign = m[1] === "-" ? -1n : 1n;
  const intPart = m[2] || "0";
  const frac = m[3] ?? "";
  const exp = m[4] ? parseInt(m[4], 10) : 0;
  let n = BigInt(intPart + frac) * sign;
  let scale = frac.length - exp;
  if (scale < 0) {
    n = n * 10n ** BigInt(-scale);
    scale = 0;
  }
  return { n, scale };
}

function align(a: Dec, b: Dec): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [a.n * 10n ** BigInt(scale - a.scale), b.n * 10n ** BigInt(scale - b.scale), scale];
}

export function sub(a: Dec, b: Dec): Dec {
  const [x, y, scale] = align(a, b);
  return { n: x - y, scale };
}

export function add(a: Dec, b: Dec): Dec {
  const [x, y, scale] = align(a, b);
  return { n: x + y, scale };
}

export function cmp(a: Dec, b: Dec): number {
  const [x, y] = align(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function isZero(a: Dec): boolean {
  return a.n === 0n;
}

export function abs(a: Dec): Dec {
  return { n: a.n < 0n ? -a.n : a.n, scale: a.scale };
}

/** Exact string form. Keeps the scale of the inputs, so "0.10" - "0.05" = "0.05". */
export function toStr(a: Dec): string {
  const neg = a.n < 0n;
  let digits = (neg ? -a.n : a.n).toString();
  if (a.scale === 0) return (neg ? "-" : "") + digits;
  digits = digits.padStart(a.scale + 1, "0");
  const i = digits.length - a.scale;
  return (neg ? "-" : "") + digits.slice(0, i) + "." + digits.slice(i);
}

/** For threshold comparisons and ratios only; never used to display a filed value. */
export function toNum(a: Dec): number {
  return Number(toStr(a));
}

export function sumStrings(values: (string | null | undefined)[]): string | null {
  let acc: Dec | null = null;
  for (const v of values) {
    const d = parseDec(v);
    if (!d) continue;
    acc = acc ? add(acc, d) : d;
  }
  return acc ? toStr(acc) : null;
}

export function diffStrings(current: string | null | undefined, prior: string | null | undefined): string | null {
  const a = parseDec(current);
  const b = parseDec(prior);
  if (!a || !b) return null;
  return toStr(sub(a, b));
}

/** Percent change (current - prior) / |prior| as a float, null if prior is zero or missing. */
export function pctChange(current: string | null | undefined, prior: string | null | undefined): number | null {
  const a = parseDec(current);
  const b = parseDec(prior);
  if (!a || !b || isZero(b)) return null;
  return (toNum(sub(a, b)) / Math.abs(toNum(b))) * 100;
}
