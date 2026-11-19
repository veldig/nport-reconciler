import Link from "next/link";
import { getOverview } from "@/server/queries";
import { tallyExceptions } from "@/lib/tally";
import { diffStrings } from "@/lib/decimal";
import { fmtDate, fmtExact, fmtUsdCompact, TYPE_LABELS } from "@/lib/format";
import { FilingLink, NoDataYet, PageHeader } from "@/components/ui";

const SEV_TEXT = { high: "text-high", medium: "text-medium", low: "text-low" } as const;

export default async function OverviewPage() {
  const data = await getOverview();
  if (!data) {
    return (
      <>
        <PageHeader title="Overview" />
        <NoDataYet />
      </>
    );
  }
  const { run, prior, current, byType, byStatus } = data;
  const fund = current.filing;
  const statusCount = (s: string) => byStatus.find((b) => b.status === s)?.count ?? 0;
  const total = byStatus.reduce((a, b) => a + b.count, 0);
  const open = statusCount("open");
  const tally = tallyExceptions(byType);
  // Holdings above 100% of net assets mean liabilities exceed the fund's other assets (cash, receivables).
  const overHundred = [prior, current].some((p) => {
    const d = diffStrings(p.filing.netAssets, p.sumValueUsd);
    return d != null && d.startsWith("-");
  });

  const periods = [
    { label: "Prior period", p: prior },
    { label: "Current period", p: current },
  ];

  return (
    <>
      <PageHeader title={fund.ticker ? `${fund.seriesName} (${fund.ticker})` : fund.seriesName}>
        <span className="flex flex-wrap gap-x-5 gap-y-1">
          <span>Trust: {fund.registrantName}</span>
          <span>CIK {fund.cik}</span>
          <span>Series {fund.seriesId}</span>
        </span>
      </PageHeader>

      <section aria-labelledby="periods" className="mb-8">
        <h2 id="periods" className="sr-only">Periods compared</h2>
        <div className="grid overflow-hidden rounded-lg border border-rule bg-panel md:grid-cols-2">
          {periods.map(({ label, p }, i) => (
            <div key={label} className={`p-5 ${i === 1 ? "border-t border-rule md:border-l md:border-t-0" : ""}`}>
              <p className="text-sm text-muted">{label}</p>
              <p className="mt-0.5 text-lg font-semibold">{fmtDate(p.filing.reportPeriodDate)}</p>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted">Filing</dt>
                <dd><FilingLink accession={p.filing.accessionNumber} url={p.filing.filingUrl} indexUrl={p.filing.indexUrl} /></dd>
                <dt className="text-muted">Filed on</dt>
                <dd>{fmtDate(p.filing.filingDate)}</dd>
                <dt className="text-muted">Holdings</dt>
                <dd>{p.holdingsCount} rows</dd>
                <dt className="text-muted">Net assets</dt>
                <dd>
                  <span className="font-medium">{fmtUsdCompact(p.filing.netAssets)}</span>
                  <span className="ml-2 text-xs text-muted">{fmtExact(p.filing.netAssets)} as filed</span>
                </dd>
                <dt className="text-muted">Sum of holdings</dt>
                <dd>
                  {fmtExact(p.sumValueUsd)} USD
                  <span className="ml-2 text-xs text-muted">{fmtExact(p.sumPctValue)}% of net assets</span>
                </dd>
                <dt className="text-muted">Net assets minus holdings</dt>
                <dd>{fmtExact(diffStrings(p.filing.netAssets, p.sumValueUsd))} USD</dd>
              </dl>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {overHundred
            ? "Holdings can sum above 100% of net assets when the fund's liabilities, such as payables, exceed its cash and other assets that are not listed as holdings. These sums are computed exactly from the filed values and match the filing."
            : "Holdings sum below 100% of net assets when the fund holds cash and other assets that are not listed as holdings. These sums are computed exactly from the filed values and match the filing."}
        </p>
      </section>

      <section aria-labelledby="exceptions-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="exceptions-heading" className="text-base font-semibold">Exceptions</h2>
            <p className="text-sm text-muted">
              Run #{run.runId}: {total} exceptions, {open} open, {statusCount("approved")} approved, {statusCount("dismissed")} dismissed.
            </p>
          </div>
          {open > 0 && (
            <Link href="/exceptions?status=open" className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink/90">
              Review {open} open
            </Link>
          )}
        </div>

        {total > 0 && (
          <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-wash" role="img" aria-label={`${total - open} of ${total} exceptions resolved`}>
            <div className="bg-approved" style={{ width: `${(statusCount("approved") / total) * 100}%` }} />
            <div className="bg-faint" style={{ width: `${(statusCount("dismissed") / total) * 100}%` }} />
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-rule bg-panel">
          <table className="w-full text-sm">
            <thead className="bg-wash text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 text-right font-medium">High</th>
                <th className="px-4 py-2 text-right font-medium">Medium</th>
                <th className="px-4 py-2 text-right font-medium">Low</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {tally.rows.map((row) => {
                const t = row.type;
                const n = row.total;
                return (
                  <tr key={t} className="border-t border-rule">
                    <td className="px-4 py-2">
                      {n > 0 ? (
                        <Link href={`/exceptions?type=${t}`} className="text-link underline decoration-link/30 underline-offset-2 hover:decoration-link">
                          {TYPE_LABELS[t]}
                        </Link>
                      ) : (
                        <span className="text-muted">{TYPE_LABELS[t]}</span>
                      )}
                    </td>
                    {(["high", "medium", "low"] as const).map((s) => {
                      const c = row[s];
                      return (
                        <td key={s} className={`px-4 py-2 text-right ${c ? `${SEV_TEXT[s]} font-medium` : "text-faint"}`}>
                          {c || "0"}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right font-medium">{n}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-rule bg-wash font-medium">
                <td className="px-4 py-2">Total</td>
                {(["high", "medium", "low"] as const).map((s) => (
                  <td key={s} className="px-4 py-2 text-right">{tally.rows.reduce((a, r) => a + r[s], 0)}</td>
                ))}
                <td className="px-4 py-2 text-right">{tally.total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}
