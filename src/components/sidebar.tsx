"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReviewerSelect } from "./reviewer";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/exceptions", label: "Exception queue" },
  { href: "/audit", label: "Audit log" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex flex-col gap-6 border-b border-rule bg-wash px-5 py-5 md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
      <Link href="/" className="block">
        <span className="block text-[15px] font-semibold tracking-tight">N-PORT Reconciler</span>
        <span className="block text-xs text-muted">Holdings review from SEC filings</span>
      </Link>
      <nav aria-label="Main" className="flex gap-1 md:flex-col">
        {NAV.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-2.5 py-1.5 text-sm ${active ? "bg-panel font-medium text-ink shadow-[inset_2px_0_0_var(--color-link)]" : "text-muted hover:bg-panel/60 hover:text-ink"}`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <a href="/walkthrough.mp4" target="_blank" rel="noreferrer" className="hidden text-sm text-link underline decoration-link/30 underline-offset-2 hover:decoration-link md:block">
        Watch the 78-second walkthrough
      </a>
      <div className="md:mt-auto">
        <ReviewerSelect />
      </div>
    </aside>
  );
}
