// Pure reconciliation logic: no database, no I/O. Compares a prior period's holdings to the current
// period's and returns exceptions with the evidence needed to review them.

import { diffStrings, pctChange, parseDec, sumStrings, toNum, abs, sub } from "./decimal";
import { cleanCusip, cleanIsin, cleanLei, normalizeName } from "./identifiers";
import { fmtExact } from "./format";

export interface RecHolding {
  id: number;
  rowIndex: number;
  name: string | null;
  title: string | null;
  lei: string | null;
  cusip: string | null;
  isin: string | null;
  balance: string | null;
  units: string | null;
  currencyCode: string | null;
  valueUsd: string | null;
  pctValue: string | null;
  payoffProfile: string | null;
}

export const EXCEPTION_TYPES = [
  "NEW_POSITION",
  "REMOVED_POSITION",
  "WEIGHT_CHANGE",
  "VALUE_SHARE_MISMATCH",
  "MISSING_IDENTIFIER",
  "DUPLICATE_HOLDING",
  "NON_USD_CURRENCY",
  "IDENTIFIER_CHANGE",
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];
export type Severity = "high" | "medium" | "low";
export type MatchedBy = "CUSIP" | "ISIN" | "LEI+NAME" | "NAME+TITLE" | "NONE";

export interface ReconParams {
  /** Flag a matched position whose portfolio weight moved more than this many percentage points. */
  weightChangePp: number;
  /** Weight change above this is high severity. */
  highWeightChangePp: number;
  /** Share count change within this percent counts as "flat". */
  sharesFlatPct: number;
  /** With flat shares, a value move at least this large (percent) is flagged. */
  valueMovePct: number;
  /** Share count change at least this large (percent)... */
  sharesMovePct: number;
  /** ...with value change within this percent is flagged. */
  valueFlatPct: number;
  /** New or removed positions at or above this weight (percent of net assets) are high severity. */
  highWeightPct: number;
  /** New or removed positions at or above this weight are medium severity. */
  mediumWeightPct: number;
}

export const DEFAULT_PARAMS: ReconParams = {
  weightChangePp: 1,
  highWeightChangePp: 3,
  sharesFlatPct: 0.5,
  valueMovePct: 50,
  sharesMovePct: 10,
  valueFlatPct: 0.5,
  highWeightPct: 2,
  mediumWeightPct: 0.5,
};

export interface PositionSnapshot {
  holdingIds: number[];
  rowIndexes: number[];
  name: string | null;
  title: string | null;
  cusip: string | null;
  isin: string | null;
  lei: string | null;
  payoffProfile: string | null;
  units: string | null;
  currencies: string[];
  balance: string | null;
  valueUsd: string | null;
  pctValue: string | null;
  aggregatedRows: number;
}

export interface ReconException {
  type: ExceptionType;
  severity: Severity;
  matchKey: string | null;
  matchedBy: MatchedBy;
  priorHoldingIds: number[];
  currentHoldingIds: number[];
  securityName: string | null;
  summary: string;
  details: {
    rule: string;
    prior: PositionSnapshot | null;
    current: PositionSnapshot | null;
    deltas?: {
      balance: string | null;
      valueUsd: string | null;
      pctValuePp: string | null;
      balancePct: number | null;
      valueUsdPct: number | null;
    };
    rows?: { holdingId: number; rowIndex: number; balance: string | null; valueUsd: string | null; pctValue: string | null; currencyCode: string | null }[];
  };
}

export interface ReconResult {
  exceptions: ReconException[];
  stats: {
    priorRows: number;
    currentRows: number;
    priorPositions: number;
    currentPositions: number;
    matched: number;
    matchedBy: Record<MatchedBy, number>;
  };
}

interface Position {
  key: string; // best identifier key within its own period
  members: RecHolding[];
  cusip: string | null;
  isin: string | null;
  lei: string | null;
  nameKey: string;
  titleKey: string;
  payoff: string;
}

function bestKey(h: RecHolding): string {
  const payoff = (h.payoffProfile ?? "").toUpperCase();
  const c = cleanCusip(h.cusip);
  if (c) return `CUSIP:${c}|${payoff}`;
  const i = cleanIsin(h.isin);
  if (i) return `ISIN:${i}|${payoff}`;
  const l = cleanLei(h.lei);
  if (l) return `LEI+NAME:${l}/${normalizeName(h.name)}|${payoff}`;
  return `NAME+TITLE:${normalizeName(h.name)}/${normalizeName(h.title)}|${payoff}`;
}

/** Groups a period's rows into positions. Rows sharing the same best identifier are one position (and a duplicate). */
export function toPositions(rows: RecHolding[]): Position[] {
  const map = new Map<string, Position>();
  for (const h of [...rows].sort((a, b) => a.rowIndex - b.rowIndex)) {
    const key = bestKey(h);
    const existing = map.get(key);
    if (existing) {
      existing.members.push(h);
      continue;
    }
    map.set(key, {
      key,
      members: [h],
      cusip: cleanCusip(h.cusip),
      isin: cleanIsin(h.isin),
      lei: cleanLei(h.lei),
      nameKey: normalizeName(h.name),
      titleKey: normalizeName(h.title),
      payoff: (h.payoffProfile ?? "").toUpperCase(),
    });
  }
  return [...map.values()];
}

function snapshot(p: Position): PositionSnapshot {
  const first = p.members[0];
  const units = [...new Set(p.members.map((m) => m.units ?? ""))];
  return {
    holdingIds: p.members.map((m) => m.id),
    rowIndexes: p.members.map((m) => m.rowIndex),
    name: first.name,
    title: first.title,
    cusip: first.cusip,
    isin: first.isin,
    lei: first.lei,
    payoffProfile: first.payoffProfile,
    units: units.length === 1 ? first.units : units.join(","),
    currencies: [...new Set(p.members.map((m) => m.currencyCode ?? "").filter(Boolean))],
    // Single rows are reported exactly as filed; duplicate rows are summed exactly (no rounding).
    balance: p.members.length === 1 ? first.balance : sumStrings(p.members.map((m) => m.balance)),
    valueUsd: p.members.length === 1 ? first.valueUsd : sumStrings(p.members.map((m) => m.valueUsd)),
    pctValue: p.members.length === 1 ? first.pctValue : sumStrings(p.members.map((m) => m.pctValue)),
    aggregatedRows: p.members.length,
  };
}

const MATCH_PASSES: { by: Exclude<MatchedBy, "NONE">; key: (p: Position) => string | null }[] = [
  { by: "CUSIP", key: (p) => (p.cusip ? `${p.cusip}|${p.payoff}` : null) },
  { by: "ISIN", key: (p) => (p.isin ? `${p.isin}|${p.payoff}` : null) },
  { by: "LEI+NAME", key: (p) => (p.lei && p.nameKey ? `${p.lei}/${p.nameKey}|${p.payoff}` : null) },
  { by: "NAME+TITLE", key: (p) => (p.nameKey ? `${p.nameKey}/${p.titleKey}|${p.payoff}` : null) },
];

export function matchPositions(prior: Position[], current: Position[]) {
  const pairs: { prior: Position; current: Position; by: MatchedBy; key: string }[] = [];
  const unmatchedPrior = new Set(prior);
  const unmatchedCurrent = new Set(current);
  for (const pass of MATCH_PASSES) {
    const index = new Map<string, Position[]>();
    for (const c of unmatchedCurrent) {
      const k = pass.key(c);
      if (k) index.set(k, [...(index.get(k) ?? []), c]);
    }
    for (const p of [...unmatchedPrior]) {
      const k = pass.key(p);
      if (!k) continue;
      const candidates = (index.get(k) ?? []).filter((c) => unmatchedCurrent.has(c));
      if (candidates.length !== 1) continue; // ambiguous or none: do not guess
      const c = candidates[0];
      pairs.push({ prior: p, current: c, by: pass.by, key: `${pass.by}:${k.split("|")[0]}` });
      unmatchedPrior.delete(p);
      unmatchedCurrent.delete(c);
    }
  }
  return { pairs, unmatchedPrior: [...unmatchedPrior], unmatchedCurrent: [...unmatchedCurrent] };
}

const round2 = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100);
const fmtPct = (x: number | null) => (x == null ? "n/a" : `${x > 0 ? "+" : ""}${x.toFixed(2)}%`);
const label = (s: PositionSnapshot) => s.name ?? s.title ?? "Unnamed holding";

function weightSeverity(pct: string | null, params: ReconParams): Severity {
  const d = parseDec(pct);
  const w = d ? Math.abs(toNum(d)) : 0;
  if (w >= params.highWeightPct) return "high";
  if (w >= params.mediumWeightPct) return "medium";
  return "low";
}

export function reconcile(priorRows: RecHolding[], currentRows: RecHolding[], params: ReconParams = DEFAULT_PARAMS): ReconResult {
  const prior = toPositions(priorRows);
  const current = toPositions(currentRows);
  const { pairs, unmatchedPrior, unmatchedCurrent } = matchPositions(prior, current);
  const out: ReconException[] = [];

  for (const { prior: p, current: c, by, key } of pairs) {
    const ps = snapshot(p);
    const cs = snapshot(c);
    const deltas = {
      balance: diffStrings(cs.balance, ps.balance),
      valueUsd: diffStrings(cs.valueUsd, ps.valueUsd),
      pctValuePp: diffStrings(cs.pctValue, ps.pctValue),
      balancePct: round2(pctChange(cs.balance, ps.balance)),
      valueUsdPct: round2(pctChange(cs.valueUsd, ps.valueUsd)),
    };
    const base = {
      matchKey: key,
      matchedBy: by,
      priorHoldingIds: ps.holdingIds,
      currentHoldingIds: cs.holdingIds,
      securityName: label(cs),
    };

    // Identifier change: matched as the same position, but a filed identifier differs between periods
    const changes = (
      [
        ["CUSIP", cleanCusip(ps.cusip), cleanCusip(cs.cusip)],
        ["ISIN", cleanIsin(ps.isin), cleanIsin(cs.isin)],
        ["LEI", cleanLei(ps.lei), cleanLei(cs.lei)],
      ] as const
    ).filter(([, a, b]) => a && b && a !== b);
    if (changes.length) {
      out.push({
        ...base,
        type: "IDENTIFIER_CHANGE",
        severity: "medium",
        summary: `Matched by ${by}, but ${changes.map(([k, a, b]) => `${k} changed from ${a} to ${b}`).join("; ")}. Confirm it is the same security (corporate action or reissue).`,
        details: { rule: "matched position whose CUSIP, ISIN or LEI differs between periods", prior: ps, current: cs, deltas },
      });
    }

    // Weight change
    const dw = parseDec(deltas.pctValuePp);
    if (dw && toNum(abs(dw)) > params.weightChangePp) {
      out.push({
        ...base,
        type: "WEIGHT_CHANGE",
        severity: toNum(abs(dw)) > params.highWeightChangePp ? "high" : "medium",
        summary: `Weight moved from ${fmtExact(ps.pctValue)}% to ${fmtExact(cs.pctValue)}% (${toNum(dw) > 0 ? "+" : ""}${fmtExact(deltas.pctValuePp)} pp).`,
        details: { rule: `|weight change| > ${params.weightChangePp} pp`, prior: ps, current: cs, deltas },
      });
    }

    // Value vs share consistency. Only meaningful when both periods report the same units.
    if (ps.units === cs.units && deltas.balancePct != null && deltas.valueUsdPct != null) {
      const sh = Math.abs(deltas.balancePct);
      const val = Math.abs(deltas.valueUsdPct);
      let rule: string | null = null;
      if (sh <= params.sharesFlatPct && val >= params.valueMovePct) {
        rule = `shares within ${params.sharesFlatPct}% but value moved at least ${params.valueMovePct}%`;
      } else if (sh >= params.sharesMovePct && val <= params.valueFlatPct) {
        rule = `shares moved at least ${params.sharesMovePct}% but value within ${params.valueFlatPct}%`;
      }
      if (rule) {
        out.push({
          ...base,
          type: "VALUE_SHARE_MISMATCH",
          severity: val >= 2 * params.valueMovePct ? "high" : "medium",
          summary: `Balance ${fmtPct(deltas.balancePct)} vs value ${fmtPct(deltas.valueUsdPct)}. Confirm price and units.`,
          details: { rule, prior: ps, current: cs, deltas },
        });
      }
    }
    // Nonzero balance with zero value (or the reverse) in the current period
    const cb = parseDec(cs.balance);
    const cv = parseDec(cs.valueUsd);
    if (cb && cv && (cb.n === 0n) !== (cv.n === 0n)) {
      out.push({
        ...base,
        type: "VALUE_SHARE_MISMATCH",
        severity: "high",
        summary: `Current balance is ${fmtExact(cs.balance)} but value is ${fmtExact(cs.valueUsd)} USD.`,
        details: { rule: "balance and value must both be zero or both nonzero", prior: ps, current: cs, deltas },
      });
    }
  }

  for (const c of unmatchedCurrent) {
    const cs = snapshot(c);
    out.push({
      type: "NEW_POSITION",
      severity: weightSeverity(cs.pctValue, params),
      matchKey: c.key.split("|")[0],
      matchedBy: "NONE",
      priorHoldingIds: [],
      currentHoldingIds: cs.holdingIds,
      securityName: label(cs),
      summary: `New position at ${fmtExact(cs.pctValue)}% of net assets (${fmtExact(cs.valueUsd)} USD).`,
      details: { rule: "present in current period, no match in prior period", prior: null, current: cs },
    });
  }
  for (const p of unmatchedPrior) {
    const ps = snapshot(p);
    out.push({
      type: "REMOVED_POSITION",
      severity: weightSeverity(ps.pctValue, params),
      matchKey: p.key.split("|")[0],
      matchedBy: "NONE",
      priorHoldingIds: ps.holdingIds,
      currentHoldingIds: [],
      securityName: label(ps),
      summary: `Position exited. Was ${fmtExact(ps.pctValue)}% of net assets (${fmtExact(ps.valueUsd)} USD).`,
      details: { rule: "present in prior period, no match in current period", prior: ps, current: null },
    });
  }

  // Data quality checks run on the period under review (current).
  for (const c of current) {
    const cs = snapshot(c);
    const base = {
      matchKey: c.key.split("|")[0],
      matchedBy: "NONE" as const,
      priorHoldingIds: [],
      currentHoldingIds: cs.holdingIds,
      securityName: label(cs),
    };
    if (c.members.length > 1) {
      out.push({
        ...base,
        type: "DUPLICATE_HOLDING",
        severity: "medium",
        summary: `${c.members.length} rows share identifier ${base.matchKey} (rows ${cs.rowIndexes.join(", ")}). Summed for comparison.`,
        details: {
          rule: "more than one row with the same identifier and payoff profile",
          prior: null,
          current: cs,
          rows: c.members.map((m) => ({ holdingId: m.id, rowIndex: m.rowIndex, balance: m.balance, valueUsd: m.valueUsd, pctValue: m.pctValue, currencyCode: m.currencyCode })),
        },
      });
    }
    if (!c.cusip && !c.isin) {
      out.push({
        ...base,
        type: "MISSING_IDENTIFIER",
        severity: "low",
        summary: `No usable CUSIP or ISIN (filed CUSIP: ${cs.cusip ?? "blank"}). Can only be matched by ${c.lei ? "LEI and name" : "name and title"}.`,
        details: { rule: "no valid CUSIP or ISIN", prior: null, current: cs },
      });
    }
    const nonUsd = cs.currencies.filter((x) => x.toUpperCase() !== "USD");
    if (nonUsd.length) {
      out.push({
        ...base,
        type: "NON_USD_CURRENCY",
        severity: "low",
        summary: `Denominated in ${nonUsd.join(", ")}. Confirm FX conversion to USD value.`,
        details: { rule: "currency code other than USD", prior: null, current: cs },
      });
    }
  }

  const matchedBy = { CUSIP: 0, ISIN: 0, "LEI+NAME": 0, "NAME+TITLE": 0, NONE: 0 } as Record<MatchedBy, number>;
  for (const p of pairs) matchedBy[p.by]++;
  const sevOrder = { high: 0, medium: 1, low: 2 };
  out.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || a.type.localeCompare(b.type));

  return {
    exceptions: out,
    stats: {
      priorRows: priorRows.length,
      currentRows: currentRows.length,
      priorPositions: prior.length,
      currentPositions: current.length,
      matched: pairs.length,
      matchedBy,
    },
  };
}

// Exposed for tests
export const _internal = { bestKey, snapshot, sub };
