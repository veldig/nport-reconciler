import { sql } from "drizzle-orm";
import {
  pgTable, check, serial, integer, text, numeric, jsonb, timestamp, uniqueIndex, index, date,
} from "drizzle-orm/pg-core";

// Numeric columns use Postgres `numeric` in string mode, so values keep every digit exactly as filed.

export const filings = pgTable("filings", {
  id: serial("id").primaryKey(),
  cik: text("cik").notNull(),
  registrantName: text("registrant_name"),
  seriesId: text("series_id").notNull(),
  seriesName: text("series_name").notNull(),
  ticker: text("ticker"), // from SEC's company_tickers_mf.json, matched on series ID
  tickerSource: text("ticker_source"),
  accessionNumber: text("accession_number").notNull(),
  formType: text("form_type").notNull().default("NPORT-P"),
  filingDate: date("filing_date"),
  fiscalYearEnd: date("fiscal_year_end"),
  reportPeriodDate: date("report_period_date").notNull(),
  totalAssets: numeric("total_assets"),
  totalLiabilities: numeric("total_liabilities"),
  netAssets: numeric("net_assets"),
  filingUrl: text("filing_url").notNull(),
  indexUrl: text("index_url").notNull(),
  sourceSha256: text("source_sha256").notNull(),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("filings_accession_uq").on(t.accessionNumber)]);

export const holdings = pgTable("holdings", {
  id: serial("id").primaryKey(),
  filingId: integer("filing_id").notNull().references(() => filings.id, { onDelete: "restrict" }),
  rowIndex: integer("row_index").notNull(), // 1-based position of the <invstOrSec> element in the source file
  name: text("name"),
  lei: text("lei"),
  title: text("title"),
  cusip: text("cusip"),
  isin: text("isin"),
  ticker: text("ticker"),
  otherIdentifiers: jsonb("other_identifiers").$type<{ desc: string | null; value: string }[]>(),
  balance: numeric("balance"),
  units: text("units"),
  currencyCode: text("currency_code"),
  exchangeRate: numeric("exchange_rate"),
  valueUsd: numeric("value_usd"),
  pctValue: numeric("pct_value"),
  payoffProfile: text("payoff_profile"),
  assetCategory: text("asset_category"),
  issuerCategory: text("issuer_category"),
  investmentCountry: text("investment_country"),
  isRestrictedSecurity: text("is_restricted_security"),
  fairValueLevel: text("fair_value_level"),
  raw: jsonb("raw").notNull(), // the full parsed element, kept as evidence
}, (t) => [index("holdings_filing_idx").on(t.filingId)]);

// Constrained text columns (CHECK constraints) rather than Postgres enums: same guarantees,
// simpler migrations, and compatible with every Postgres wire implementation.
export const EXCEPTION_TYPE_VALUES = [
  "NEW_POSITION",
  "REMOVED_POSITION",
  "WEIGHT_CHANGE",
  "VALUE_SHARE_MISMATCH",
  "MISSING_IDENTIFIER",
  "DUPLICATE_HOLDING",
  "NON_USD_CURRENCY",
  "IDENTIFIER_CHANGE",
] as const;
export const SEVERITY_VALUES = ["high", "medium", "low"] as const;
export const STATUS_VALUES = ["open", "approved", "dismissed"] as const;
export const AUDIT_ACTION_VALUES = ["INGEST", "RECONCILE", "APPROVE", "DISMISS", "REOPEN"] as const;
const inList = (vals: readonly string[]) => sql.raw(vals.map((v) => `'${v}'`).join(", "));

export const reconciliationRuns = pgTable("reconciliation_runs", {
  id: serial("id").primaryKey(),
  priorFilingId: integer("prior_filing_id").notNull().references(() => filings.id),
  currentFilingId: integer("current_filing_id").notNull().references(() => filings.id),
  params: jsonb("params").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("runs_pair_uq").on(t.priorFilingId, t.currentFilingId)]);

export const exceptions = pgTable("exceptions", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => reconciliationRuns.id),
  type: text("type", { enum: EXCEPTION_TYPE_VALUES }).notNull(),
  severity: text("severity", { enum: SEVERITY_VALUES }).notNull(),
  status: text("status", { enum: STATUS_VALUES }).notNull().default("open"),
  matchKey: text("match_key"), // e.g. "CUSIP:00507V109"
  matchedBy: text("matched_by"), // CUSIP | ISIN | LEI+NAME | NAME+TITLE | NONE
  priorHoldingIds: jsonb("prior_holding_ids").$type<number[]>().notNull(),
  currentHoldingIds: jsonb("current_holding_ids").$type<number[]>().notNull(),
  securityName: text("security_name"),
  summary: text("summary").notNull(),
  details: jsonb("details").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("exceptions_run_idx").on(t.runId),
  index("exceptions_status_idx").on(t.status),
  check("exceptions_type_ck", sql`${t.type} in (${inList(EXCEPTION_TYPE_VALUES)})`),
  check("exceptions_severity_ck", sql`${t.severity} in (${inList(SEVERITY_VALUES)})`),
  check("exceptions_status_ck", sql`${t.status} in (${inList(STATUS_VALUES)})`),
]);

// Append-only. A database trigger (migration 0001) rejects UPDATE, DELETE and TRUNCATE.
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action", { enum: AUDIT_ACTION_VALUES }).notNull(),
  exceptionId: integer("exception_id").references(() => exceptions.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audit_exception_idx").on(t.exceptionId),
  check("audit_action_ck", sql`${t.action} in (${inList(AUDIT_ACTION_VALUES)})`),
  // A review decision must name the exception and give a reason.
  check("audit_decision_reason_ck", sql`${t.action} not in ('APPROVE', 'DISMISS', 'REOPEN') or (${t.exceptionId} is not null and length(trim(coalesce(${t.reason}, ''))) > 0)`),
]);

export type Filing = typeof filings.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
export type NewHolding = typeof holdings.$inferInsert;
export type ExceptionRow = typeof exceptions.$inferSelect;
export type AuditRow = typeof auditLog.$inferSelect;
