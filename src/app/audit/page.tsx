import Link from "next/link";
import { getAuditLog } from "@/server/queries";
import { EmptyState, PageHeader } from "@/components/ui";
import { fmtTimestamp, TYPE_LABELS } from "@/lib/format";

const ACTION_LABEL: Record<string, string> = {
  INGEST: "Ingested filing",
  RECONCILE: "Ran reconciliation",
  APPROVE: "Approved",
  DISMISS: "Dismissed",
  REOPEN: "Reopened",
};

function describeSystem(action: string, m: Record<string, unknown> | null) {
  if (!m) return null;
  if (action === "INGEST") return `${m.accessionNumber}: ${m.holdings} holdings, SHA-256 ${String(m.sourceSha256).slice(0, 12)}`;
  if (action === "RECONCILE") return `Run #${m.runId}: ${m.exceptions} exceptions`;
  return null;
}

export default async function AuditPage() {
  const rows = await getAuditLog();
  return (
    <>
      <PageHeader title="Audit log">
        Every ingest, reconciliation and review decision, newest first. The database rejects any update or delete on this table, so entries are permanent.
        <span className="mt-2 block rounded-md border border-rule bg-wash px-3 py-2 text-ink">Public demo: anyone can record decisions here. In production this would be gated by real auth and roles.</span>
      </PageHeader>
      {rows.length === 0 ? (
        <EmptyState title="No activity yet">Entries appear here when filings are ingested and when reviewers approve, dismiss or reopen exceptions.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-rule bg-panel">
          <table className="w-full text-sm">
            <thead className="bg-wash text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Exception</th>
                <th className="px-3 py-2 font-medium">Reason or details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-rule align-top">
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted">{fmtTimestamp(r.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{r.actor}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {ACTION_LABEL[r.action] ?? r.action}
                    {r.fromStatus && r.toStatus && <span className="block text-xs text-muted">{r.fromStatus} to {r.toStatus}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.exceptionId ? (
                      <Link href={`/exceptions?id=${r.exceptionId}`} className="text-link underline decoration-link/30 underline-offset-2 hover:decoration-link">
                        #{r.exceptionId} {r.securityName}
                      </Link>
                    ) : (
                      <span className="text-faint">None</span>
                    )}
                    {r.exceptionType && <span className="block text-xs text-muted">{TYPE_LABELS[r.exceptionType]}</span>}
                  </td>
                  <td className="max-w-[60ch] px-3 py-2.5">
                    {r.reason ?? <span className="text-muted">{describeSystem(r.action, r.metadata as Record<string, unknown> | null)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
