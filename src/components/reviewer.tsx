"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { REVIEWERS } from "@/lib/reviewers";

const STORAGE_KEY = "nport-reviewer";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && (REVIEWERS as readonly string[]).includes(saved) ? saved : null;
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb); // stays in sync across tabs
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

const Ctx = createContext<{ reviewer: string | null; setReviewer: (r: string) => void }>({ reviewer: null, setReviewer: () => {} });

export function ReviewerProvider({ children }: { children: React.ReactNode }) {
  const reviewer = useSyncExternalStore(subscribe, read, () => null);
  const setReviewer = useCallback((r: string) => {
    try { localStorage.setItem(STORAGE_KEY, r); } catch {}
    listeners.forEach((l) => l());
  }, []);
  return <Ctx.Provider value={{ reviewer, setReviewer }}>{children}</Ctx.Provider>;
}

export const useReviewer = () => useContext(Ctx);

export function ReviewerSelect() {
  const { reviewer, setReviewer } = useReviewer();
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">Reviewing as</span>
      <select
        value={reviewer ?? ""}
        onChange={(e) => setReviewer(e.target.value)}
        className="w-full rounded-md border border-rule bg-panel px-2 py-1.5 text-sm"
      >
        <option value="" disabled>
          Choose a reviewer
        </option>
        {REVIEWERS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-[11px] leading-snug text-faint">Demo stand-in for sign-in. Every decision records this name.</span>
    </label>
  );
}
