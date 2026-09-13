// Mirrors `AgentState.snapshot()` and `steel_client.session_summary()` on the
// backend (agent-login branch). Field names are the backend's, verbatim.

export interface CampaignPlan {
  id: string;
  prompt: string;
  status: string;
  execution_status?: "running" | "completed" | "failed";
  execution_error?: string;
  events?: {
    type: string;
    task_id?: string;
    status?: string;
    kind?: string;
    persona?: string;
    url?: string | null;
    note?: string | null;
  }[];
  phases: {
    number: number;
    summary: string;
    assignments: {
      id: string;
      persona: string;
      action: "create_post" | "create_profile_post" | "comment" | "wait";
      instructions: string;
      title: string | null;
      body: string | null;
      target_url: string | null;
      wait_for: string[];
    }[];
  }[];
}

export interface LibraryPost {
  id: string;
  persona: string;
  url: string;
  title: string | null;
  content: string | null;
  reddit_username: string | null;
  timestamp: string | null;
  kind: "post" | "profile_post";
}

export type SessionStatus =
  "queued" | "running" | "done" | "failed" | "stopped";

export interface SteelSession {
  id: string;
  status: string; // Steel's status, or "released" once the backend lets it go
  debug_url: string | null;
  viewer_url: string | null;
  created_at: string;
  duration_ms?: number;
  region?: string | null;
}

export interface BrowserAgent {
  mode?: "legacy" | "reddit_browse" | "profile_post";
  id: string;
  persona: string;
  query: string; // "" = login only
  target: string;
  level: number; // 0 wake · 1 search · 2 land · 3+ deepen
  status: SessionStatus;
  session: SteelSession | null;
  email: string | null;
  url: string | null;
  note: string;
  traits: string[];
}

export interface SessionLogLine {
  id: string;
  ts: number;
  persona?: string;
  level?: number;
  msg: string;
  url?: string;
  error?: boolean;
}

/** What the agent is doing right now, derived from level + url. Drives the step strip and the mock viewer. */
export type Stage =
  | "wake"
  | "email"
  | "signup"
  | "login"
  | "captcha"
  | "search"
  | "land"
  | "browse"
  | "done";

export const STAGE_LABEL: Record<Stage, string> = {
  wake: "Waking",
  email: "Temp-Mail",
  signup: "Reddit signup",
  login: "Reddit login",
  captcha: "CAPTCHA",
  search: "Google",
  land: "Landing",
  browse: "Browsing",
  done: "Done",
};

/** Ordered milestones shown on every card. */
export const STEPS: { key: string; label: string; stages: Stage[] }[] = [
  { key: "email", label: "Email", stages: ["email"] },
  { key: "reddit", label: "Reddit", stages: ["signup", "login", "captcha"] },
  { key: "search", label: "Search", stages: ["search"] },
  { key: "land", label: "Land", stages: ["land"] },
  { key: "browse", label: "Browse", stages: ["browse"] },
];

export function stageOf(a: BrowserAgent): Stage {
  if (a.status === "done" || a.status === "failed" || a.status === "stopped")
    return "done";
  const url = a.url ?? "";
  if (a.mode === "profile_post" && a.level > 0) return "browse";
  if (a.mode === "reddit_browse") return a.level === 0 ? "wake" : "browse";
  const note = a.note.toLowerCase();
  if (a.level >= 3 || note.includes("dwelling")) return "browse";
  if (a.level === 2) return "land";
  if (a.level === 1) return "search";
  if (
    note.includes("captcha") &&
    !note.includes("solved") &&
    !note.includes("no captcha")
  )
    return "captcha";
  if (url.includes("temp-mail") || note.includes("temp-mail")) return "email";
  if (url.includes("/register") || note.includes("signup")) return "signup";
  if (
    url.includes("reddit.com") ||
    note.includes("login") ||
    note.includes("credentials")
  )
    return "login";
  return "wake";
}

export function stepIndex(stage: Stage): number {
  if (stage === "done") return STEPS.length;
  if (stage === "wake") return -1;
  return STEPS.findIndex((s) => s.stages.includes(stage));
}
