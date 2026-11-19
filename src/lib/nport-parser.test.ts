import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseNport } from "./nport-parser";

const xml = readFileSync(path.join(__dirname, "__fixtures__", "nport-structure.xml"), "utf8");

describe("parseNport", () => {
  const f = parseNport(xml);

  it("reads the header and fund totals exactly as written", () => {
    expect(f.seriesId).toBe("S000000001");
    expect(f.seriesName).toBe("Test Fund ETF");
    expect(f.reportPeriodDate).toBe("2026-06-30");
    expect(f.fiscalYearEnd).toBe("2026-12-31");
    expect(f.netAssets).toBe("1000000.00");
    expect(f.totalAssets).toBe("1000500.25");
  });

  it("keeps numeric strings untouched, including trailing zeros", () => {
    const h = f.holdings[0];
    expect(h.balance).toBe("1500.00000000");
    expect(h.valueUsd).toBe("75000.00000000");
    expect(h.pctValue).toBe("7.500000000000");
  });

  it("reads identifiers from attributes", () => {
    const h = f.holdings[0];
    expect(h.cusip).toBe("000000AA1");
    expect(h.isin).toBe("US000000AA16");
    expect(h.ticker).toBe("ALPH");
    expect(f.holdings[1].otherIdentifiers).toEqual([
      { desc: "SEDOL", value: "B000001" },
      { desc: "Internal", value: "X-42" },
    ]);
  });

  it("handles conditional currency, asset and issuer elements", () => {
    const h = f.holdings[1];
    expect(h.currencyCode).toBe("EUR");
    expect(h.exchangeRate).toBe("0.92000000");
    expect(h.assetCategory).toBe("OTHER: Depositary receipt");
    expect(h.issuerCategory).toBe("OTHER: Foreign issuer");
    expect(h.cusip).toBe("N/A"); // stored as filed; matching logic treats it as missing
  });

  it("numbers rows in source order", () => {
    expect(f.holdings.map((h) => h.rowIndex)).toEqual([1, 2]);
  });

  it("rejects documents that are not N-PORT", () => {
    expect(() => parseNport("<foo/>")).toThrow(/edgarSubmission/);
  });
});
