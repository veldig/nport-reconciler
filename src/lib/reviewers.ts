// Stand-in for real authentication. Every decision still records which reviewer made it.
export const REVIEWERS = ["Martin Vizcaino", "Ops Analyst", "Compliance Reviewer"] as const;
export type Reviewer = (typeof REVIEWERS)[number];

export const MIN_REASON_LENGTH = 10;
