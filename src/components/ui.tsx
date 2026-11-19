import Link from "next/link";
import { TYPE_LABELS } from "@/lib/format";

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
      {children && <div className="mt-1 max-w-[72ch] text-sm text-muted">{children}</div>}
    </header>
  );
}

const SEV: Record<string, string> = {
  high: "bg-high-bg text-high",
  medium: "bg-medium-bg text-medium",
  low: "bg-low-bg text-low",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium ${SEV[severity] ?? SEV.low}`}>
      <span aria-hidden className="inline-block size-1.5 rounded-full bg-current" />
      {severity[0].toUpperCase() + severity.slice(1)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "approved"
      ? "border-approved/30 bg-approved-bg text-approved"
      : status === "dismissed"
        ? "border-rule bg-wash text-dismissed"
        : "border-link/30 bg-panel text-link";
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${cls}`}>{status[0].toUpperCase() + status.slice(1)}</span>;
}

export function TypeLabel({ type }: { type: string }) {
  return <span>{TYPE_LABELS[type] ?? type}</span>;
}

export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-rule bg-panel px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      <div className="mx-auto mt-2 max-w-[60ch] text-sm text-muted">{children}</div>
    </div>
  );
}

export function NoDataYet() {
  return (
    <EmptyState title="No filings ingested yet">
      <p>Fetch two NPORT-P filings from EDGAR and load them, then refresh this page:</p>
      <pre className="mt-3 inline-block rounded bg-wash px-3 py-2 text-left text-xs text-ink">
        npm run fetch{"\n"}npm run ingest
      </pre>
    </EmptyState>
  );
}

export function FilingLink({ accession, url, indexUrl }: { accession: string; url: string; indexUrl: string }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <a href={indexUrl} target="_blank" rel="noreferrer" className="text-link underline decoration-link/30 underline-offset-2 hover:decoration-link">
        {accession}
      </a>
      <a href={url} target="_blank" rel="noreferrer" className="text-xs text-muted underline decoration-rule underline-offset-2 hover:text-link">
        XML
      </a>
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function ErrorPanel({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-high/30 bg-high-bg px-5 py-4">
      <p className="font-medium text-high">{title}</p>
      <p className="mt-1 text-sm text-ink">{message}</p>
      <div className="mt-3 flex gap-3 text-sm">
        {onRetry && (
          <button onClick={onRetry} className="rounded-md border border-rule bg-panel px-3 py-1.5 font-medium hover:bg-wash">
            Try again
          </button>
        )}
        <Link href="/" className="px-1 py-1.5 text-link underline underline-offset-2">
          Go to overview
        </Link>
      </div>
    </div>
  );
}
