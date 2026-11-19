import { getExceptionQueue } from "@/server/queries";
import { ExceptionQueue } from "@/components/exception-queue";
import { EmptyState, NoDataYet, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export default async function ExceptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, sp] = await Promise.all([getExceptionQueue(), searchParams]);
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  if (!data) {
    return (
      <>
        <PageHeader title="Exception queue" />
        <NoDataYet />
      </>
    );
  }
  const { run } = data;
  return (
    <>
      <PageHeader title="Exception queue">
        {run.current.seriesName}{run.current.ticker ? ` (${run.current.ticker})` : ""}: {fmtDate(run.prior.reportPeriodDate)} compared with {fmtDate(run.current.reportPeriodDate)}. Approve to accept a change as
        explained, or dismiss when it is not a real issue. Both need a reason, and both are written to the audit log.
      </PageHeader>
      {data.exceptions.length === 0 ? (
        <EmptyState title="No exceptions in this run">Every position matched between the two periods and passed the data quality checks.</EmptyState>
      ) : (
        <ExceptionQueue
          run={{ runId: run.runId, prior: run.prior, current: run.current }}
          exceptions={data.exceptions}
          sourceRows={data.sourceRows}
          history={data.history}
          initialFilters={{ type: one("type"), severity: one("severity"), status: one("status"), q: one("q"), id: one("id") }}
        />
      )}
    </>
  );
}
