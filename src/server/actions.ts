"use server";

import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, exceptions } from "@/db/schema";
import { REVIEWERS, MIN_REASON_LENGTH } from "@/lib/reviewers";

export type Decision = "approve" | "dismiss" | "reopen";
export type DecisionResult = { ok: true; status: string } | { ok: false; error: string };

const TRANSITIONS: Record<Decision, { from: ("open" | "approved" | "dismissed")[]; to: "open" | "approved" | "dismissed"; action: "APPROVE" | "DISMISS" | "REOPEN" }> = {
  approve: { from: ["open"], to: "approved", action: "APPROVE" },
  dismiss: { from: ["open"], to: "dismissed", action: "DISMISS" },
  reopen: { from: ["approved", "dismissed"], to: "open", action: "REOPEN" },
};

export async function decideException(input: {
  exceptionId: number;
  decision: Decision;
  reviewer: string;
  reason: string;
  expectedStatus: string;
}): Promise<DecisionResult> {
  const reason = (input.reason ?? "").trim();
  const t = TRANSITIONS[input.decision];
  if (!t) return { ok: false, error: "Unknown decision." };
  if (!(REVIEWERS as readonly string[]).includes(input.reviewer)) return { ok: false, error: "Pick a reviewer before deciding." };
  if (reason.length < MIN_REASON_LENGTH) return { ok: false, error: `Reason must be at least ${MIN_REASON_LENGTH} characters.` };
  if (reason.length > 2000) return { ok: false, error: "Reason must be 2,000 characters or fewer." };
  if (!t.from.includes(input.expectedStatus as never)) {
    return { ok: false, error: `Cannot ${input.decision} an exception that is ${input.expectedStatus}.` };
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Compare-and-set on status, so two reviewers acting at once cannot both win.
      const updated = await tx
        .update(exceptions)
        .set({ status: t.to })
        .where(and(eq(exceptions.id, input.exceptionId), eq(exceptions.status, input.expectedStatus as "open" | "approved" | "dismissed")))
        .returning({ id: exceptions.id });
      if (updated.length === 0) return null;
      await tx.insert(auditLog).values({
        actor: input.reviewer,
        action: t.action,
        exceptionId: input.exceptionId,
        fromStatus: input.expectedStatus,
        toStatus: t.to,
        reason,
      });
      return t.to;
    });
    if (!result) {
      return { ok: false, error: "Someone else changed this exception first. The queue has been refreshed with its current status." };
    }
    return { ok: true, status: result };
  } catch (err) {
    console.error("decideException failed", err);
    return { ok: false, error: "The decision could not be saved. Nothing was changed. Try again." };
  } finally {
    // Refresh in the conflict case too, so the reviewer sees the latest state.
    try { refresh(); } catch {}
  }
}
