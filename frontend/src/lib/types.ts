// ---------------------------------------------------------------------------
// Domain types shared across the app. Everything in the UI is a projection of
// these; the mock simulation produces them, the components consume them.
// ---------------------------------------------------------------------------

export type EntityType =
  | "Product"
  | "Company"
  | "Website"
  | "Application"
  | "Portfolio"
  | "Open Source Project"
  | "Research"
  | "Event"
  | "Service"
  | "Creator"
  | "Community"
  | "Content"
  | "Other";

export interface Campaign {
  id: string;
  name: string;
  type: EntityType;
  typeLabel: string;
  url: string;
  description: string;
  audience: string[];
  whyCare: string;
  problems: string[];
  searchIntent: string[];
  topics: string[];
  related: string[];
  avoid: string[];
  status: "running" | "paused" | "draft";
  startedAt: number;
}

export type AgentRole =
  | "discovery"
  | "intent"
  | "relevance"
  | "writer"
  | "policy"
  | "monitor"
  | "visibility"
  | "strategy";

export type AgentStatus =
  | "idle"
  | "searching"
  | "analyzing"
  | "writing"
  | "waiting"
  | "monitoring"
  | "paused"
  | "error";

export interface RejectionReason {
  reason: string;
  count: number;
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  objective: string;
  currentTask: string | null;
  nextTask: string | null;
  stats: {
    scanned: number;
    relevant: number;
    rejected: number;
    completed: number;
    /** 0–100. Meaning depends on role (precision for scouts, approval rate for writers...). */
    quality: number;
  };
  rejections: RejectionReason[];
  lastActiveAt: number;
}

export type EventCategory =
  | "discovery"
  | "analysis"
  | "writing"
  | "policy"
  | "monitoring"
  | "visibility"
  | "strategy"
  | "error"
  | "system";

export type EventStatus =
  | "searching"
  | "analyzing"
  | "new"
  | "complete"
  | "allowed"
  | "blocked"
  | "rejected"
  | "review"
  | "updated"
  | "detected"
  | "paused"
  | "error"
  | "info";

export type Platform = "reddit" | "hn" | "x" | "web" | "system";

export type Risk = "low" | "medium" | "high";

export interface ActivityDetail {
  task: string;
  summary: string;
  evidence?: string[];
  relevance?: number;
  risk?: Risk;
  opportunityId?: string;
  metrics?: { label: string; value: string }[];
}

export interface ActivityEvent {
  id: string;
  ts: number;
  agentId: string;
  category: EventCategory;
  action: string;
  context: string;
  platform: Platform;
  status: EventStatus;
  /** Confidence / relevance percentage when applicable. */
  score?: number;
  detail: ActivityDetail;
}

export type PlanTiming =
  { kind: "now" } | { kind: "in"; minutes: number } | { kind: "later" };

export type PlanStatus =
  | "scheduled"
  | "running"
  | "paused"
  | "awaiting-approval"
  | "cancelled"
  | "done";

export interface PlannedTask {
  id: string;
  timing: PlanTiming;
  /** Agent id, or a group label such as "Scout Swarm". */
  actor: string;
  actorIsGroup?: boolean;
  title: string;
  detail: string | string[];
  status: PlanStatus;
}

export type OpportunityStatus =
  "new" | "review" | "approved" | "posted" | "skipped" | "monitoring";

export type ActivityLevel = "high" | "medium" | "low";

export interface Opportunity {
  id: string;
  platform: Platform;
  community: string;
  title: string;
  author: string;
  excerpt: string;
  intent: string;
  relevance: number;
  activity: ActivityLevel;
  createdAt: number;
  discoveredAt: number;
  status: OpportunityStatus;
  analysis: {
    whyMatch: string;
    entityRelevance: number;
    communityRules: {
      allowsProductMentions: boolean;
      requiresDisclosure: boolean;
      note: string;
    };
    spamRisk: number;
    promoIntensity: number;
  };
  suggestedResponse: string;
  engagement?: { replies: number; votes: number };
}

export interface QueryPresence {
  query: string;
  reddit: "detected" | "partial" | "none";
  search: "high" | "medium" | "low" | "none";
  aiAnswer: "detected" | "partial" | "none";
  mentions: number;
  trend: "up" | "flat" | "down";
  delta7d: number;
}

export interface ScoreBreakdown {
  label: string;
  value: number;
  delta: number;
}

export interface Notification {
  id: string;
  ts: number;
  title: string;
  body: string;
  kind: "info" | "review" | "warning";
  read: boolean;
}

export type ConnectionState = "connected" | "reconnecting" | "offline";
