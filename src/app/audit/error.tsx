"use client";

import { ErrorPanel } from "@/components/ui";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const dbDown = /ECONNREFUSED|DATABASE_URL|connect/i.test(error.message);
  return (
    <ErrorPanel
      title={dbDown ? "Can't reach the database" : "This page failed to load"}
      message={
        dbDown
          ? "Check that DATABASE_URL is set and the database is running (locally: npm run db:local), then try again."
          : `The server returned an error${error.digest ? ` (reference ${error.digest})` : ""}. Your data has not changed.`
      }
      onRetry={reset}
    />
  );
}
