// Turns grouped exception counts into the overview table. Every row in the database lands in exactly one
// table row: known types in their fixed order, and any type without a label in an "Other" row, so the table
// always sums to the run total.

import { EXCEPTION_TYPES } from "./reconcile";

export type SeverityKey = "high" | "medium" | "low";
export interface GroupedCount { type: string; severity: string; count: number }
export interface TallyRow { type: string; high: number; medium: number; low: number; total: number }

export function tallyExceptions(groups: GroupedCount[]): { rows: TallyRow[]; total: number } {
  const known = new Set<string>(EXCEPTION_TYPES);
  const byType = new Map<string, TallyRow>();
  for (const t of EXCEPTION_TYPES) byType.set(t, { type: t, high: 0, medium: 0, low: 0, total: 0 });
  let total = 0;
  for (const g of groups) {
    const key = known.has(g.type) ? g.type : "OTHER";
    const row = byType.get(key) ?? { type: key, high: 0, medium: 0, low: 0, total: 0 };
    const sev = (["high", "medium", "low"] as const).includes(g.severity as SeverityKey) ? (g.severity as SeverityKey) : "low";
    row[sev] += g.count;
    row.total += g.count;
    total += g.count;
    byType.set(key, row);
  }
  return { rows: [...byType.values()], total };
}
