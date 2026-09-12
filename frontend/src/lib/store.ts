"use client";

import { create } from "zustand";
import type {
  ActivityEvent,
  Agent,
  AgentStatus,
  Campaign,
  ConnectionState,
  Notification,
  Opportunity,
  PlannedTask,
} from "@/lib/types";
import { CAMPAIGN } from "@/lib/mock/campaign";
import {
  buildAgents,
  DEFAULT_AGENT_COUNT,
  MAX_AGENTS,
  nextTaskFor,
} from "@/lib/mock/agents";
import { buildOpportunities } from "@/lib/mock/opportunities";
import { INITIAL_PLAN } from "@/lib/mock/plan";
import { Generator, type Emission } from "@/lib/sim/generator";

const MAX_EVENTS = 400;

export interface Counters {
  scanned: number;
  opportunities: number;
  inReview: number;
  posted: number;
  replies: number;
  strategyUpdates: number;
  mentions: number;
}

interface SimState {
  hydrated: boolean;
  campaign: Campaign;
  agentCount: number;
  agents: Agent[];
  events: ActivityEvent[];
  plan: PlannedTask[];
  opportunities: Opportunity[];
  notifications: Notification[];
  counters: Counters;
  paused: boolean;
  autoOptimize: boolean;
  connection: ConnectionState;
  demoMode: boolean;
  lastEventId: string | null;

  // lifecycle
  hydrate: () => void;
  tick: () => void;

  // controls
  setAgentCount: (n: number) => void;
  togglePause: () => void;
  setPaused: (v: boolean) => void;
  setAutoOptimize: (v: boolean) => void;
  setDemoMode: (v: boolean) => void;
  setConnection: (c: ConnectionState) => void;
  pauseAgent: (id: string) => void;
  resumeAgent: (id: string) => void;
  reallocate: () => void;

  // plan
  updatePlanStatus: (id: string, status: PlannedTask["status"]) => void;
  delayPlan: (id: string, minutes: number) => void;
  removePlan: (id: string) => void;
  restorePlan: (task: PlannedTask, index: number) => void;

  // opportunities
  setOpportunityStatus: (id: string, status: Opportunity["status"]) => void;

  // notifications
  markAllRead: () => void;

  // campaign
  updateCampaign: (patch: Partial<Campaign>) => void;
}

const generator = new Generator();
const resumeQueue: { id: string; at: number; status: AgentStatus }[] = [];
let tickCount = 0;

function applyPatches(agents: Agent[], em: Emission, now: number): Agent[] {
  if (!em.agentPatches?.length) return agents;
  return agents.map((a) => {
    const p = em.agentPatches!.find((x) => x.id === a.id);
    if (!p) return a;
    const stats = { ...a.stats };
    if (p.stats) {
      for (const k of Object.keys(p.stats) as (keyof Agent["stats"])[]) {
        if (k === "quality") continue;
        stats[k] += p.stats[k] ?? 0;
      }
    }
    let rejections = a.rejections;
    if (p.bumpRejection) {
      const found = rejections.find((r) => r.reason === p.bumpRejection);
      rejections = found
        ? rejections.map((r) =>
            r.reason === p.bumpRejection ? { ...r, count: r.count + 1 } : r,
          )
        : [...rejections, { reason: p.bumpRejection, count: 1 }];
    }
    return {
      ...a,
      status: p.status ?? a.status,
      currentTask: p.currentTask === undefined ? a.currentTask : p.currentTask,
      nextTask: p.nextTask === undefined ? a.nextTask : p.nextTask,
      stats,
      rejections,
      lastActiveAt: now,
    };
  });
}

export const useSim = create<SimState>((set, get) => ({
  hydrated: false,
  campaign: CAMPAIGN,
  agentCount: DEFAULT_AGENT_COUNT,
  agents: [],
  events: [],
  plan: INITIAL_PLAN,
  opportunities: [],
  notifications: [],
  counters: {
    scanned: 1284,
    opportunities: 47,
    inReview: 3,
    posted: 6,
    replies: 38,
    strategyUpdates: 3,
    mentions: 12,
  },
  paused: false,
  autoOptimize: true,
  connection: "connected",
  demoMode: true,
  lastEventId: null,

  hydrate: () => {
    if (get().hydrated) return;
    const now = Date.now();
    let agents = buildAgents(DEFAULT_AGENT_COUNT, now);
    const history = generator.seedHistory(agents);
    const events: ActivityEvent[] = [];
    const opportunities = buildOpportunities(now);
    for (const em of history) {
      agents = applyPatches(agents, em, em.event.ts);
      events.unshift(em.event);
      if (em.opportunity)
        opportunities.unshift({ ...em.opportunity, discoveredAt: em.event.ts });
      if (em.opportunityStatus) {
        const o = opportunities.find((x) => x.id === em.opportunityStatus!.id);
        if (o) o.status = em.opportunityStatus.status;
      }
    }
    // Reset transient error/paused states left over from seeding.
    agents = agents.map((a) =>
      a.status === "error" || a.status === "paused"
        ? { ...a, status: "idle", currentTask: null }
        : a,
    );
    const notifications: Notification[] = [
      {
        id: "n1",
        ts: now - 6 * 60000,
        title: "Draft ready for review",
        body: 'r/SaaS · "Best alternatives to Zapier in 2026?"',
        kind: "review",
        read: false,
      },
      {
        id: "n2",
        ts: now - 22 * 60000,
        title: "Follow-up question",
        body: "u/seedstage_sam replied in r/startups",
        kind: "info",
        read: false,
      },
      {
        id: "n3",
        ts: now - 61 * 60000,
        title: "Scout-03 paused",
        body: "r/zapier restricts promotional activity",
        kind: "warning",
        read: true,
      },
    ];
    set({
      hydrated: true,
      agents,
      events,
      opportunities,
      notifications,
      campaign: {
        ...CAMPAIGN,
        startedAt: now - 3 * 60 * 60 * 1000 - 12 * 60 * 1000,
      },
    });
  },

  tick: () => {
    const s = get();
    if (!s.hydrated || s.paused || s.connection !== "connected") return;
    tickCount++;
    const now = Date.now();

    // Resume agents whose pause/error has expired.
    let agents = s.agents;
    for (let i = resumeQueue.length - 1; i >= 0; i--) {
      const r = resumeQueue[i];
      if (r.at <= tickCount) {
        agents = agents.map((a) =>
          a.id === r.id && (a.status === "paused" || a.status === "error")
            ? {
                ...a,
                status: r.status,
                currentTask: null,
                nextTask: nextTaskFor(a.role, tickCount),
              }
            : a,
        );
        resumeQueue.splice(i, 1);
      }
    }

    const em = generator.next(agents);
    if (!em) {
      set({ agents });
      return;
    }
    agents = applyPatches(agents, em, now);
    if (em.resumeAgent)
      resumeQueue.push({
        id: em.resumeAgent.id,
        at: tickCount + em.resumeAgent.afterTicks,
        status: em.resumeAgent.status,
      });

    const events = [em.event, ...s.events].slice(0, MAX_EVENTS);
    let opportunities = s.opportunities;
    if (em.opportunity) opportunities = [em.opportunity, ...opportunities];
    if (em.opportunityStatus) {
      opportunities = opportunities.map((o) =>
        o.id === em.opportunityStatus!.id
          ? {
              ...o,
              status: em.opportunityStatus!.status,
              engagement: em.opportunityStatus!.engagement ?? o.engagement,
            }
          : o,
      );
    }
    let plan = s.plan;
    if (em.planInsert) plan = [...plan, em.planInsert];
    if (em.planRemove) plan = plan.filter((p) => p.id !== em.planRemove);
    const counters = { ...s.counters };
    if (em.counters)
      for (const k of Object.keys(em.counters) as (keyof Counters)[])
        counters[k] += em.counters[k] ?? 0;
    const notifications = em.notification
      ? [
          { id: `n_${now}`, ts: now, read: false, ...em.notification },
          ...s.notifications,
        ].slice(0, 30)
      : s.notifications;

    set({
      agents,
      events,
      opportunities,
      plan,
      counters,
      notifications,
      lastEventId: em.event.id,
    });
  },

  setAgentCount: (n) => {
    const count = Math.max(1, Math.min(MAX_AGENTS, n));
    const s = get();
    const now = Date.now();
    const template = buildAgents(count, now);
    // Keep existing agents' live state; add new ones fresh; drop removed.
    const agents = template.map(
      (t) => s.agents.find((a) => a.id === t.id) ?? t,
    );
    set({ agentCount: count, agents });
  },

  togglePause: () =>
    set((s) => ({
      paused: !s.paused,
      campaign: { ...s.campaign, status: !s.paused ? "paused" : "running" },
    })),
  setPaused: (v) =>
    set((s) => ({
      paused: v,
      campaign: { ...s.campaign, status: v ? "paused" : "running" },
    })),
  setAutoOptimize: (v) => set({ autoOptimize: v }),
  setDemoMode: (v) => set({ demoMode: v }),
  setConnection: (c) => set({ connection: c }),

  pauseAgent: (id) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === id
          ? { ...a, status: "paused", currentTask: "Paused by you" }
          : a,
      ),
    })),
  resumeAgent: (id) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === id ? { ...a, status: "idle", currentTask: null } : a,
      ),
    })),

  reallocate: () => {
    const s = get();
    const now = Date.now();
    set({
      agents: s.agents.map((a) => ({
        ...a,
        nextTask: nextTaskFor(a.role, now + a.id.length),
        lastActiveAt: now,
      })),
      events: [
        {
          id: `ev_realloc_${now}`,
          ts: now,
          agentId: "strategy-01",
          category: "strategy",
          action: "Reallocation requested",
          context: "Rebalancing swarm across roles",
          platform: "system",
          status: "complete",
          detail: {
            task: "Reallocate agents.",
            summary:
              "Manual reallocation triggered. Next tasks reassigned based on current opportunity density.",
          },
        } satisfies ActivityEvent,
        ...s.events,
      ].slice(0, MAX_EVENTS),
    });
  },

  updatePlanStatus: (id, status) =>
    set((s) => ({
      plan: s.plan.map((p) => (p.id === id ? { ...p, status } : p)),
    })),
  delayPlan: (id, minutes) =>
    set((s) => ({
      plan: s.plan.map((p) => {
        if (p.id !== id) return p;
        const base =
          p.timing.kind === "in"
            ? p.timing.minutes
            : p.timing.kind === "now"
              ? 0
              : 60;
        return {
          ...p,
          timing: { kind: "in", minutes: base + minutes },
          status: p.status === "running" ? "scheduled" : p.status,
        };
      }),
    })),
  removePlan: (id) => set((s) => ({ plan: s.plan.filter((p) => p.id !== id) })),
  restorePlan: (task, index) =>
    set((s) => {
      const plan = [...s.plan];
      plan.splice(Math.min(index, plan.length), 0, task);
      return { plan };
    }),

  setOpportunityStatus: (id, status) =>
    set((s) => ({
      opportunities: s.opportunities.map((o) =>
        o.id === id ? { ...o, status } : o,
      ),
      counters:
        status === "approved"
          ? { ...s.counters, posted: s.counters.posted + 1 }
          : s.counters,
    })),

  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),

  updateCampaign: (patch) =>
    set((s) => ({ campaign: { ...s.campaign, ...patch } })),
}));

/** Convenience selectors */
export const selectAgent = (id: string) => (s: SimState) =>
  s.agents.find((a) => a.id === id);
export const selectActiveCount = (s: SimState) =>
  s.agents.filter((a) => a.status !== "paused" && a.status !== "error").length;
