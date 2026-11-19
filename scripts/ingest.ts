// Loads the filings listed in data/raw/manifest.json into Postgres, then reconciles the two periods.
// Idempotent: filings already ingested (by accession number) and runs already created are left untouched,
// so re-running never overwrites reviewer decisions.

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../src/db";
import { auditLog, exceptions, filings, holdings, reconciliationRuns } from "../src/db/schema";
import { parseNport } from "../src/lib/nport-parser";
import { reconcile, DEFAULT_PARAMS } from "../src/lib/reconcile";

interface ManifestFiling {
  cik: string;
  seriesId: string;
  seriesName: string;
  accession: string;
  filingDate: string;
  reportPeriodDate: string;
  url: string;
  localPath: string;
  sha256: string;
}

const SYSTEM_ACTOR = "system (ingest script)";

async function ingestFiling(f: ManifestFiling): Promise<number> {
  const existing = await db.select({ id: filings.id }).from(filings).where(eq(filings.accessionNumber, f.accession));
  if (existing.length) {
    console.log(`skip   ${f.accession} (already ingested as filing #${existing[0].id})`);
    return existing[0].id;
  }

  const xml = await readFile(path.resolve(f.localPath), "utf8");
  const sha = createHash("sha256").update(xml).digest("hex");
  if (sha !== f.sha256) throw new Error(`Checksum mismatch for ${f.accession}: cached file changed since download.`);

  const parsed = parseNport(xml);
  if (parsed.seriesId !== f.seriesId) {
    throw new Error(`Series mismatch for ${f.accession}: manifest says ${f.seriesId}, filing says ${parsed.seriesId}.`);
  }
  if (!parsed.reportPeriodDate) throw new Error(`${f.accession} has no repPdDate.`);

  const accNoDash = f.accession.replace(/-/g, "");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(filings)
      .values({
        cik: f.cik,
        registrantName: parsed.registrantName,
        seriesId: parsed.seriesId!,
        seriesName: parsed.seriesName ?? f.seriesName,
        accessionNumber: f.accession,
        filingDate: f.filingDate,
        fiscalYearEnd: parsed.fiscalYearEnd,
        reportPeriodDate: parsed.reportPeriodDate!,
        totalAssets: parsed.totalAssets,
        totalLiabilities: parsed.totalLiabilities,
        netAssets: parsed.netAssets,
        filingUrl: f.url,
        indexUrl: `https://www.sec.gov/Archives/edgar/data/${f.cik}/${accNoDash}/${f.accession}-index.htm`,
        sourceSha256: sha,
      })
      .returning({ id: filings.id });

    if (parsed.holdings.length) {
      await tx.insert(holdings).values(
        parsed.holdings.map((h) => ({
          filingId: row.id,
          rowIndex: h.rowIndex,
          name: h.name,
          lei: h.lei,
          title: h.title,
          cusip: h.cusip,
          isin: h.isin,
          ticker: h.ticker,
          otherIdentifiers: h.otherIdentifiers,
          balance: h.balance,
          units: h.units,
          currencyCode: h.currencyCode,
          exchangeRate: h.exchangeRate,
          valueUsd: h.valueUsd,
          pctValue: h.pctValue,
          payoffProfile: h.payoffProfile,
          assetCategory: h.assetCategory,
          issuerCategory: h.issuerCategory,
          investmentCountry: h.investmentCountry,
          isRestrictedSecurity: h.isRestrictedSecurity,
          fairValueLevel: h.fairValueLevel,
          raw: h.raw,
        })),
      );
    }
    await tx.insert(auditLog).values({
      actor: SYSTEM_ACTOR,
      action: "INGEST",
      metadata: { accessionNumber: f.accession, filingId: row.id, holdings: parsed.holdings.length, sourceSha256: sha, url: f.url },
    });
    console.log(`ingest ${f.accession} period ${parsed.reportPeriodDate}: ${parsed.holdings.length} holdings (filing #${row.id})`);
    return row.id;
  });
}

async function runReconciliation(priorId: number, currentId: number) {
  const existing = await db
    .select({ id: reconciliationRuns.id })
    .from(reconciliationRuns)
    .where(and(eq(reconciliationRuns.priorFilingId, priorId), eq(reconciliationRuns.currentFilingId, currentId)));
  if (existing.length) {
    console.log(`skip   reconciliation run #${existing[0].id} already exists for filings #${priorId} -> #${currentId}`);
    return;
  }
  const load = (filingId: number) => db.select().from(holdings).where(eq(holdings.filingId, filingId)).orderBy(asc(holdings.rowIndex));
  const [prior, current] = await Promise.all([load(priorId), load(currentId)]);
  const result = reconcile(prior, current, DEFAULT_PARAMS);

  await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(reconciliationRuns)
      .values({ priorFilingId: priorId, currentFilingId: currentId, params: { ...DEFAULT_PARAMS, stats: result.stats } })
      .returning({ id: reconciliationRuns.id });
    if (result.exceptions.length) {
      await tx.insert(exceptions).values(result.exceptions.map((e) => ({ ...e, runId: run.id })));
    }
    await tx.insert(auditLog).values({
      actor: SYSTEM_ACTOR,
      action: "RECONCILE",
      metadata: { runId: run.id, priorFilingId: priorId, currentFilingId: currentId, exceptions: result.exceptions.length, stats: result.stats },
    });
    console.log(`recon  run #${run.id}: ${result.stats.matched} matched, ${result.exceptions.length} exceptions`);
  });
}

async function main() {
  const manifest = JSON.parse(await readFile(process.env.MANIFEST ?? "data/raw/manifest.json", "utf8")) as { filings: ManifestFiling[] };
  const sorted = [...manifest.filings].sort((a, b) => a.reportPeriodDate.localeCompare(b.reportPeriodDate));
  if (sorted.length < 2) throw new Error("Need at least two filings in data/raw/manifest.json. Run `npm run fetch` first.");
  const ids: number[] = [];
  for (const f of sorted) ids.push(await ingestFiling(f));
  // Reconcile the two most recent periods: prior -> current
  await runReconciliation(ids[ids.length - 2], ids[ids.length - 1]);
}

main().then(() => process.exit(0), (err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
