"use client";

import { create } from "zustand";
import type { BrowserAgent, CampaignPlan, SessionLogLine } from "./types";

// ---------------------------------------------------------------------------
// Live browser sessions. Talks to the FastAPI backend (agent-login branch)
// through the /backend proxy, and keeps probing until it's reachable.
// ---------------------------------------------------------------------------

export const BACKEND = "/backend";
const POLL_LIVE_MS = 1500;
const POLL_PROBE_MS = 8000;
const MAX_LOG = 200;

export type SessionConnection = "connecting" | "live" | "offline";

interface SessionState {
  connection: SessionConnection;
  agents: BrowserAgent[];
  max: number;
  logs: SessionLogLine[];
  lastError: string | null;
  campaignPlan: CampaignPlan | null;

  start: () => () => void;
  planCampaign: (body: {
    prompt: string;
    count: number;
  }) => Promise<CampaignPlan>;
  executeCampaign: (runId: string) => Promise<CampaignPlan>;
  launchAgents: (body: {
    prompt: string;
    count: number;
  }) => Promise<void>;
  stop: (id: string) => Promise<void>;
  stopAll: () => Promise<void>;
  clear: () => Promise<void>;
}

let logSeq = 0;

function pushLogs(existing: SessionLogLine[], incoming: SessionLogLine[]) {
  if (!incoming.length) return existing;
  return [...incoming.slice().reverse(), ...existing].slice(0, MAX_LOG);
}

/** Turn agent snapshot changes into log lines (the display does the same). */
function diffToLogs(
  prev: BrowserAgent[],
  next: BrowserAgent[],
): SessionLogLine[] {
  const out: SessionLogLine[] = [];
  const byId = new Map(prev.map((a) => [a.id, a]));
  for (const a of next) {
    const p = byId.get(a.id);
    if (a.note && (!p || p.note !== a.note || p.level !== a.level)) {
      out.push({
        id: `l_${Date.now()}_${logSeq++}`,
        ts: Date.now(),
        persona: a.persona,
        level: a.level,
        msg: a.note,
        url:
          a.url && a.note.toLowerCase().includes("post confirmed")
            ? a.url
            : undefined,
        error: a.status === "failed",
      });
    }
  }
  return out;
}

export const useSessions = create<SessionState>((set) => ({
  connection: "connecting",
  agents: [],
  max: 0,
  logs: [],
  lastError: null,
  campaignPlan: null,

  start: () => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    let es: EventSource | null = null;

    const openStream = () => {
      if (es || typeof EventSource === "undefined") return;
      es = new EventSource(`${BACKEND}/api/events`);
      es.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (ev.kind === "log" && ev.msg) {
            set((s) => ({
              logs: pushLogs(s.logs, [
                {
                  id: `l_${Date.now()}_${logSeq++}`,
                  ts: Date.now(),
                  msg: ev.msg,
                },
              ]),
            }));
          } else if (ev.kind === "agent" && ev.agent) {
            set((s) => {
              const agents = s.agents.some((a) => a.id === ev.agent.id)
                ? s.agents.map((a) => (a.id === ev.agent.id ? ev.agent : a))
                : [ev.agent, ...s.agents];
              return {
                agents,
                logs: pushLogs(s.logs, diffToLogs(s.agents, agents)),
              };
            });
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
      };
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await fetch(`${BACKEND}/api/agents`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as {
          agents: BrowserAgent[];
          max: number;
        };
        failures = 0;
        set((s) => ({
          connection: "live",
          max: data.max,
          agents: data.agents,
          lastError: null,
          logs: pushLogs(s.logs, diffToLogs(s.agents, data.agents)),
        }));
        openStream();
        timer = setTimeout(poll, POLL_LIVE_MS);
      } catch (err) {
        failures++;
        if (failures >= 2) {
          set({ connection: "offline", agents: [], lastError: String(err) });
          timer = setTimeout(poll, POLL_PROBE_MS);
        } else {
          timer = setTimeout(poll, POLL_LIVE_MS);
        }
      }
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      es?.close();
    };
  },

  planCampaign: async (body) => {
    const r = await fetch(`${BACKEND}/api/orchestrations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, environment: "private" }),
    });
    if (!r.ok)
      throw new Error(
        (await r.json().catch(() => ({ detail: r.statusText }))).detail ??
          "Campaign planning failed",
      );
    const campaignPlan = (await r.json()) as CampaignPlan;
    set({ campaignPlan });
    return campaignPlan;
  },

  executeCampaign: async (runId) => {
    const r = await fetch(`${BACKEND}/api/orchestrations/${runId}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phases: 2 }),
    });
    if (!r.ok)
      throw new Error(
        (await r.json().catch(() => ({ detail: r.statusText }))).detail ??
          "Campaign execution failed",
      );
    let campaignPlan = (await r.json()) as CampaignPlan;
    set({ campaignPlan });

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, POLL_LIVE_MS));
      const status = await fetch(`${BACKEND}/api/orchestrations/${runId}`, {
        cache: "no-store",
      });
      if (!status.ok)
        throw new Error(
          (await status.json().catch(() => ({ detail: status.statusText }))).detail ??
            "Campaign status failed",
        );
      campaignPlan = (await status.json()) as CampaignPlan;
      set({ campaignPlan });
      if (campaignPlan.execution_status === "failed")
        throw new Error(campaignPlan.execution_error || "Campaign execution failed");
      const taskEvents = new Map(
        (campaignPlan.events ?? [])
          .filter((event) => event.type === "agent_activity" && event.task_id)
          .map((event) => [event.task_id, event.status]),
      );
      const tasks = campaignPlan.phases.flatMap((phase) => phase.assignments);
      const failed = (campaignPlan.events ?? []).find(
        (event) => event.type === "agent_activity" && event.status === "failed",
      );
      if (failed)
        throw new Error(failed.note || `${failed.persona || "Agent"} execution failed`);
      const terminal = tasks.every((task) => {
        const state = taskEvents.get(task.id);
        return state === "completed" || state === "failed";
      });
      if (campaignPlan.execution_status === "completed") {
        if (!terminal) throw new Error("Campaign stopped with pending assignments");
        return campaignPlan;
      }
    }
  },

  launchAgents: async (body) => {
    const r = await fetch(`${BACKEND}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "https://www.reddit.com",
        mode: "reddit_browse",
        prompt: body.prompt,
        count: body.count,
      }),
    });
    if (!r.ok)
      throw new Error(
        (await r.json().catch(() => ({ detail: r.statusText }))).detail ??
          "Agent launch failed",
      );
    const data = (await r.json()) as { agents: BrowserAgent[] };
    set((s) => ({
      agents: data.agents,
      logs: pushLogs(s.logs, diffToLogs(s.agents, data.agents)),
    }));
  },

  stop: async (id) => {
    await fetch(`${BACKEND}/api/agents/${id}/stop`, { method: "POST" });
  },

  stopAll: async () => {
    await fetch(`${BACKEND}/api/stop-all`, { method: "POST" });
  },

  clear: async () => {
    await fetch(`${BACKEND}/api/clear`, { method: "POST" });
  },
}));
