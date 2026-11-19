import "server-only";
import { connection } from "next/server";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, exceptions, filings, holdings, reconciliationRuns, type Filing } from "@/db/schema";
import { sumStrings } from "@/lib/decimal";

export interface RunContext {
  runId: number;
  createdAt: Date;
  params: Record<string, unknown>;
  prior: Filing;
  current: Filing;
}

/** The most recent reconciliation run, or null when nothing has been ingested yet. */
export async function getLatestRun(): Promise<RunContext | null> {
  await connection(); // always read fresh data at request time
  const [run] = await db.select().from(reconciliationRuns).orderBy(desc(reconciliationRuns.id)).limit(1);
  if (!run) return null;
  const rows = await db.select().from(filings).where(inArray(filings.id, [run.priorFilingId, run.currentFilingId]));
  const prior = rows.find((f) => f.id === run.priorFilingId);
  const current = rows.find((f) => f.id === run.currentFilingId);
  if (!prior || !current) throw new Error(`Reconciliation run #${run.id} references a filing that no longer exists.`);
  return { runId: run.id, createdAt: run.createdAt, params: run.params as Record<string, unknown>, prior, current };
}

export async function getOverview() {
  const run = await getLatestRun();
  if (!run) return null;

  const periodStats = async (f: Filing) => {
    const rows = await db
      .select({ valueUsd: holdings.valueUsd, pctValue: holdings.pctValue, assetCategory: holdings.assetCategory, investmentCountry: holdings.investmentCountry })
      .from(holdings)
      .where(eq(holdings.filingId, f.id));
    return {
      filing: f,
      holdingsCount: rows.length,
      sumValueUsd: sumStrings(rows.map((r) => r.valueUsd)),
      sumPctValue: sumStrings(rows.map((r) => r.pctValue)),
    };
  };

  const [prior, current, byType, byStatus] = await Promise.all([
    periodStats(run.prior),
    periodStats(run.current),
    db
      .select({ type: exceptions.type, severity: exceptions.severity, count: sql<number>`count(*)::int` })
      .from(exceptions)
      .where(eq(exceptions.runId, run.runId))
      .groupBy(exceptions.type, exceptions.severity),
    db
      .select({ status: exceptions.status, count: sql<number>`count(*)::int` })
      .from(exceptions)
      .where(eq(exceptions.runId, run.runId))
      .groupBy(exceptions.status),
  ]);

  return { run, prior, current, byType, byStatus };
}

export async function getExceptionQueue() {
  const run = await getLatestRun();
  if (!run) return null;
  const rows = await db.select().from(exceptions).where(eq(exceptions.runId, run.runId)).orderBy(exceptions.id);

  const holdingIds = [...new Set(rows.flatMap((r) => [...r.priorHoldingIds, ...r.currentHoldingIds]))];
  const sourceRows = holdingIds.length
    ? await db
        .select({ id: holdings.id, filingId: holdings.filingId, rowIndex: holdings.rowIndex, raw: holdings.raw, assetCategory: holdings.assetCategory, issuerCategory: holdings.issuerCategory, investmentCountry: holdings.investmentCountry, fairValueLevel: holdings.fairValueLevel })
        .from(holdings)
        .where(inArray(holdings.id, holdingIds))
    : [];

  const exceptionIds = rows.map((r) => r.id);
  const history = exceptionIds.length
    ? await db.select().from(auditLog).where(inArray(auditLog.exceptionId, exceptionIds)).orderBy(auditLog.id)
    : [];

  return { run, exceptions: rows, sourceRows, history };
}

export async function getAuditLog() {
  await connection();
  return db
    .select({
      id: auditLog.id,
      actor: auditLog.actor,
      action: auditLog.action,
      exceptionId: auditLog.exceptionId,
      fromStatus: auditLog.fromStatus,
      toStatus: auditLog.toStatus,
      reason: auditLog.reason,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
      securityName: exceptions.securityName,
      exceptionType: exceptions.type,
    })
    .from(auditLog)
    .leftJoin(exceptions, eq(auditLog.exceptionId, exceptions.id))
    .orderBy(desc(auditLog.id));
}
