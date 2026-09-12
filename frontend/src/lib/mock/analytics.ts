export const OPPORTUNITY_VOLUME = Array.from({ length: 24 }, (_, i) => {
  const hour = (new Date().getHours() - 23 + i + 24) % 24;
  const daytime = hour >= 8 && hour <= 22 ? 1 : 0.35;
  const scanned = Math.round(
    (38 + Math.sin(i / 3) * 12 + (i % 5) * 2) * daytime,
  );
  const relevant = Math.round(scanned * (0.12 + (i % 4) * 0.02));
  return {
    label: `${String(hour).padStart(2, "0")}:00`,
    scanned,
    relevant,
    rejected: scanned - relevant,
  };
});

export const TOPIC_PERFORMANCE = [
  {
    topic: "Zapier alternatives",
    opportunities: 21,
    avgRelevance: 92,
    posted: 4,
  },
  {
    topic: "AI workflow automation",
    opportunities: 14,
    avgRelevance: 88,
    posted: 2,
  },
  {
    topic: "Small business automation",
    opportunities: 11,
    avgRelevance: 84,
    posted: 3,
  },
  {
    topic: "AI agents for operations",
    opportunities: 9,
    avgRelevance: 90,
    posted: 1,
  },
  {
    topic: "Repetitive work tools",
    opportunities: 7,
    avgRelevance: 79,
    posted: 1,
  },
  { topic: "Client onboarding", opportunities: 5, avgRelevance: 81, posted: 0 },
];

export const AGENT_WORKLOAD = [
  { role: "Discovery", tasks: 412, share: 46 },
  { role: "Intent", tasks: 168, share: 19 },
  { role: "Relevance", tasks: 121, share: 13 },
  { role: "Policy", tasks: 64, share: 7 },
  { role: "Writer", tasks: 41, share: 5 },
  { role: "Monitor", tasks: 58, share: 6 },
  { role: "Visibility", tasks: 22, share: 2 },
  { role: "Strategy", tasks: 9, share: 1 },
];

export const REJECTION_SUMMARY = [
  { reason: "Not relevant", count: 214 },
  { reason: "Too old", count: 96 },
  { reason: "Already engaged", count: 41 },
  { reason: "Promotion restricted", count: 38 },
  { reason: "Low confidence", count: 27 },
];
