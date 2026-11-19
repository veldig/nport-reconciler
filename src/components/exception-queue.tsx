"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { AuditRow, ExceptionRow, Filing } from "@/db/schema";
import type { PositionSnapshot, ReconException } from "@/lib/reconcile";
import { EXCEPTION_TYPES } from "@/lib/reconcile";
import { ASSET_CAT_LABELS, fmtDate, fmtSigned, fmtTimestamp, TYPE_LABELS, UNIT_LABELS } from "@/lib/format";
import { MIN_REASON_LENGTH } from "@/lib/reviewers";
import { decideException, type Decision } from "@/server/actions";
import { useReviewer } from "./reviewer";
import { DecimalDiff } from "./decimal-diff";
import { EmptyState, FilingLink, SeverityBadge, StatusBadge } from "./ui";

interface SourceRow {
  id: number;
  filingId: number;
  rowIndex: number;
  raw: unknown;
  assetCategory: string | null;
  issuerCategory: string | null;
  investmentCountry: string | null;
  fairValueLevel: string | null;
}

interface Props {
  run: { runId: number; prior: Filing; current: Filing };
  exceptions: ExceptionRow[];
  sourceRows: SourceRow[];
  history: AuditRow[];
  initialFilters: { type: string; severity: string; status: string; q: string; id: string };
}

type Details = ReconException["details"];

const SEV_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function ExceptionQueue({ run, exceptions, sourceRows, history, initialFilters }: Props) {
  const [type, setType] = useState(initialFilters.type);
  const [severity, setSeverity] = useState(initialFilters.severity);
  const [status, setStatus] = useState(initialFilters.status);
  const [q, setQ] = useState(initialFilters.q);
  const [openId, setOpenId] = useState<number | null>(initialFilters.id ? Number(initialFilters.id) : null);

  // Keep filters in the URL so a view can be shared or reloaded.
  useEffect(() => {
    const p = new URLSearchParams();
    if (type) p.set("type", type);
    if (severity) p.set("severity", severity);
    if (status) p.set("status", status);
    if (q) p.set("q", q);
    if (openId) p.set("id", String(openId));
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [type, severity, status, q, openId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return exceptions
      .filter((e) => (!type || e.type === type) && (!severity || e.severity === severity) && (!status || e.status === status))
      .filter((e) => !needle || `${e.securityName ?? ""} ${e.matchKey ?? ""} ${e.summary}`.toLowerCase().includes(needle))
      .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.type.localeCompare(b.type) || a.id - b.id);
  }, [exceptions, type, severity, status, q]);

  const openException = exceptions.find((e) => e.id === openId) ?? null;
  const counts = useMemo(() => {
    const c = { open: 0, approved: 0, dismissed: 0 };
    for (const e of exceptions) c[e.status]++;
    return c;
  }, [exceptions]);
  const anyFilter = type || severity || status || q;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <FilterSelect label="Type" value={type} onChange={setType} options={EXCEPTION_TYPES.map((t) => [t, TYPE_LABELS[t]])} />
        <FilterSelect label="Severity" value={severity} onChange={setSeverity} options={[["high", "High"], ["medium", "Medium"], ["low", "Low"]]} />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[["open", `Open (${counts.open})`], ["approved", `Approved (${counts.approved})`], ["dismissed", `Dismissed (${counts.dismissed})`]]}
        />
        <label className="min-w-48 flex-1">
          <span className="mb-1 block text-xs text-muted">Search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Security name, CUSIP, ISIN"
            className="w-full rounded-md border border-rule bg-panel px-2.5 py-1.5 text-sm placeholder:text-faint"
          />
        </label>
        {anyFilter && (
          <button
            onClick={() => { setType(""); setSeverity(""); setStatus(""); setQ(""); }}
            className="rounded-md px-2.5 py-1.5 text-sm text-link underline underline-offset-2"
          >
            Clear filters
          </button>
        )}
      </div>
      <p className="mb-2 text-xs text-muted" aria-live="polite">
        Showing {filtered.length} of {exceptions.length}
      </p>

      {filtered.length === 0 ? (
        <EmptyState title="Nothing matches these filters">
          {status === "open" && counts.open === 0 ? "Every exception in this run has been reviewed." : "Try clearing a filter to see more exceptions."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-rule bg-panel">
          <table className="w-full text-sm">
            <thead className="bg-wash text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Severity</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Security</th>
                <th className="hidden px-3 py-2 font-medium lg:table-cell">What changed</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setOpenId(e.id)}
                  className={`cursor-pointer border-t border-rule align-top hover:bg-wash/60 ${openId === e.id ? "bg-wash" : ""}`}
                >
                  <td className="px-3 py-2.5"><SeverityBadge severity={e.severity} /></td>
                  <td className="whitespace-nowrap px-3 py-2.5">{TYPE_LABELS[e.type]}</td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={(ev) => { ev.stopPropagation(); setOpenId(e.id); }}
                      className="text-left font-medium hover:text-link"
                      aria-label={`Open evidence for ${e.securityName ?? "exception"} ${TYPE_LABELS[e.type]}`}
                    >
                      {e.securityName ?? "Unnamed holding"}
                    </button>
                    <span className="block text-xs text-muted">{e.matchKey}</span>
                  </td>
                  <td className="hidden max-w-[52ch] px-3 py-2.5 text-muted lg:table-cell">{e.summary}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openException && (
        <EvidenceDrawer
          key={openException.id}
          exception={openException}
          run={run}
          sourceRows={sourceRows}
          history={history.filter((h) => h.exceptionId === openException.id)}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label>
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-rule bg-panel px-2 py-1.5 text-sm">
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

function EvidenceDrawer({
  exception: e, run, sourceRows, history, onClose,
}: {
  exception: ExceptionRow;
  run: Props["run"];
  sourceRows: SourceRow[];
  history: AuditRow[];
  onClose: () => void;
}) {
  const details = e.details as Details;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rowsFor = (ids: number[]) => sourceRows.filter((r) => ids.includes(r.id));
  const priorRows = rowsFor(e.priorHoldingIds);
  const currentRows = rowsFor(e.currentHoldingIds);
  const p = details.prior;
  const c = details.current;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <button aria-label="Close evidence" tabIndex={-1} className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <div className="drawer-in relative flex h-full w-full max-w-[640px] flex-col overflow-y-auto border-l border-rule bg-panel shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-rule bg-panel px-6 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <SeverityBadge severity={e.severity} />
              <span className="text-muted">{TYPE_LABELS[e.type]}</span>
              <StatusBadge status={e.status} />
            </div>
            <h2 id="drawer-title" className="mt-1.5 text-lg font-semibold leading-snug">{e.securityName ?? "Unnamed holding"}</h2>
            <p className="text-sm text-muted">Exception #{e.id}{e.matchedBy !== "NONE" && <>, matched by {e.matchedBy}</>}</p>
          </div>
          <button ref={closeRef} onClick={onClose} className="rounded-md border border-rule px-2.5 py-1 text-sm hover:bg-wash">
            Close
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <section>
            <p className="text-[15px]">{e.summary}</p>
            <p className="mt-1 text-xs text-muted">Rule: {details.rule}</p>
          </section>

          <section aria-labelledby="evidence-h">
            <h3 id="evidence-h" className="mb-2 text-sm font-semibold">Evidence, as filed</h3>
            <div className="overflow-x-auto rounded-lg border border-rule">
              <table className="w-full text-sm">
                <thead className="bg-wash text-left text-muted">
                  <tr>
                    <th className="w-36 px-3 py-2 font-medium"><span className="sr-only">Field</span></th>
                    <th className="px-3 py-2 font-medium">Prior: {fmtDate(run.prior.reportPeriodDate)}</th>
                    <th className="px-3 py-2 font-medium">Current: {fmtDate(run.current.reportPeriodDate)}</th>
                  </tr>
                </thead>
                <tbody className="[&_td]:px-3 [&_td]:py-1.5 [&_td]:align-top [&_tr]:border-t [&_tr]:border-rule">
                  <EvidenceRow label="Source filing"
                    prior={p && <SourceRef filing={run.prior} rows={priorRows} />}
                    current={c && <SourceRef filing={run.current} rows={currentRows} />} />
                  <EvidenceRow label="Name" prior={p?.name} current={c?.name} />
                  <EvidenceRow label="Title" prior={p?.title} current={c?.title} />
                  <EvidenceRow label="CUSIP" prior={p?.cusip} current={c?.cusip} mono />
                  <EvidenceRow label="ISIN" prior={p?.isin} current={c?.isin} mono />
                  <EvidenceRow label="LEI" prior={p?.lei} current={c?.lei} mono />
                  <EvidenceRow label={`Balance${c?.units || p?.units ? ` (${UNIT_LABELS[(c ?? p)!.units ?? ""] ?? (c ?? p)!.units})` : ""}`}
                    prior={p && <DecimalDiff value={p.balance} against={null} />}
                    current={c && <DecimalDiff value={c.balance} against={p?.balance ?? null} />} numeric />
                  <EvidenceRow label="Value (USD)"
                    prior={p && <DecimalDiff value={p.valueUsd} against={null} />}
                    current={c && <DecimalDiff value={c.valueUsd} against={p?.valueUsd ?? null} />} numeric />
                  <EvidenceRow label="% of net assets"
                    prior={p && <DecimalDiff value={p.pctValue} against={null} />}
                    current={c && <DecimalDiff value={c.pctValue} against={p?.pctValue ?? null} />} numeric />
                  <EvidenceRow label="Currency" prior={p?.currencies.join(", ")} current={c?.currencies.join(", ")} />
                  <EvidenceRow label="Payoff" prior={p?.payoffProfile} current={c?.payoffProfile} />
                  <EvidenceRow label="Asset category" prior={catLabel(priorRows[0]?.assetCategory)} current={catLabel(currentRows[0]?.assetCategory)} />
                  <EvidenceRow label="Country" prior={priorRows[0]?.investmentCountry} current={currentRows[0]?.investmentCountry} />
                </tbody>
              </table>
            </div>
            {(p?.aggregatedRows ?? 1) + (c?.aggregatedRows ?? 1) > 2 && (
              <p className="mt-1.5 text-xs text-muted">This position spans several rows in a filing. Balance, value and weight are their exact sum.</p>
            )}
            {p && c && (
              <p className="mt-1.5 text-xs text-muted">Highlighted digits differ from the prior period at the same decimal place.</p>
            )}
          </section>

          {details.deltas && <Deltas d={details.deltas} />}

          {details.rows && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Duplicate rows in the current filing</h3>
              <ul className="space-y-1 text-sm">
                {details.rows.map((r) => (
                  <li key={r.holdingId}>Row {r.rowIndex}: balance {r.balance ?? "not filed"}, value {r.valueUsd ?? "not filed"} USD, {r.pctValue ?? "n/a"}%</li>
                ))}
              </ul>
            </section>
          )}

          <RawRows prior={priorRows} current={currentRows} />

          <DecisionForm exception={e} />

          <section aria-labelledby="history-h">
            <h3 id="history-h" className="mb-2 text-sm font-semibold">History</h3>
            {history.length === 0 ? (
              <p className="text-sm text-muted">No decisions yet. Created by reconciliation run #{run.runId}.</p>
            ) : (
              <ol className="space-y-3 border-l border-rule pl-4">
                {[...history].reverse().map((h) => (
                  <li key={h.id} className="text-sm">
                    <p>
                      <span className="font-medium">{h.actor}</span> {verb(h.action)}{" "}
                      <span className="text-muted">({h.fromStatus} to {h.toStatus})</span>
                    </p>
                    {h.reason && <p className="mt-0.5 text-ink/80">&ldquo;{h.reason}&rdquo;</p>}
                    <p className="mt-0.5 text-xs text-muted">{fmtTimestamp(h.createdAt)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

const verb = (a: string) => ({ APPROVE: "approved", DISMISS: "dismissed", REOPEN: "reopened" })[a] ?? a.toLowerCase();
const catLabel = (c: string | null | undefined) => (c ? (ASSET_CAT_LABELS[c] ? `${ASSET_CAT_LABELS[c]} (${c})` : c) : null);

function EvidenceRow({ label, prior, current, mono, numeric }: { label: string; prior: React.ReactNode; current: React.ReactNode; mono?: boolean; numeric?: boolean }) {
  const cell = (v: React.ReactNode) =>
    v == null || v === "" ? <span className="text-faint">Not in this period</span> : v;
  const changed = typeof prior === "string" && typeof current === "string" && prior !== current;
  return (
    <tr>
      <td className="text-muted">{label}</td>
      <td className={`${numeric ? "text-right" : ""} ${mono ? "tracking-wide" : ""}`}>{cell(prior)}</td>
      <td className={`${numeric ? "text-right" : ""} ${mono ? "tracking-wide" : ""} ${changed ? "bg-marker/50" : ""}`}>{cell(current)}</td>
    </tr>
  );
}

function SourceRef({ filing, rows }: { filing: Filing; rows: SourceRow[] }) {
  return (
    <span>
      <FilingLink accession={filing.accessionNumber} url={filing.filingUrl} indexUrl={filing.indexUrl} />
      <span className="block text-xs text-muted">
        {rows.length ? `invstOrSec row ${rows.map((r) => r.rowIndex).join(", ")}` : ""}
      </span>
    </span>
  );
}

function Deltas({ d }: { d: NonNullable<Details["deltas"]> }) {
  const pct = (x: number | null) => (x == null ? "n/a" : `${x > 0 ? "+" : ""}${x.toFixed(2)}%`);
  return (
    <section aria-labelledby="deltas-h">
      <h3 id="deltas-h" className="mb-2 text-sm font-semibold">Change, current minus prior</h3>
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-rule bg-rule text-sm">
        {[
          ["Balance", fmtSigned(d.balance), pct(d.balancePct)],
          ["Value (USD)", fmtSigned(d.valueUsd), pct(d.valueUsdPct)],
          ["Weight", d.pctValuePp == null ? "n/a" : `${fmtSigned(d.pctValuePp)} pp`, null],
        ].map(([label, exact, rel]) => (
          <div key={label} className="bg-panel px-3 py-2.5">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-0.5 font-medium break-all">{exact}</dd>
            {rel && <dd className="text-xs text-muted">{rel} (computed, 2 dp)</dd>}
          </div>
        ))}
      </dl>
      <p className="mt-1.5 text-xs text-muted">Differences are exact decimal arithmetic on the filed strings. Only the percentage changes are rounded, and they are labeled.</p>
    </section>
  );
}

function RawRows({ prior, current }: { prior: SourceRow[]; current: SourceRow[] }) {
  if (!prior.length && !current.length) return null;
  return (
    <details className="rounded-lg border border-rule">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Raw source elements</summary>
      <div className="grid gap-3 border-t border-rule p-3 text-xs md:grid-cols-2">
        {[["Prior", prior], ["Current", current]].map(([label, rows]) => (
          <div key={label as string} className="min-w-0">
            <p className="mb-1 text-muted">{label as string}</p>
            {(rows as SourceRow[]).length === 0 ? (
              <p className="text-faint">None</p>
            ) : (
              (rows as SourceRow[]).map((r) => (
                <pre key={r.id} className="mb-2 max-h-64 overflow-auto rounded bg-wash p-2 leading-relaxed">
                  {JSON.stringify(r.raw, null, 2)}
                </pre>
              ))
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

function DecisionForm({ exception: e }: { exception: ExceptionRow }) {
  const { reviewer } = useReviewer();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tooShort = reason.trim().length < MIN_REASON_LENGTH;
  const isOpen = e.status === "open";

  const submit = (decision: Decision) => {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const res = await decideException({ exceptionId: e.id, decision, reviewer: reviewer ?? "", reason, expectedStatus: e.status });
      if (res.ok) {
        setReason("");
        setDone(decision === "approve" ? "Approved and logged." : decision === "dismiss" ? "Dismissed and logged." : "Reopened and logged.");
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <section aria-labelledby="decision-h" className="rounded-lg border border-rule bg-wash/60 p-4">
      <h3 id="decision-h" className="text-sm font-semibold">{isOpen ? "Decision" : "Reopen this exception"}</h3>
      <p className="mt-1 text-xs text-muted">Public demo: anyone can record decisions here. In production this would be gated by real auth and roles.</p>
      {!reviewer ? (
        <p className="mt-1 text-sm text-muted">Choose who is reviewing in the sidebar before recording a decision.</p>
      ) : (
        <>
          <label className="mt-2 block">
            <span className="mb-1 block text-xs text-muted">
              Reason, recorded in the audit log under {reviewer}
            </span>
            <textarea
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={isOpen ? "Example: Rebalance on Oct 3 per PM trade blotter; weight change expected." : "Why this needs another look"}
              className="w-full rounded-md border border-rule bg-panel px-2.5 py-2 text-sm placeholder:text-faint"
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {isOpen ? (
              <>
                <button
                  disabled={tooShort || pending}
                  onClick={() => submit("approve")}
                  className="rounded-md bg-approved px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending ? "Saving" : "Approve"}
                </button>
                <button
                  disabled={tooShort || pending}
                  onClick={() => submit("dismiss")}
                  className="rounded-md border border-rule bg-panel px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Dismiss
                </button>
              </>
            ) : (
              <button
                disabled={tooShort || pending}
                onClick={() => submit("reopen")}
                className="rounded-md border border-rule bg-panel px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? "Saving" : "Reopen"}
              </button>
            )}
            <span className="text-xs text-muted">
              {tooShort ? `${MIN_REASON_LENGTH - reason.trim().length} more characters needed` : ""}
            </span>
          </div>
        </>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-high">{error}</p>}
      {done && <p role="status" className="mt-2 text-sm text-approved">{done}</p>}
    </section>
  );
}

export type { PositionSnapshot };
