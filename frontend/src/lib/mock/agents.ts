import type { Agent, AgentRole, AgentStatus } from "@/lib/types";

export const ROLE_LABEL: Record<AgentRole, string> = {
  discovery: "Discovery",
  intent: "Intent",
  relevance: "Relevance",
  writer: "Writer",
  policy: "Policy",
  monitor: "Monitor",
  visibility: "Visibility",
  strategy: "Strategy",
};

export const ROLE_ORDER: AgentRole[] = [
  "discovery",
  "intent",
  "relevance",
  "writer",
  "policy",
  "monitor",
  "visibility",
  "strategy",
];

export const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "Idle",
  searching: "Searching",
  analyzing: "Analyzing",
  writing: "Writing",
  waiting: "Waiting",
  monitoring: "Monitoring",
  paused: "Paused",
  error: "Error",
};

const OBJECTIVE: Record<AgentRole, string> = {
  discovery:
    "Find conversations where people are actively looking for workflow automation tools.",
  intent: "Classify what the author of a discussion is actually asking for.",
  relevance: "Decide whether FlowPilot AI genuinely belongs in a conversation.",
  writer:
    "Prepare useful, non-promotional contributions for approved opportunities.",
  policy:
    "Check community rules, spam risk and promotional intensity before anything is posted.",
  monitor:
    "Track replies, votes and follow-up questions on active conversations.",
  visibility:
    "Measure where FlowPilot AI appears for target queries across Reddit, search and AI answers.",
  strategy:
    "Coordinate the swarm: reallocate agents and refine queries based on what is working.",
};

const NEXT_TASK: Record<AgentRole, string[]> = {
  discovery: [
    "Scan r/SaaS",
    "Scan r/smallbusiness",
    'Search "n8n alternatives"',
    "Scan r/productivity",
    'Search "automate admin tasks"',
  ],
  intent: [
    "Classify 3 queued threads",
    "Re-check ambiguous thread",
    "Classify new r/startups batch",
  ],
  relevance: [
    "Score queued opportunity",
    "Re-evaluate borderline thread",
    "Score 2 new candidates",
  ],
  writer: [
    "Draft for r/productivity thread",
    "Revise flagged draft",
    "Draft follow-up reply",
  ],
  policy: [
    "Review 2 pending drafts",
    "Refresh r/SaaS rules",
    "Check r/Entrepreneur posting policy",
  ],
  monitor: [
    "Revisit 6 active threads",
    "Check reply on r/SaaS thread",
    "Record engagement snapshot",
  ],
  visibility: [
    'Check "Zapier alternatives"',
    "Probe AI answers for 4 queries",
    "Record search presence",
  ],
  strategy: [
    "Re-evaluate query performance",
    "Rebalance scouts",
    "Review rejection patterns",
  ],
};

/**
 * Deployment order. Index n-1 is the agent added when the count goes from
 * n-1 to n, so the swarm grows in a sensible order (coordinator first, one of
 * each critical role, then more scouts).
 */
const DEPLOY_ORDER: { id: string; name: string; role: AgentRole }[] = [
  { id: "strategy-01", name: "Strategy-01", role: "strategy" },
  { id: "scout-01", name: "Scout-01", role: "discovery" },
  { id: "intent-01", name: "Intent-01", role: "intent" },
  { id: "relevance-01", name: "Relevance-01", role: "relevance" },
  { id: "writer-01", name: "Writer-01", role: "writer" },
  { id: "policy-01", name: "Policy-01", role: "policy" },
  { id: "scout-02", name: "Scout-02", role: "discovery" },
  { id: "monitor-01", name: "Monitor-01", role: "monitor" },
  { id: "scout-03", name: "Scout-03", role: "discovery" },
  { id: "visibility-01", name: "Visibility-01", role: "visibility" },
  { id: "intent-02", name: "Intent-02", role: "intent" },
  { id: "scout-04", name: "Scout-04", role: "discovery" },
  { id: "relevance-02", name: "Relevance-02", role: "relevance" },
  { id: "writer-02", name: "Writer-02", role: "writer" },
  { id: "scout-05", name: "Scout-05", role: "discovery" },
  { id: "intent-03", name: "Intent-03", role: "intent" },
  { id: "monitor-02", name: "Monitor-02", role: "monitor" },
  { id: "scout-06", name: "Scout-06", role: "discovery" },
  { id: "policy-02", name: "Policy-02", role: "policy" },
  { id: "relevance-03", name: "Relevance-03", role: "relevance" },
];

export const MAX_AGENTS = DEPLOY_ORDER.length;
export const DEFAULT_AGENT_COUNT = 12;

const INITIAL_STATUS: Record<AgentRole, AgentStatus> = {
  discovery: "searching",
  intent: "analyzing",
  relevance: "analyzing",
  writer: "writing",
  policy: "waiting",
  monitor: "monitoring",
  visibility: "idle",
  strategy: "idle",
};

const INITIAL_TASK: Record<AgentRole, string> = {
  discovery: '"alternatives to Zapier"',
  intent: 'r/SaaS · "How do you automate repetitive admin work?"',
  relevance: 'r/productivity · "Automating weekly reporting"',
  writer: "Draft for r/smallbusiness thread",
  policy: "Awaiting draft from Writer-01",
  monitor: "6 active conversations",
  visibility: "Next check in 14m",
  strategy: "Next review in 28m",
};

const REJECTIONS: Record<AgentRole, { reason: string; count: number }[]> = {
  discovery: [
    { reason: "Not relevant", count: 17 },
    { reason: "Too old", count: 8 },
    { reason: "Already engaged", count: 6 },
    { reason: "Promotion restricted", count: 5 },
    { reason: "Low confidence", count: 3 },
  ],
  intent: [
    { reason: "No request in thread", count: 9 },
    { reason: "Venting / discussion only", count: 6 },
    { reason: "Ambiguous", count: 4 },
  ],
  relevance: [
    { reason: "Tangential problem", count: 11 },
    { reason: "Enterprise-only need", count: 4 },
    { reason: "Competitor-specific", count: 3 },
  ],
  writer: [
    { reason: "Sent back by Policy", count: 2 },
    { reason: "Rejected in review", count: 1 },
  ],
  policy: [
    { reason: "Community blocks promotion", count: 5 },
    { reason: "Promotional tone too high", count: 3 },
    { reason: "Missing disclosure", count: 1 },
  ],
  monitor: [{ reason: "Thread locked", count: 2 }],
  visibility: [{ reason: "Query too broad", count: 1 }],
  strategy: [],
};

function seedStats(role: AgentRole, i: number) {
  const base = [
    86, 61, 47, 72, 38, 55, 29, 64, 51, 43, 77, 33, 58, 41, 69, 36, 49, 62, 44,
    53,
  ][i % 20];
  switch (role) {
    case "discovery":
      return {
        scanned: base + 20,
        relevant: Math.round((base + 20) * 0.16),
        rejected: Math.round((base + 20) * 0.84),
        completed: base + 20,
        quality: 78 + (i % 5) * 3,
      };
    case "intent":
      return {
        scanned: base,
        relevant: Math.round(base * 0.55),
        rejected: Math.round(base * 0.45),
        completed: base,
        quality: 91 + (i % 3),
      };
    case "relevance":
      return {
        scanned: base - 10,
        relevant: Math.round((base - 10) * 0.42),
        rejected: Math.round((base - 10) * 0.58),
        completed: base - 10,
        quality: 88 + (i % 4) * 2,
      };
    case "writer":
      return {
        scanned: 0,
        relevant: 14,
        rejected: 3,
        completed: 17,
        quality: 82,
      };
    case "policy":
      return {
        scanned: 24,
        relevant: 18,
        rejected: 6,
        completed: 24,
        quality: 96,
      };
    case "monitor":
      return {
        scanned: 38,
        relevant: 38,
        rejected: 2,
        completed: 38,
        quality: 90,
      };
    case "visibility":
      return {
        scanned: 12,
        relevant: 7,
        rejected: 1,
        completed: 12,
        quality: 85,
      };
    case "strategy":
      return {
        scanned: 0,
        relevant: 0,
        rejected: 0,
        completed: 3,
        quality: 100,
      };
  }
}

export function buildAgents(count: number, now = Date.now()): Agent[] {
  return DEPLOY_ORDER.slice(0, Math.max(1, Math.min(MAX_AGENTS, count))).map(
    (d, i) => ({
      id: d.id,
      name: d.name,
      role: d.role,
      status: INITIAL_STATUS[d.role],
      objective: OBJECTIVE[d.role],
      currentTask: INITIAL_TASK[d.role],
      nextTask: NEXT_TASK[d.role][i % NEXT_TASK[d.role].length],
      stats: seedStats(d.role, i),
      rejections: REJECTIONS[d.role].map((r) => ({ ...r })),
      lastActiveAt: now - (i * 7 + 3) * 1000,
    }),
  );
}

export function allocationFor(count: number): Record<AgentRole, number> {
  const out = Object.fromEntries(ROLE_ORDER.map((r) => [r, 0])) as Record<
    AgentRole,
    number
  >;
  for (const d of DEPLOY_ORDER.slice(
    0,
    Math.max(1, Math.min(MAX_AGENTS, count)),
  ))
    out[d.role]++;
  return out;
}

export function nextTaskFor(role: AgentRole, seed: number) {
  const list = NEXT_TASK[role];
  return list[Math.abs(seed) % list.length];
}

/** Estimated throughput for a given swarm size. */
export function capacityFor(count: number) {
  return {
    discussionsPerHour: count * 10,
    opportunitiesPerHour: Math.max(1, Math.round(count * 1.66)),
  };
}
