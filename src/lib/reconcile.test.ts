import { describe, it, expect } from "vitest";
import { reconcile, DEFAULT_PARAMS, type RecHolding } from "./reconcile";
import { parseDec, toStr, diffStrings, sumStrings } from "./decimal";
import { cleanCusip, cleanIsin, cleanLei } from "./identifiers";

let nextId = 1;
function h(over: Partial<RecHolding>): RecHolding {
  const id = nextId++;
  return {
    id,
    rowIndex: id,
    name: "Acme Corp",
    title: "Acme Corp",
    lei: "549300ABCDEFGHIJKL12",
    cusip: "000000001",
    isin: null,
    balance: "1000.00000000",
    units: "NS",
    currencyCode: "USD",
    valueUsd: "50000.00000000",
    pctValue: "2.500000000000",
    payoffProfile: "Long",
    ...over,
  };
}

const types = (r: ReturnType<typeof reconcile>) => r.exceptions.map((e) => e.type).sort();

describe("decimal", () => {
  it("keeps filed digits and scale exactly", () => {
    expect(toStr(parseDec("123.4500")!)).toBe("123.4500");
    expect(toStr(parseDec("-0.05")!)).toBe("-0.05");
    expect(toStr(parseDec("1.5E+3")!)).toBe("1500");
    expect(toStr(parseDec("2.5e-3")!)).toBe("0.0025");
  });
  it("subtracts and sums without floating point error", () => {
    expect(diffStrings("0.3", "0.1")).toBe("0.2"); // 0.3 - 0.1 in floats is 0.19999999999999998
    expect(sumStrings(["0.1", "0.2"])).toBe("0.3");
    expect(diffStrings("1.250000000000", "3.75")).toBe("-2.500000000000");
  });
  it("treats blanks and N/A as missing", () => {
    expect(parseDec("N/A")).toBeNull();
    expect(parseDec("")).toBeNull();
    expect(diffStrings("1", null)).toBeNull();
  });
});

describe("identifier hygiene", () => {
  it("rejects placeholders", () => {
    expect(cleanCusip("000000000")).toBeNull();
    expect(cleanCusip("N/A")).toBeNull();
    expect(cleanCusip("00507v109")).toBe("00507V109");
    expect(cleanIsin("US0378331005")).toBe("US0378331005");
    expect(cleanIsin("US037833100")).toBeNull();
    expect(cleanLei("N/A")).toBeNull();
  });
});

describe("reconcile", () => {
  it("produces no exceptions for an unchanged portfolio", () => {
    const a = [h({ cusip: "111111111" }), h({ cusip: "222222222", name: "Beta Inc", isin: "US2222222220" })];
    const b = a.map((x) => ({ ...x, id: x.id + 1000 }));
    const r = reconcile(a, b);
    expect(r.exceptions).toEqual([]);
    expect(r.stats.matched).toBe(2);
    expect(r.stats.matchedBy.CUSIP).toBe(2);
  });

  it("flags new and removed positions with weight-based severity", () => {
    const prior = [h({ cusip: "111111111", pctValue: "0.10" })];
    const current = [h({ cusip: "333333333", name: "Gamma", pctValue: "4.2" })];
    const r = reconcile(prior, current);
    expect(types(r)).toEqual(["NEW_POSITION", "REMOVED_POSITION"]);
    expect(r.exceptions.find((e) => e.type === "NEW_POSITION")!.severity).toBe("high");
    expect(r.exceptions.find((e) => e.type === "REMOVED_POSITION")!.severity).toBe("low");
  });

  it("flags weight changes above the threshold with an exact delta", () => {
    const prior = [h({ cusip: "111111111", pctValue: "3.000000000000" })];
    const current = [h({ cusip: "111111111", pctValue: "1.750000000000" })];
    const r = reconcile(prior, current);
    const e = r.exceptions.find((x) => x.type === "WEIGHT_CHANGE")!;
    expect(e.details.deltas!.pctValuePp).toBe("-1.250000000000");
    expect(e.severity).toBe("medium");
  });

  it("does not flag a weight change at exactly the threshold", () => {
    const r = reconcile([h({ cusip: "111111111", pctValue: "2.0" })], [h({ cusip: "111111111", pctValue: "3.0" })]);
    expect(types(r)).not.toContain("WEIGHT_CHANGE");
  });

  it("flags value moving a lot while shares are flat", () => {
    const r = reconcile(
      [h({ cusip: "111111111", balance: "1000", valueUsd: "10000" })],
      [h({ cusip: "111111111", balance: "1000", valueUsd: "16000" })],
    );
    expect(types(r)).toContain("VALUE_SHARE_MISMATCH");
  });

  it("flags shares moving while value is flat", () => {
    const r = reconcile(
      [h({ cusip: "111111111", balance: "1000", valueUsd: "10000" })],
      [h({ cusip: "111111111", balance: "1500", valueUsd: "10010" })],
    );
    expect(types(r)).toContain("VALUE_SHARE_MISMATCH");
  });

  it("does not flag ordinary price moves", () => {
    const r = reconcile(
      [h({ cusip: "111111111", balance: "1000", valueUsd: "10000" })],
      [h({ cusip: "111111111", balance: "1200", valueUsd: "13000" })],
    );
    expect(types(r)).not.toContain("VALUE_SHARE_MISMATCH");
  });

  it("falls back to ISIN, then LEI + name, when CUSIP is missing", () => {
    const prior = [
      h({ cusip: "N/A", isin: "KYG017191142", name: "Alibaba" }),
      h({ cusip: "000000000", isin: null, lei: "529900XXXXXXXXXXXX99", name: "Private Co" }),
    ];
    const current = [
      h({ cusip: "N/A", isin: "KYG017191142", name: "Alibaba Group" }),
      h({ cusip: "000000000", isin: null, lei: "529900XXXXXXXXXXXX99", name: "Private Co." }),
    ];
    const r = reconcile(prior, current);
    expect(r.stats.matchedBy.ISIN).toBe(1);
    expect(r.stats.matchedBy["LEI+NAME"]).toBe(1);
    expect(types(r)).toEqual(["MISSING_IDENTIFIER"]); // only the private co lacks CUSIP and ISIN
  });

  it("matches across periods when one period has CUSIP and the other only ISIN", () => {
    const prior = [h({ cusip: "037833100", isin: "US0378331005" })];
    const current = [h({ cusip: "N/A", isin: "US0378331005" })];
    const r = reconcile(prior, current);
    expect(r.stats.matchedBy.ISIN).toBe(1);
    expect(types(r)).not.toContain("NEW_POSITION");
  });

  it("detects duplicates and compares the exact sum", () => {
    const prior = [h({ cusip: "111111111", pctValue: "2.0", valueUsd: "100" })];
    const current = [
      h({ cusip: "111111111", pctValue: "1.1", valueUsd: "55.5" }),
      h({ cusip: "111111111", pctValue: "0.9", valueUsd: "44.5" }),
    ];
    const r = reconcile(prior, current);
    const dup = r.exceptions.find((e) => e.type === "DUPLICATE_HOLDING")!;
    expect(dup.details.current!.pctValue).toBe("2.0");
    expect(dup.details.current!.valueUsd).toBe("100.0");
    expect(types(r)).not.toContain("WEIGHT_CHANGE");
  });

  it("does not treat a long and a short in the same security as duplicates", () => {
    const rows = [h({ cusip: "111111111", payoffProfile: "Long" }), h({ cusip: "111111111", payoffProfile: "Short" })];
    const r = reconcile(rows, rows.map((x) => ({ ...x, id: x.id + 1000 })));
    expect(types(r)).not.toContain("DUPLICATE_HOLDING");
  });

  it("flags an identifier that changed on a matched position", () => {
    // Same LEI and name, different ISIN: matched, but the change must be reviewed
    const prior = [h({ cusip: "000000000", isin: "IE0004OVVKF1", lei: "984500EE55766B5O3803", name: "Brera Holdings PLC" })];
    const current = [h({ cusip: "000000000", isin: "IE0009876H30", lei: "984500EE55766B5O3803", name: "Brera Holdings PLC" })];
    const r = reconcile(prior, current);
    expect(r.stats.matchedBy["LEI+NAME"]).toBe(1);
    const e = r.exceptions.find((x) => x.type === "IDENTIFIER_CHANGE")!;
    expect(e.summary).toContain("ISIN changed from IE0004OVVKF1 to IE0009876H30");
  });

  it("flags non-USD currency", () => {
    const r = reconcile([], [h({ cusip: "111111111", currencyCode: "EUR", pctValue: "0.1" })]);
    expect(types(r)).toEqual(["NEW_POSITION", "NON_USD_CURRENCY"]);
  });

  it("matches identifier-less rows by name and title as a last resort", () => {
    const prior = [h({ cusip: null, isin: null, lei: null, name: "Cash", title: "Cash" })];
    const current = [h({ cusip: null, isin: null, lei: null, name: "Cash", title: "Cash" })];
    const r = reconcile(prior, current);
    expect(r.stats.matchedBy["NAME+TITLE"]).toBe(1);
  });

  it("never guesses when a key matches more than one candidate", () => {
    // Prior has only an ISIN; current has two lines (different CUSIPs) sharing that ISIN.
    const prior = [h({ cusip: null, isin: "US0378331005" })];
    const current = [
      h({ cusip: "111111111", isin: "US0378331005" }),
      h({ cusip: "222222222", isin: "US0378331005" }),
    ];
    const r = reconcile(prior, current);
    expect(r.stats.matched).toBe(0);
    expect(types(r).filter((t) => t === "NEW_POSITION")).toHaveLength(2);
    expect(types(r)).toContain("REMOVED_POSITION");
  });

  it("uses default params when none are passed", () => {
    expect(DEFAULT_PARAMS.weightChangePp).toBe(1);
  });
});
