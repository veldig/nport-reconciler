import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { ReviewerProvider } from "@/components/reviewer";

export const metadata: Metadata = {
  title: "N-PORT Reconciler",
  description: "Reconcile an ETF's N-PORT holdings between filing periods and review every exception with a full audit trail.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ReviewerProvider>
          <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
            <Sidebar />
            <main className="min-w-0 px-5 py-6 md:px-10 md:py-8">{children}</main>
          </div>
        </ReviewerProvider>
      </body>
    </html>
  );
}
