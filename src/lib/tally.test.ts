import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tallyExceptions } from "./tally";
import { parseNport } from "./nport-parser";
import { reconcile, EXCEPTION_TYPES, type RecHolding } from "./reconcile";
import { TYPE_LABELS } from "./format";

const RAW = path.join(__dirname, "..", "..", "data", "raw", "1579982");

function load(file: string, idOffset: number): RecHolding[] {
  const f = parseNport(readFileSync(path.join(RAW, file), "utf8"));
  return f.holdings.map((h, i) => ({ id: idOffset + i, ...h }));
}

describe("overview exception table", () => {
  it("per-type rows sum to the total, including a type with no label", () => {
    const { rows, total } = tallyExceptions([
      { type: "NEW_POSITION", severity: "high", count: 2 },
      { type: "MISSING_IDENTIFIER", severity: "low", count: 3 },
      { type: "SOMETHING_NEW", severity: "medium", count: 1 },
    ]);
    expect(total).toBe(6);
    expect(rows.reduce((a, r) => a + r.total, 0)).toBe(total);
    expect(rows.find((r) => r.type === "OTHER")!.total).toBe(1);
  });

  it("every exception type has a display label", () => {
    for (const t of EXCEPTION_TYPES) expect(TYPE_LABELS[t]).toBeTruthy();
  });

  it("on the real ARKK filings, per-type counts sum to the run total of 14", () => {
    const prior = load("0000940400-26-025084.xml", 1);
    const current = load("0000940400-26-037955.xml", 1000);
    const { exceptions } = reconcile(prior, current);
    const groups = new Map<string, number>();
    for (const e of exceptions) groups.set(`${e.type}|${e.severity}`, (groups.get(`${e.type}|${e.severity}`) ?? 0) + 1);
    const { rows, total } = tallyExceptions([...groups].map(([k, count]) => ({ type: k.split("|")[0], severity: k.split("|")[1], count })));
    expect(total).toBe(exceptions.length);
    expect(total).toBe(14);
    expect(rows.reduce((a, r) => a + r.total, 0)).toBe(14);
    expect(rows.find((r) => r.type === "MISSING_IDENTIFIER")!.low).toBe(3);
    expect(rows.find((r) => r.type === "OTHER")).toBeUndefined();
  });
});
