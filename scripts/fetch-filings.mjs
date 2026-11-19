#!/usr/bin/env node
// Fetches the most recent NPORT-P filings for one fund series from SEC EDGAR.
// No dependencies, so it runs before `npm install`.
//
// Usage:
//   SEC_USER_AGENT="Your Name you@example.com" node scripts/fetch-filings.mjs
//   SEC_USER_AGENT="..." node scripts/fetch-filings.mjs --list   (show every series this CIK files for)
//
// SEC fair access rules: a descriptive User-Agent with contact info, and under 10 requests/second.
// Every downloaded filing is cached in data/raw and never fetched twice.

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = path.join(ROOT, "data", "raw");
const MIN_INTERVAL_MS = 150; // about 6.7 requests/second, safely under SEC's limit of 10
const MAX_FILINGS_TO_SCAN = 80;

const UA = process.env.SEC_USER_AGENT;
if (!UA || !/@/.test(UA) || /example\.com/.test(UA)) {
  console.error('Set SEC_USER_AGENT to your name and email, e.g. SEC_USER_AGENT="Jane Doe jane@yourdomain.com"');
  process.exit(1);
}
const listMode = process.argv.includes("--list");
const config = JSON.parse(await readFile(path.join(ROOT, "fund.config.json"), "utf8"));
const cik = String(Number(config.cik));
const cik10 = cik.padStart(10, "0");

let lastRequest = 0;
async function secGet(url) {
  const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" } });
    if (res.ok) return await res.text();
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      continue;
    }
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
  throw new Error(`Gave up after 3 attempts: ${url}`);
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function cached(localPath, url) {
  if (await exists(localPath)) return { text: await readFile(localPath, "utf8"), fromCache: true };
  const text = await secGet(url);
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, text);
  return { text, fromCache: false };
}

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`));
  return m ? m[1].trim() : null;
};

await mkdir(RAW_DIR, { recursive: true });
const subUrl = `https://data.sec.gov/submissions/CIK${cik10}.json`;
// The submissions index changes as new filings land, so it is refreshed on every run.
const subText = await secGet(subUrl);
await writeFile(path.join(RAW_DIR, `submissions-CIK${cik10}.json`), subText);
const sub = JSON.parse(subText);
console.log(`EDGAR entity: ${sub.name} (CIK ${cik})`);

const r = sub.filings.recent;
const nport = [];
for (let i = 0; i < r.form.length; i++) {
  if (r.form[i] === "NPORT-P") {
    nport.push({ accession: r.accessionNumber[i], filingDate: r.filingDate[i], reportDate: r.reportDate[i] });
  }
}
nport.sort((a, b) => (a.filingDate < b.filingDate ? 1 : -1));
console.log(`Found ${nport.length} NPORT-P filings in the recent index.`);

const matches = [];
const seen = new Map();
for (const f of nport.slice(0, MAX_FILINGS_TO_SCAN)) {
  const accNoDash = f.accession.replace(/-/g, "");
  const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoDash}/primary_doc.xml`;
  const localPath = path.join(RAW_DIR, cik, `${f.accession}.xml`);
  const { text, fromCache } = await cached(localPath, url);
  const seriesName = tag(text, "seriesName");
  const seriesId = tag(text, "seriesId");
  const repPdDate = tag(text, "repPdDate");
  seen.set(seriesId, seriesName);
  const isMatch = config.seriesId
    ? seriesId === config.seriesId
    : (seriesName || "").toLowerCase() === config.seriesName.toLowerCase();
  if (!listMode) {
    console.log(`${fromCache ? "cache" : "fetch"} ${f.accession} ${seriesId} ${seriesName} period ${repPdDate}${isMatch ? "  <- match" : ""}`);
  }
  if (isMatch && !listMode) {
    matches.push({
      cik, seriesId, seriesName, accession: f.accession, filingDate: f.filingDate,
      reportPeriodDate: repPdDate, fiscalYearEnd: tag(text, "repPdEnd"),
      url, localPath: path.relative(ROOT, localPath),
      sha256: createHash("sha256").update(text).digest("hex"),
    });
    if (matches.length >= (config.filingsToKeep ?? 2)) break;
  }
}

if (listMode) {
  console.log("\nSeries seen in this CIK's NPORT-P filings:");
  for (const [id, name] of seen) console.log(`  ${id}  ${name}`);
  process.exit(0);
}
if (matches.length < 2) {
  console.error(`\nOnly found ${matches.length} filing(s) for "${config.seriesName}". Run with --list to see series names.`);
  process.exit(1);
}
await writeFile(
  path.join(RAW_DIR, "manifest.json"),
  JSON.stringify({ fetchedAt: new Date().toISOString(), entityName: sub.name, filings: matches }, null, 2),
);
console.log(`\nWrote data/raw/manifest.json with ${matches.length} filings for ${matches[0].seriesName} (${matches[0].seriesId}).`);
