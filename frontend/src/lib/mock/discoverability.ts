import type { QueryPresence, ScoreBreakdown } from "@/lib/types";

export const DISCOVERABILITY_SCORE = 72;

export const SCORE_BREAKDOWN: ScoreBreakdown[] = [
  { label: "Community Presence", value: 82, delta: 6 },
  { label: "Topic Association", value: 74, delta: 3 },
  { label: "Search Presence", value: 63, delta: 2 },
  { label: "AI Answer Presence", value: 58, delta: 9 },
  { label: "Organic Mentions", value: 71, delta: 4 },
];

export const QUERY_PRESENCE: QueryPresence[] = [
  {
    query: "Zapier alternatives",
    reddit: "detected",
    search: "medium",
    aiAnswer: "detected",
    mentions: 17,
    trend: "up",
    delta7d: 5,
  },
  {
    query: "AI workflow automation",
    reddit: "detected",
    search: "low",
    aiAnswer: "none",
    mentions: 8,
    trend: "up",
    delta7d: 3,
  },
  {
    query: "automation for small business",
    reddit: "partial",
    search: "low",
    aiAnswer: "partial",
    mentions: 6,
    trend: "flat",
    delta7d: 0,
  },
  {
    query: "best tools for repetitive work",
    reddit: "detected",
    search: "none",
    aiAnswer: "none",
    mentions: 4,
    trend: "up",
    delta7d: 2,
  },
  {
    query: "AI agents for operations",
    reddit: "partial",
    search: "medium",
    aiAnswer: "detected",
    mentions: 11,
    trend: "up",
    delta7d: 7,
  },
  {
    query: "n8n alternatives",
    reddit: "none",
    search: "low",
    aiAnswer: "none",
    mentions: 2,
    trend: "flat",
    delta7d: 0,
  },
  {
    query: "automate client onboarding",
    reddit: "detected",
    search: "none",
    aiAnswer: "partial",
    mentions: 5,
    trend: "down",
    delta7d: -1,
  },
];

/** 14 days of visibility, indexed 0..13 with 13 = today. */
export const VISIBILITY_SERIES = Array.from({ length: 14 }, (_, i) => {
  const day = new Date();
  day.setDate(day.getDate() - (13 - i));
  const base = 41 + i * 2.2;
  const wobble = [0, 1.5, -1, 2, 0.5, -0.5, 1, 3, 1.5, 0, 2, 1, 2.5, 1.2][i];
  return {
    date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    score: Math.round(base + wobble),
    community: Math.round(base + wobble + 8 + (i > 8 ? 4 : 0)),
    search: Math.round(base + wobble - 10),
    ai: Math.round(base + wobble - 16 + (i > 10 ? 6 : 0)),
  };
});
