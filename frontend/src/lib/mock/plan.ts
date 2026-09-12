import type { PlannedTask } from "@/lib/types";

export const INITIAL_PLAN: PlannedTask[] = [
  {
    id: "plan_01",
    timing: { kind: "now" },
    actor: "scout-02",
    title: "Search Reddit",
    detail: '"AI automation tools"',
    status: "running",
  },
  {
    id: "plan_02",
    timing: { kind: "in", minutes: 5 },
    actor: "Scout Swarm",
    actorIsGroup: true,
    title: "Scan new discussions",
    detail: ["r/SaaS", "r/productivity", "r/startups"],
    status: "scheduled",
  },
  {
    id: "plan_03",
    timing: { kind: "in", minutes: 8 },
    actor: "writer-01",
    title: "Draft contribution",
    detail:
      'r/artificial · "Any AI agents that can handle multi-step business processes?"',
    status: "awaiting-approval",
  },
  {
    id: "plan_04",
    timing: { kind: "in", minutes: 15 },
    actor: "visibility-01",
    title: "Check presence",
    detail: '"Zapier alternatives"',
    status: "scheduled",
  },
  {
    id: "plan_05",
    timing: { kind: "in", minutes: 30 },
    actor: "strategy-01",
    title: "Re-evaluate discovery strategy",
    detail: "Analyze which queries produced the strongest opportunities.",
    status: "scheduled",
  },
  {
    id: "plan_06",
    timing: { kind: "later" },
    actor: "monitor-01",
    title: "Revisit active conversations",
    detail: "Check for replies and new questions.",
    status: "scheduled",
  },
  {
    id: "plan_07",
    timing: { kind: "later" },
    actor: "policy-01",
    title: "Refresh community rules",
    detail: ["r/smallbusiness", "r/Entrepreneur"],
    status: "scheduled",
  },
];
