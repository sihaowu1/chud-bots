import type {
  ActivityEvent,
  Agent,
  AgentRole,
  AgentStatus,
  Notification,
  Opportunity,
  PlannedTask,
} from "@/lib/types";
import {
  draftFor,
  IRRELEVANT_THREADS,
  QUERIES,
  RELEVANT_THREADS,
  SUBREDDITS,
} from "@/lib/mock/content";
import { nextTaskFor } from "@/lib/mock/agents";

// ---------------------------------------------------------------------------
// Event generator. Produces one emission per tick. Multi-step "chains"
// (discover → intent → relevance → policy → draft → review → monitor) are
// scheduled as pending steps so several chains interleave with standalone
// events, which is what keeps the feed from visibly looping.
// ---------------------------------------------------------------------------

export interface AgentPatch {
  id: string;
  status?: AgentStatus;
  currentTask?: string | null;
  nextTask?: string | null;
  stats?: Partial<Agent["stats"]>;
  bumpRejection?: string;
}

export interface Emission {
  event: ActivityEvent;
  agentPatches?: AgentPatch[];
  opportunity?: Opportunity;
  opportunityStatus?: {
    id: string;
    status: Opportunity["status"];
    engagement?: Opportunity["engagement"];
  };
  notification?: Omit<Notification, "id" | "ts" | "read">;
  planInsert?: PlannedTask;
  planRemove?: string;
  counters?: Partial<
    Record<
      | "scanned"
      | "opportunities"
      | "inReview"
      | "posted"
      | "replies"
      | "strategyUpdates"
      | "mentions",
      number
    >
  >;
  /** Re-activate an agent after N ticks (used for paused/error states). */
  resumeAgent?: { id: string; afterTicks: number; status: AgentStatus };
}

interface Pending {
  dueTick: number;
  run: (ctx: Ctx) => Emission | null;
}

interface Ctx {
  agents: Agent[];
  now: number;
  tick: number;
}

const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(arr: T[]): T => arr[rnd(arr.length)];
const between = (a: number, b: number) => a + rnd(b - a + 1);
const chance = (p: number) => Math.random() < p;

const INTENT_PHRASE: Record<string, string> = {
  "Tool recommendation": "Looking for workflow automation tools",
  "Alternative comparison": "Comparing alternatives to current tool",
  "Solution request": "Looking for a way to automate a process",
  "Experience request": "Asking what others use",
};

let seq = 0;
const id = (p: string) =>
  `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

function byRole(
  agents: Agent[],
  role: AgentRole,
  exclude: AgentStatus[] = ["paused", "error"],
) {
  const pool = agents.filter(
    (a) => a.role === role && !exclude.includes(a.status),
  );
  return pool.length
    ? pick(pool)
    : (agents.find((a) => a.role === role) ?? null);
}

function ev(
  partial: Omit<ActivityEvent, "id" | "ts"> & { ts?: number },
): ActivityEvent {
  return { id: id("ev"), ts: partial.ts ?? Date.now(), ...partial };
}

export class Generator {
  private pending: Pending[] = [];
  private tick = 0;
  private activeChains = 0;
  private recentThreads: string[] = [];
  private recentQueries: string[] = [];

  private fresh<T extends { title: string }>(pool: T[]): T {
    for (let i = 0; i < 6; i++) {
      const t = pick(pool);
      if (!this.recentThreads.includes(t.title)) {
        this.recentThreads = [t.title, ...this.recentThreads].slice(0, 12);
        return t;
      }
    }
    return pick(pool);
  }

  private freshQuery() {
    for (let i = 0; i < 6; i++) {
      const q = pick(QUERIES);
      if (!this.recentQueries.includes(q)) {
        this.recentQueries = [q, ...this.recentQueries].slice(0, 6);
        return q;
      }
    }
    return pick(QUERIES);
  }

  /** Produce the next emission. Returns null only if there are no agents. */
  next(agents: Agent[]): Emission | null {
    this.tick++;
    const ctx: Ctx = { agents, now: Date.now(), tick: this.tick };
    if (!agents.length) return null;

    // Run a due pending step first (chains take priority so they feel causal).
    const dueIdx = this.pending.findIndex((p) => p.dueTick <= this.tick);
    if (dueIdx >= 0) {
      const [p] = this.pending.splice(dueIdx, 1);
      const out = p.run(ctx);
      if (out) return out;
    }

    // Otherwise start something new. Discovery chains get ~55% of ticks while
    // fewer than three are in flight; the rest is spread over standalone
    // events so no single kind dominates.
    const canStart = this.activeChains < 3;
    const roll = Math.random();
    if (canStart && roll < 0.55) return this.startDiscovery(ctx);
    const r = canStart ? (roll - 0.55) / 0.45 : roll;
    if (r < 0.24) return this.monitorEvent(ctx);
    if (r < 0.46) return this.visibilityEvent(ctx);
    if (r < 0.64) return this.strategyEvent(ctx);
    if (r < 0.84) return this.scoutSummary(ctx);
    if (r < 0.91) return this.policyPause(ctx);
    if (r < 0.95) return this.errorEvent(ctx);
    return this.scoutSummary(ctx);
  }

  private schedule(afterTicks: number, run: Pending["run"]) {
    this.pending.push({ dueTick: this.tick + afterTicks, run });
  }

  // ---- Discovery chain -----------------------------------------------------

  private startDiscovery(ctx: Ctx): Emission | null {
    const scout = byRole(ctx.agents, "discovery");
    if (!scout) return this.monitorEvent(ctx);
    const query = this.freshQuery();
    this.activeChains++;

    this.schedule(between(1, 2), (c) =>
      this.discoverThread(c, scout.id, query),
    );

    return {
      event: ev({
        agentId: scout.id,
        category: "discovery",
        action: "Searching",
        context: `"${query}"`,
        platform: "reddit",
        status: "searching",
        detail: {
          task: `Search Reddit for discussions matching "${query}".`,
          summary: `Querying Reddit search and the top ${between(4, 8)} communities for recent threads where the author is asking for help.`,
          metrics: [
            { label: "Sort", value: "New · past 7 days" },
            { label: "Communities", value: `${between(4, 8)}` },
          ],
        },
      }),
      agentPatches: [
        { id: scout.id, status: "searching", currentTask: `"${query}"` },
      ],
    };
  }

  private discoverThread(ctx: Ctx, scoutId: string, query: string): Emission {
    const sub = pick(SUBREDDITS);

    // ~30% of the time the scout finds something that looks right but isn't.
    if (chance(0.3)) {
      const t = this.fresh(IRRELEVANT_THREADS);
      this.activeChains--;
      return {
        event: ev({
          agentId: scoutId,
          category: "discovery",
          action: "Discussion rejected",
          context: `${sub} · "${t.title}"`,
          platform: "reddit",
          status: "rejected",
          score: between(8, 34),
          detail: {
            task: `Screen search results for "${query}".`,
            summary: `Keyword match but no request for help. ${t.reason}.`,
            evidence: [
              t.reason,
              "No question or comparison request in the body",
              "Author is not describing a problem",
            ],
            risk: "low",
          },
        }),
        agentPatches: [
          {
            id: scoutId,
            status: "searching",
            stats: { scanned: 1, rejected: 1 },
            bumpRejection: t.reason
              .split(" · ")[0]
              .replace("Not relevant", "Not relevant"),
          },
        ],
        counters: { scanned: 1 },
      };
    }

    const t = this.fresh(RELEVANT_THREADS);
    const oppId = id("opp");
    const thread = {
      sub,
      title: t.title,
      author: t.author,
      excerpt: t.excerpt,
      intent: t.intent,
    };

    this.schedule(between(1, 2), (c) => this.detectIntent(c, oppId, thread));

    return {
      event: ev({
        agentId: scoutId,
        category: "discovery",
        action: "Thread discovered",
        context: `${sub} · "${t.title}"`,
        platform: "reddit",
        status: "new",
        detail: {
          task: `Screen search results for "${query}".`,
          summary: `Author appears to be actively asking for help. Posted ${between(4, 58)} minutes ago with ${between(2, 19)} comments; queued for intent classification.`,
          evidence: [
            `Matched query: "${query}"`,
            `${between(2, 19)} comments, rising`,
            "Author has no prior recommendation requests",
          ],
          opportunityId: oppId,
        },
      }),
      agentPatches: [
        {
          id: scoutId,
          status: "searching",
          stats: { scanned: 1, relevant: 1 },
        },
      ],
      counters: { scanned: 1 },
    };
  }

  private detectIntent(
    ctx: Ctx,
    oppId: string,
    thread: {
      sub: string;
      title: string;
      author: string;
      excerpt: string;
      intent: string;
    },
  ): Emission | null {
    const agent = byRole(ctx.agents, "intent");
    if (!agent) {
      this.activeChains--;
      return null;
    }
    const score = between(84, 97);
    this.schedule(between(1, 2), (c) =>
      this.evaluateRelevance(c, oppId, thread, score),
    );
    return {
      event: ev({
        agentId: agent.id,
        category: "analysis",
        action: "Intent detected",
        context: INTENT_PHRASE[thread.intent] ?? thread.intent,
        platform: "reddit",
        status: "analyzing",
        score,
        detail: {
          task: `Classify what ${thread.author} is asking for in "${thread.title}".`,
          summary: `The author describes a concrete, recurring problem and asks what others use. Classified as ${thread.intent.toLowerCase()} with ${score}% confidence.`,
          evidence: [
            `Intent: ${thread.intent}`,
            "Explicit ask in title",
            "Describes current tooling and its failure",
          ],
          opportunityId: oppId,
        },
      }),
      agentPatches: [
        {
          id: agent.id,
          status: "analyzing",
          currentTask: `${thread.sub} · "${thread.title}"`,
          stats: { scanned: 1, relevant: 1, completed: 1 },
        },
      ],
    };
  }

  private evaluateRelevance(
    ctx: Ctx,
    oppId: string,
    thread: {
      sub: string;
      title: string;
      author: string;
      excerpt: string;
      intent: string;
    },
    intentScore: number,
  ): Emission | null {
    const agent = byRole(ctx.agents, "relevance");
    if (!agent) {
      this.activeChains--;
      return null;
    }

    if (chance(0.2)) {
      this.activeChains--;
      const score = between(31, 58);
      return {
        event: ev({
          agentId: agent.id,
          category: "analysis",
          action: "Evaluating FlowPilot AI",
          context: "Tangential — problem is upstream of automation",
          platform: "reddit",
          status: "rejected",
          score,
          detail: {
            task: "Determine whether FlowPilot AI belongs in this conversation.",
            summary: `The author's problem is real but sits upstream of what FlowPilot does (data quality, not workflow execution). Contributing would read as a stretch. Relevance ${score}%.`,
            evidence: [
              "Core need is not a multi-step process",
              "Competitors named are not in the same category",
            ],
            relevance: score,
            risk: "medium",
            opportunityId: oppId,
          },
        }),
        agentPatches: [
          {
            id: agent.id,
            status: "analyzing",
            currentTask: `${thread.sub} · "${thread.title}"`,
            stats: { scanned: 1, rejected: 1, completed: 1 },
            bumpRejection: "Tangential problem",
          },
        ],
      };
    }

    const score = between(82, 97);
    this.schedule(between(1, 2), (c) =>
      this.policyCheck(c, oppId, thread, score),
    );
    return {
      event: ev({
        agentId: agent.id,
        category: "analysis",
        action: "Evaluating FlowPilot AI",
        context: "Direct problem match",
        platform: "reddit",
        status: "analyzing",
        score,
        detail: {
          task: "Determine whether FlowPilot AI belongs in this conversation.",
          summary: `The author is specifically asking for ${thread.intent.toLowerCase() === "alternative comparison" ? "alternatives to their current tool" : "a way to automate a recurring process"}, and FlowPilot directly addresses that. Relevance ${score}%, risk low.`,
          evidence: [
            "Direct problem match",
            `Intent confidence ${intentScore}%`,
            "Audience matches: small team / founder",
          ],
          relevance: score,
          risk: "low",
          opportunityId: oppId,
        },
      }),
      agentPatches: [
        {
          id: agent.id,
          status: "analyzing",
          currentTask: `${thread.sub} · "${thread.title}"`,
          stats: { scanned: 1, relevant: 1, completed: 1 },
        },
      ],
    };
  }

  private policyCheck(
    ctx: Ctx,
    oppId: string,
    thread: {
      sub: string;
      title: string;
      author: string;
      excerpt: string;
      intent: string;
    },
    relevance: number,
  ): Emission | null {
    const agent = byRole(ctx.agents, "policy");
    if (!agent) {
      this.activeChains--;
      return null;
    }
    const spam = between(4, 14);
    const rules = between(2, 9);

    if (chance(0.15)) {
      this.activeChains--;
      return {
        event: ev({
          agentId: agent.id,
          category: "policy",
          action: "Rule check flagged",
          context: `${thread.sub} prohibits product mentions`,
          platform: "reddit",
          status: "blocked",
          detail: {
            task: `Check ${thread.sub} rules before preparing a contribution.`,
            summary: `${thread.sub} rule 3 removes replies that name commercial products. A contribution would be removed and could affect account standing. Opportunity skipped.`,
            evidence: [
              "Rule 3: no product recommendations by vendors",
              "Moderator removal rate for vendor replies: high",
            ],
            risk: "high",
            opportunityId: oppId,
          },
        }),
        agentPatches: [
          {
            id: agent.id,
            status: "waiting",
            stats: { scanned: 1, rejected: 1, completed: 1 },
            bumpRejection: "Community blocks promotion",
          },
        ],
      };
    }

    const opportunity: Opportunity = {
      id: oppId,
      platform: "reddit",
      community: thread.sub,
      title: thread.title,
      author: thread.author,
      excerpt: thread.excerpt,
      intent: thread.intent,
      relevance,
      activity: pick(["high", "medium", "medium", "low"]),
      createdAt: ctx.now - between(6, 90) * 60 * 1000,
      discoveredAt: ctx.now,
      status: "new",
      analysis: {
        whyMatch: `Author explicitly asks for ${thread.intent.toLowerCase()} and describes a recurring multi-step process, which is FlowPilot's core use case.`,
        entityRelevance: relevance,
        communityRules: {
          allowsProductMentions: true,
          requiresDisclosure: true,
          note: "Product mentions allowed in replies when relevant; disclosure required.",
        },
        spamRisk: spam,
        promoIntensity: between(16, 30),
      },
      suggestedResponse: draftFor(thread.intent),
    };

    this.schedule(between(1, 3), (c) => this.draft(c, opportunity));

    return {
      event: ev({
        agentId: agent.id,
        category: "policy",
        action: "Rule check completed",
        context: `Spam ${spam}% · Rules ${rules}%`,
        platform: "reddit",
        status: "allowed",
        detail: {
          task: `Check ${thread.sub} rules, spam risk and promotional intensity.`,
          summary: `${thread.sub} allows product mentions in replies with disclosure. Spam risk ${spam}%, rule-violation risk ${rules}%. Cleared for drafting.`,
          evidence: [
            "Disclosure required — will be included",
            "No link drops",
            "Account has prior non-promotional history here",
          ],
          risk: "low",
          opportunityId: oppId,
          metrics: [
            { label: "Spam risk", value: `${spam}%` },
            { label: "Rule risk", value: `${rules}%` },
          ],
        },
      }),
      agentPatches: [
        {
          id: agent.id,
          status: "waiting",
          currentTask: `Cleared ${thread.sub} thread`,
          stats: { scanned: 1, relevant: 1, completed: 1 },
        },
      ],
      opportunity,
      counters: { opportunities: 1 },
    };
  }

  private draft(ctx: Ctx, opp: Opportunity): Emission | null {
    const agent = byRole(ctx.agents, "writer");
    if (!agent) {
      this.activeChains--;
      return null;
    }
    this.schedule(between(1, 2), (c) => this.review(c, opp, agent.id));
    return {
      event: ev({
        agentId: agent.id,
        category: "writing",
        action: "Draft generated",
        context: "Ready for review",
        platform: "reddit",
        status: "complete",
        detail: {
          task: `Prepare a useful contribution for ${opp.community} · "${opp.title}".`,
          summary: `Drafted a reply that answers the question first and mentions FlowPilot once, with disclosure. ${opp.suggestedResponse.split(" ").length} words. Promotional intensity ${opp.analysis.promoIntensity}%.`,
          evidence: [
            "Leads with a non-product answer",
            "Single disclosed mention",
            "Ends with a clarifying question",
          ],
          opportunityId: opp.id,
        },
      }),
      agentPatches: [
        {
          id: agent.id,
          status: "writing",
          currentTask: `Draft for ${opp.community} thread`,
          stats: { completed: 1, relevant: 1 },
        },
      ],
    };
  }

  private review(ctx: Ctx, opp: Opportunity, writerId: string): Emission {
    this.activeChains--;
    // Long-tail follow-up: engagement update later, once "posted".
    this.schedule(between(8, 16), (c) => this.engagementAfter(c, opp));
    return {
      event: ev({
        agentId: writerId,
        category: "writing",
        action: "Response moved to review",
        context: `${opp.community} · "${opp.title}"`,
        platform: "reddit",
        status: "review",
        detail: {
          task: "Hand off to human review.",
          summary:
            "Draft is waiting for your approval. Nothing is posted without it.",
          opportunityId: opp.id,
        },
      }),
      agentPatches: [
        {
          id: writerId,
          status: "idle",
          currentTask: null,
          nextTask: nextTaskFor("writer", this.tick),
        },
      ],
      opportunityStatus: { id: opp.id, status: "review" },
      notification: {
        title: "Draft ready for review",
        body: `${opp.community} · "${opp.title}"`,
        kind: "review",
      },
      counters: { inReview: 1 },
    };
  }

  private engagementAfter(ctx: Ctx, opp: Opportunity): Emission | null {
    const agent = byRole(ctx.agents, "monitor");
    if (!agent) return null;
    const replies = between(1, 5);
    const votes = between(3, 18);
    return {
      event: ev({
        agentId: agent.id,
        category: "monitoring",
        action: "Engagement update",
        context: `+${replies} replies · +${votes} votes`,
        platform: "reddit",
        status: "updated",
        detail: {
          task: `Track engagement on ${opp.community} · "${opp.title}".`,
          summary: `Contribution is being read. ${replies} new repl${replies === 1 ? "y" : "ies"}, ${votes} net votes. No moderator action.`,
          opportunityId: opp.id,
          metrics: [
            { label: "Replies", value: `+${replies}` },
            { label: "Votes", value: `+${votes}` },
          ],
        },
      }),
      agentPatches: [
        {
          id: agent.id,
          status: "monitoring",
          currentTask: `${opp.community} thread`,
          stats: { completed: 1 },
        },
      ],
      counters: { replies },
    };
  }

  // ---- Standalone events ----------------------------------------------------

  private monitorEvent(ctx: Ctx): Emission | null {
    const agent = byRole(ctx.agents, "monitor");
    if (!agent) return this.strategyEvent(ctx);
    const t = pick(RELEVANT_THREADS);
    const sub = pick(SUBREDDITS);
    const variant = rnd(3);
    if (variant === 0) {
      const replies = between(1, 6);
      const votes = between(2, 22);
      return {
        event: ev({
          agentId: agent.id,
          category: "monitoring",
          action: "Engagement update",
          context: `+${replies} replies · +${votes} votes`,
          platform: "reddit",
          status: "updated",
          detail: {
            task: `Track engagement on ${sub} · "${t.title}".`,
            summary: `${replies} new repl${replies === 1 ? "y" : "ies"} and ${votes} net votes since last check.`,
            metrics: [
              { label: "Replies", value: `+${replies}` },
              { label: "Votes", value: `+${votes}` },
            ],
          },
        }),
        agentPatches: [
          {
            id: agent.id,
            status: "monitoring",
            currentTask: `${sub} thread`,
            stats: { completed: 1 },
          },
        ],
        counters: { replies },
      };
    }
    if (variant === 1) {
      return {
        event: ev({
          agentId: agent.id,
          category: "monitoring",
          action: "New reply detected",
          context: `${t.author} asked a follow-up question`,
          platform: "reddit",
          status: "updated",
          detail: {
            task: `Watch ${sub} · "${t.title}" for follow-ups.`,
            summary: `${t.author} replied asking how setup compares to Make. Queued for Writer-01 as a follow-up draft; requires approval.`,
            evidence: ["Direct question to our reply", "Positive sentiment"],
          },
        }),
        agentPatches: [
          { id: agent.id, status: "monitoring", currentTask: `${sub} thread` },
        ],
        notification: {
          title: "Follow-up question",
          body: `${t.author} replied in ${sub}`,
          kind: "info",
        },
        counters: { replies: 1 },
      };
    }
    return {
      event: ev({
        agentId: agent.id,
        category: "monitoring",
        action: "Thread locked",
        context: `${sub} · "${t.title}" — monitoring stopped`,
        platform: "reddit",
        status: "info",
        detail: {
          task: `Watch ${sub} · "${t.title}".`,
          summary:
            "Moderators locked the thread. No further replies possible; final engagement recorded.",
        },
      }),
      agentPatches: [
        { id: agent.id, status: "monitoring", bumpRejection: "Thread locked" },
      ],
    };
  }

  private visibilityEvent(ctx: Ctx): Emission | null {
    const agent = byRole(ctx.agents, "visibility");
    if (!agent) return this.strategyEvent(ctx);
    const q = pick([
      "Zapier alternatives",
      "AI workflow automation",
      "AI agents for operations",
      "automation for small business",
    ]);
    const variant = rnd(3);
    if (variant === 0) {
      const sub = pick(SUBREDDITS);
      return {
        event: ev({
          agentId: agent.id,
          category: "visibility",
          action: "Mention detected",
          context: `FlowPilot AI cited in ${sub} thread`,
          platform: "reddit",
          status: "detected",
          detail: {
            task: "Scan for organic mentions of FlowPilot AI.",
            summary: `A user in ${sub} mentioned FlowPilot unprompted in a comparison with Make. Not from our agents. Logged as an organic mention.`,
            evidence: [
              "Organic — no agent involvement",
              "Neutral-to-positive sentiment",
            ],
          },
        }),
        agentPatches: [
          {
            id: agent.id,
            status: "analyzing",
            currentTask: "Organic mention scan",
            stats: { completed: 1, relevant: 1 },
          },
        ],
        counters: { mentions: 1 },
      };
    }
    if (variant === 1) {
      return {
        event: ev({
          agentId: agent.id,
          category: "visibility",
          action: "AI answer check",
          context: `"${q}" — FlowPilot present`,
          platform: "web",
          status: "detected",
          detail: {
            task: `Probe AI assistants for "${q}".`,
            summary: `FlowPilot appeared in 2 of 3 assistant answers for "${q}", up from 1 of 3 last check.`,
            metrics: [
              { label: "Assistants", value: "2 / 3" },
              { label: "Position", value: "3rd–5th" },
            ],
          },
        }),
        agentPatches: [
          {
            id: agent.id,
            status: "analyzing",
            currentTask: `"${q}"`,
            stats: { completed: 1 },
          },
        ],
      };
    }
    return {
      event: ev({
        agentId: agent.id,
        category: "visibility",
        action: "Search presence",
        context: `"${q}" — page 2, position ${between(11, 18)}`,
        platform: "web",
        status: "info",
        detail: {
          task: `Record search position for "${q}".`,
          summary: `flowpilot.ai appears on page 2. Reddit threads mentioning FlowPilot rank on page 1.`,
        },
      }),
      agentPatches: [
        {
          id: agent.id,
          status: "analyzing",
          currentTask: `"${q}"`,
          stats: { completed: 1 },
        },
      ],
    };
  }

  private strategyEvent(ctx: Ctx): Emission | null {
    const agent = byRole(ctx.agents, "strategy");
    if (!agent) return null;
    const variant = rnd(3);
    const sub = pick(SUBREDDITS);
    const q = pick(QUERIES);
    if (variant === 0) {
      return {
        event: ev({
          agentId: agent.id,
          category: "strategy",
          action: "Priorities changed",
          context: `Shifted 2 scouts to ${sub}`,
          platform: "system",
          status: "complete",
          detail: {
            task: "Re-evaluate discovery strategy.",
            summary: `${sub} produced 3 of the last 5 strong opportunities. Reassigned two scouts there for the next 30 minutes.`,
            evidence: [
              `${sub}: 3 strong opportunities / 11 threads`,
              "r/webdev: 0 / 14 — deprioritized",
            ],
          },
        }),
        agentPatches: [
          {
            id: agent.id,
            status: "idle",
            currentTask: null,
            stats: { completed: 1 },
          },
        ],
        planInsert: {
          id: id("plan"),
          timing: { kind: "in", minutes: 30 },
          actor: "strategy-01",
          title: "Review scout reassignment",
          detail: `Did ${sub} sustain its opportunity rate?`,
          status: "scheduled",
        },
        counters: { strategyUpdates: 1 },
      };
    }
    if (variant === 1) {
      return {
        event: ev({
          agentId: agent.id,
          category: "strategy",
          action: "Query added",
          context: `"${q}" based on 3 strong opportunities`,
          platform: "system",
          status: "complete",
          detail: {
            task: "Refine target search intent.",
            summary: `Three recent high-relevance threads shared the phrase "${q}". Added as a discovery query.`,
          },
        }),
        agentPatches: [
          {
            id: agent.id,
            status: "idle",
            currentTask: null,
            stats: { completed: 1 },
          },
        ],
        counters: { strategyUpdates: 1 },
      };
    }
    return {
      event: ev({
        agentId: agent.id,
        category: "strategy",
        action: "Query deprioritized",
        context: `"${q}" — 0 relevant in 40 threads`,
        platform: "system",
        status: "complete",
        detail: {
          task: "Refine target search intent.",
          summary: `"${q}" returned 40 threads and no relevant opportunities in the last 2 hours. Lowered to background frequency.`,
        },
      }),
      agentPatches: [
        {
          id: agent.id,
          status: "idle",
          currentTask: null,
          stats: { completed: 1 },
        },
      ],
      counters: { strategyUpdates: 1 },
    };
  }

  private scoutSummary(ctx: Ctx): Emission | null {
    const scout = byRole(ctx.agents, "discovery");
    if (!scout) return null;
    const sub = pick(SUBREDDITS);
    const n = between(9, 31);
    const k = between(0, 3);
    return {
      event: ev({
        agentId: scout.id,
        category: "discovery",
        action: "Scan complete",
        context: `${sub} · ${n} threads, ${k} candidate${k === 1 ? "" : "s"}`,
        platform: "reddit",
        status: "complete",
        detail: {
          task: `Scan ${sub} for new discussions.`,
          summary: `${n} threads screened, ${k} passed to intent classification, ${n - k} rejected (mostly off-topic or older than 7 days).`,
          metrics: [
            { label: "Screened", value: `${n}` },
            { label: "Candidates", value: `${k}` },
          ],
        },
      }),
      agentPatches: [
        {
          id: scout.id,
          status: "searching",
          currentTask: `${sub}`,
          nextTask: nextTaskFor("discovery", this.tick),
          stats: { scanned: n, relevant: k, rejected: n - k },
        },
      ],
      counters: { scanned: n },
    };
  }

  private policyPause(ctx: Ctx): Emission | null {
    const scout = byRole(ctx.agents, "discovery");
    if (!scout) return null;
    const sub = pick(["r/zapier", "r/sysadmin", "r/marketing"]);
    return {
      event: ev({
        agentId: scout.id,
        category: "policy",
        action: "Agent paused",
        context: `${sub} restricts promotional activity`,
        platform: "reddit",
        status: "paused",
        detail: {
          task: `Scan ${sub}.`,
          summary: `${sub} rules prohibit vendor participation. Scout paused for this community and will resume on the next assignment.`,
          risk: "high",
        },
      }),
      agentPatches: [
        { id: scout.id, status: "paused", currentTask: `Paused · ${sub}` },
      ],
      resumeAgent: {
        id: scout.id,
        afterTicks: between(3, 5),
        status: "searching",
      },
      notification: {
        title: `${scout.name} paused`,
        body: `${sub} restricts promotional activity`,
        kind: "warning",
      },
    };
  }

  private errorEvent(ctx: Ctx): Emission | null {
    const a = pick(ctx.agents.filter((x) => x.status !== "paused"));
    if (!a) return null;
    return {
      event: ev({
        agentId: a.id,
        category: "error",
        action: "Rate limited",
        context: "Reddit API · retrying in 30s",
        platform: "reddit",
        status: "error",
        detail: {
          task: a.currentTask ?? "Current task",
          summary:
            "Reddit returned 429. Backing off for 30 seconds before retrying with a lower request rate.",
          risk: "low",
        },
      }),
      agentPatches: [{ id: a.id, status: "error" }],
      resumeAgent: {
        id: a.id,
        afterTicks: 2,
        status: a.status === "error" ? "idle" : a.status,
      },
    };
  }

  /** Seed a plausible recent history so the feed is not empty on first paint. */
  seedHistory(agents: Agent[], count = 28): Emission[] {
    const out: Emission[] = [];
    const saved = this.pending;
    this.pending = [];
    for (let i = 0; i < count; i++) {
      const e = this.next(agents);
      if (e) out.push(e);
    }
    // Drain any in-flight chain steps into history too, so the seeded feed
    // reads as complete sequences rather than dangling starts.
    let guard = 0;
    while (this.pending.length && guard++ < 40) {
      const p = this.pending.shift()!;
      const e = p.run({ agents, now: Date.now(), tick: this.tick });
      if (e) out.push(e);
    }
    // Assign timestamps backwards from now so the newest seeded event is a few
    // seconds old and nothing lands in the future.
    let t = Date.now() - 3000;
    for (let i = out.length - 1; i >= 0; i--) {
      out[i].event.ts = t;
      t -= 2600 + rnd(3200);
    }
    this.pending = saved;
    this.activeChains = 0;
    return out;
  }
}
