// Parses an NPORT-P primary_doc.xml into header facts and holdings.
// Every value is kept as the exact string in the filing (parseTagValue: false). Nothing is rounded.

import { XMLParser } from "fast-xml-parser";

export interface ParsedHolding {
  rowIndex: number;
  name: string | null;
  lei: string | null;
  title: string | null;
  cusip: string | null;
  isin: string | null;
  ticker: string | null;
  otherIdentifiers: { desc: string | null; value: string }[];
  balance: string | null;
  units: string | null;
  currencyCode: string | null;
  exchangeRate: string | null;
  valueUsd: string | null;
  pctValue: string | null;
  payoffProfile: string | null;
  assetCategory: string | null;
  issuerCategory: string | null;
  investmentCountry: string | null;
  isRestrictedSecurity: string | null;
  fairValueLevel: string | null;
  raw: unknown;
}

export interface ParsedFiling {
  registrantName: string | null;
  registrantCik: string | null;
  seriesName: string | null;
  seriesId: string | null;
  fiscalYearEnd: string | null;
  reportPeriodDate: string | null;
  totalAssets: string | null;
  totalLiabilities: string | null;
  netAssets: string | null;
  holdings: ParsedHolding[];
}

const ARRAY_TAGS = new Set(["invstOrSec", "other", "isin", "ticker"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

type Node = Record<string, unknown> | undefined;

/** Text content of a child element, or null when absent or empty. */
function text(node: Node, key: string): string | null {
  if (!node) return null;
  const v = node[key];
  if (v == null) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (typeof v === "object" && "#text" in (v as object)) {
    const t = String((v as Record<string, unknown>)["#text"]).trim();
    return t === "" ? null : t;
  }
  return null;
}

function attr(node: unknown, key: string): string | null {
  if (!node || typeof node !== "object") return null;
  const v = (node as Record<string, unknown>)[`@_${key}`];
  return v == null || String(v).trim() === "" ? null : String(v).trim();
}

function firstAttr(list: unknown, key: string): string | null {
  if (!Array.isArray(list)) return attr(list, key);
  for (const item of list) {
    const v = attr(item, key);
    if (v) return v;
  }
  return null;
}

export function parseNport(xml: string): ParsedFiling {
  const doc = parser.parse(xml) as Record<string, Node>;
  const root = doc.edgarSubmission as Record<string, Node> | undefined;
  if (!root) throw new Error("Not an N-PORT submission: <edgarSubmission> root element not found.");
  const formData = root.formData as Record<string, Node> | undefined;
  if (!formData) throw new Error("N-PORT submission has no <formData> section.");
  const gen = formData.genInfo;
  const fund = formData.fundInfo;
  const list = ((formData.invstOrSecs as Record<string, unknown> | undefined)?.invstOrSec ?? []) as Record<string, unknown>[];

  const holdings: ParsedHolding[] = list.map((s, i) => {
    const ids = (s.identifiers ?? {}) as Record<string, unknown>;
    const others = Array.isArray(ids.other) ? ids.other : [];
    // Currency is either <curCd> or <currencyConditional curCd=".." exchangeRt="..">
    const curCond = s.currencyConditional;
    // Asset and issuer category are either a plain element or a "conditional" element with an attribute
    const assetCond = s.assetConditional;
    const issuerCond = s.issuerConditional;
    return {
      rowIndex: i + 1,
      name: text(s, "name"),
      lei: text(s, "lei"),
      title: text(s, "title"),
      cusip: text(s, "cusip"),
      isin: firstAttr(ids.isin, "value"),
      ticker: firstAttr(ids.ticker, "value"),
      otherIdentifiers: others
        .map((o) => ({ desc: attr(o, "otherDesc"), value: attr(o, "value") ?? "" }))
        .filter((o) => o.value !== ""),
      balance: text(s, "balance"),
      units: text(s, "units"),
      currencyCode: text(s, "curCd") ?? attr(curCond, "curCd"),
      exchangeRate: attr(curCond, "exchangeRt"),
      valueUsd: text(s, "valUSD"),
      pctValue: text(s, "pctVal"),
      payoffProfile: text(s, "payoffProfile"),
      assetCategory: text(s, "assetCat") ?? (attr(assetCond, "assetCat") ? `${attr(assetCond, "assetCat")}${attr(assetCond, "description") ? `: ${attr(assetCond, "description")}` : ""}` : null),
      issuerCategory: text(s, "issuerCat") ?? (attr(issuerCond, "issuerCat") ? `${attr(issuerCond, "issuerCat")}${attr(issuerCond, "desc") ? `: ${attr(issuerCond, "desc")}` : ""}` : null),
      investmentCountry: text(s, "invCountry"),
      isRestrictedSecurity: text(s, "isRestrictedSec"),
      fairValueLevel: text(s, "fairValLevel"),
      raw: s,
    };
  });

  return {
    registrantName: text(gen, "regName"),
    registrantCik: text(gen, "regCik"),
    seriesName: text(gen, "seriesName"),
    seriesId: text(gen, "seriesId"),
    fiscalYearEnd: text(gen, "repPdEnd"),
    reportPeriodDate: text(gen, "repPdDate"),
    totalAssets: text(fund, "totAssets"),
    totalLiabilities: text(fund, "totLiabs"),
    netAssets: text(fund, "netAssets"),
    holdings,
  };
}
