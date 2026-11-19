CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"exception_id" integer,
	"from_status" text,
	"to_status" text,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_action_ck" CHECK ("audit_log"."action" in ('INGEST', 'RECONCILE', 'APPROVE', 'DISMISS', 'REOPEN')),
	CONSTRAINT "audit_decision_reason_ck" CHECK ("audit_log"."action" not in ('APPROVE', 'DISMISS', 'REOPEN') or ("audit_log"."exception_id" is not null and length(trim(coalesce("audit_log"."reason", ''))) > 0))
);
--> statement-breakpoint
CREATE TABLE "exceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"match_key" text,
	"matched_by" text,
	"prior_holding_ids" jsonb NOT NULL,
	"current_holding_ids" jsonb NOT NULL,
	"security_name" text,
	"summary" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exceptions_type_ck" CHECK ("exceptions"."type" in ('NEW_POSITION', 'REMOVED_POSITION', 'WEIGHT_CHANGE', 'VALUE_SHARE_MISMATCH', 'MISSING_IDENTIFIER', 'DUPLICATE_HOLDING', 'NON_USD_CURRENCY')),
	CONSTRAINT "exceptions_severity_ck" CHECK ("exceptions"."severity" in ('high', 'medium', 'low')),
	CONSTRAINT "exceptions_status_ck" CHECK ("exceptions"."status" in ('open', 'approved', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "filings" (
	"id" serial PRIMARY KEY NOT NULL,
	"cik" text NOT NULL,
	"registrant_name" text,
	"series_id" text NOT NULL,
	"series_name" text NOT NULL,
	"accession_number" text NOT NULL,
	"form_type" text DEFAULT 'NPORT-P' NOT NULL,
	"filing_date" date,
	"fiscal_year_end" date,
	"report_period_date" date NOT NULL,
	"total_assets" numeric,
	"total_liabilities" numeric,
	"net_assets" numeric,
	"filing_url" text NOT NULL,
	"index_url" text NOT NULL,
	"source_sha256" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" serial PRIMARY KEY NOT NULL,
	"filing_id" integer NOT NULL,
	"row_index" integer NOT NULL,
	"name" text,
	"lei" text,
	"title" text,
	"cusip" text,
	"isin" text,
	"ticker" text,
	"other_identifiers" jsonb,
	"balance" numeric,
	"units" text,
	"currency_code" text,
	"exchange_rate" numeric,
	"value_usd" numeric,
	"pct_value" numeric,
	"payoff_profile" text,
	"asset_category" text,
	"issuer_category" text,
	"investment_country" text,
	"is_restricted_security" text,
	"fair_value_level" text,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"prior_filing_id" integer NOT NULL,
	"current_filing_id" integer NOT NULL,
	"params" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_exception_id_exceptions_id_fk" FOREIGN KEY ("exception_id") REFERENCES "public"."exceptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_run_id_reconciliation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."reconciliation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_filing_id_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."filings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_prior_filing_id_filings_id_fk" FOREIGN KEY ("prior_filing_id") REFERENCES "public"."filings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_current_filing_id_filings_id_fk" FOREIGN KEY ("current_filing_id") REFERENCES "public"."filings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_exception_idx" ON "audit_log" USING btree ("exception_id");--> statement-breakpoint
CREATE INDEX "exceptions_run_idx" ON "exceptions" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "exceptions_status_idx" ON "exceptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "filings_accession_uq" ON "filings" USING btree ("accession_number");--> statement-breakpoint
CREATE INDEX "holdings_filing_idx" ON "holdings" USING btree ("filing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_pair_uq" ON "reconciliation_runs" USING btree ("prior_filing_id","current_filing_id");