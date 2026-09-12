"use client";

import { create } from "zustand";
import type { BrowserAgent, SessionLogLine } from "./types";
import { MockFleet } from "./mock";

// ---------------------------------------------------------------------------
// Live browser sessions. Talks to the FastAPI backend (agent-login branch)
// through the /backend proxy. If the backend is unreachable the store runs a
// mock fleet instead, and keeps probing so it switches to live automatically.
// ---------------------------------------------------------------------------

export const BACKEND = "/backend";
const POLL_LIVE_MS = 1500;
const POLL_PROBE_MS = 8000;
const MAX_LOG = 200;

export type SessionConnection = "connecting" | "live" | "mock" | "offline";

interface SessionState {
  connection: SessionConnection;
  agents: BrowserAgent[];
  max: number;
  logs: SessionLogLine[];
  lastError: string | null;
  useMockFallback: boolean;

  start: () => () => void;
  launch: (body: {
    target: string;
    queries: string[];
    count: number;
  }) => Promise<void>;
  stop: (id: string) => Promise<void>;
  stopAll: () => Promise<void>;
  clear: () => Promise<void>;
  setUseMockFallback: (v: boolean) => void;
}

let fleet: MockFleet | null = null;
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
        error: a.status === "failed",
      });
    }
  }
  return out;
}

export const useSessions = create<SessionState>((set, get) => ({
  connection: "connecting",
  agents: [],
  max: 0,
  logs: [],
  lastError: null,
  useMockFallback: true,

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
        if (fleet) fleet = null;
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
        const s = get();
        if (failures >= 2 && s.useMockFallback) {
          if (!fleet) {
            fleet = new MockFleet(4);
            set({
              connection: "mock",
              max: 8,
              agents: [],
              lastError: String(err),
            });
          }
          const t = fleet.tick();
          set((st) => ({ agents: t.agents, logs: pushLogs(st.logs, t.logs) }));
          timer = setTimeout(poll, 700);
          // Probe the backend less often while mocking.
          if (failures % Math.round(POLL_PROBE_MS / 700) !== 0) return;
        } else if (failures >= 2) {
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
      fleet = null;
    };
  },

  launch: async (body) => {
    if (fleet) {
      fleet.launch(body.target, body.queries, body.count);
      return;
    }
    const r = await fetch(`${BACKEND}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok)
      throw new Error(
        (await r.json().catch(() => ({ detail: r.statusText }))).detail ??
          "launch failed",
      );
  },

  stop: async (id) => {
    if (fleet) {
      fleet.stop(id);
      return;
    }
    await fetch(`${BACKEND}/api/agents/${id}/stop`, { method: "POST" });
  },

  stopAll: async () => {
    if (fleet) {
      fleet.stopAll();
      return;
    }
    await fetch(`${BACKEND}/api/stop-all`, { method: "POST" });
  },

  clear: async () => {
    if (fleet) {
      fleet.clear();
      return;
    }
    await fetch(`${BACKEND}/api/clear`, { method: "POST" });
  },

  setUseMockFallback: (v) => set({ useMockFallback: v }),
}));
