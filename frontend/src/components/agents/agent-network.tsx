"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ActivityEvent, Agent, AgentRole } from "@/lib/types";
import { useSim } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/mock/agents";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Node graph. Strategy-01 in the centre, roles arranged so the left→right
// reading order mirrors the pipeline. Edges are static and faint; a pulse
// travels along one only when a simulated event actually flows through it.
// ---------------------------------------------------------------------------

const W = 960;
const H = 470;
const CX = 480;
const CY = 226;

const REVIEW_ID = "review";

interface Node {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  r: number;
  role?: AgentRole;
  agent?: Agent;
}

interface Pulse {
  id: string;
  from: string;
  to: string;
  label: string;
  tone: "signal" | "success" | "danger" | "warning" | "neutral";
}

interface Ping {
  id: string;
  node: string;
  tone: "signal" | "danger" | "warning";
}

function spread(n: number, center: number, gap: number) {
  return Array.from({ length: n }, (_, i) => center + (i - (n - 1) / 2) * gap);
}

function layout(agents: Agent[]): Node[] {
  const by = (role: AgentRole) => agents.filter((a) => a.role === role);
  const nodes: Node[] = [];

  const strategy = by("strategy")[0];
  nodes.push({
    id: strategy?.id ?? "strategy-01",
    label: strategy?.name ?? "Strategy-01",
    sub: "coordinator",
    x: CX,
    y: CY,
    r: 22,
    role: "strategy",
    agent: strategy,
  });

  const place = (list: Agent[], x: number, cy: number, gap: number, r = 14) =>
    spread(list.length, cy, gap).forEach((y, i) =>
      nodes.push({
        id: list[i].id,
        label: list[i].name,
        x,
        y,
        r,
        role: list[i].role,
        agent: list[i],
      }),
    );

  place(by("discovery"), 92, CY, 72);
  place(by("intent"), 236, CY, 96);
  place(by("relevance"), 358, CY, 96);
  place(by("writer"), 628, CY - 64, 72);
  place(by("policy"), 628, CY + 64, 72);

  const monitors = by("monitor");
  spread(monitors.length, CX + 52, 84).forEach((x, i) =>
    nodes.push({
      id: monitors[i].id,
      label: monitors[i].name,
      x,
      y: 404,
      r: 14,
      role: "monitor",
      agent: monitors[i],
    }),
  );
  const vis = by("visibility");
  spread(vis.length, CX - 52, 84).forEach((x, i) =>
    nodes.push({
      id: vis[i].id,
      label: vis[i].name,
      x,
      y: 404,
      r: 14,
      role: "visibility",
      agent: vis[i],
    }),
  );

  nodes.push({
    id: REVIEW_ID,
    label: "You",
    sub: "review",
    x: 846,
    y: CY,
    r: 16,
  });
  return nodes;
}

function staticEdges(nodes: Node[]): [string, string, "flow" | "control"][] {
  const ids = (role: AgentRole) =>
    nodes.filter((n) => n.role === role).map((n) => n.id);
  const strategy = nodes[0].id;
  const edges: [string, string, "flow" | "control"][] = [];
  const intents = ids("intent");
  const rels = ids("relevance");
  ids("discovery").forEach(
    (s, i) =>
      intents.length && edges.push([s, intents[i % intents.length], "flow"]),
  );
  intents.forEach(
    (it, i) => rels.length && edges.push([it, rels[i % rels.length], "flow"]),
  );
  rels.forEach((r) => edges.push([r, strategy, "flow"]));
  ids("writer").forEach((w) => edges.push([strategy, w, "flow"]));
  ids("policy").forEach((p) => edges.push([strategy, p, "flow"]));
  ids("writer").forEach((w) => edges.push([w, REVIEW_ID, "flow"]));
  ids("monitor").forEach((m) => edges.push([m, strategy, "control"]));
  ids("visibility").forEach((v) => edges.push([v, strategy, "control"]));
  ids("discovery").forEach((s) => edges.push([strategy, s, "control"]));
  return edges;
}

function pathFor(a: Node, b: Node) {
  // Trim the line so it starts/ends at the node edge, not the centre.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const x1 = a.x + ux * (a.r + 3);
  const y1 = a.y + uy * (a.r + 3);
  const x2 = b.x - ux * (b.r + 3);
  const y2 = b.y - uy * (b.r + 3);
  return {
    d: `M ${x1} ${y1} L ${x2} ${y2}`,
    mx: (x1 + x2) / 2,
    my: (y1 + y2) / 2,
  };
}

const TONE_STROKE = {
  signal: "var(--signal)",
  success: "var(--success)",
  danger: "var(--danger)",
  warning: "var(--warning)",
  neutral: "var(--foreground)",
};

function pick<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Translate a simulated event into graph motion. */
function motionFor(
  e: ActivityEvent,
  nodes: Node[],
): { pulse?: Omit<Pulse, "id">; ping?: Omit<Ping, "id"> } {
  const strategy = nodes[0].id;
  const idsOf = (role: AgentRole) =>
    nodes.filter((n) => n.role === role).map((n) => n.id);
  const has = (id: string) => nodes.some((n) => n.id === id);
  if (!has(e.agentId)) return {};
  const score = e.score !== undefined ? `${e.score}%` : "";
  switch (e.category) {
    case "discovery":
      if (e.action === "Thread discovered") {
        const to = pick(idsOf("intent"));
        return to
          ? {
              pulse: {
                from: e.agentId,
                to,
                label: "Opportunity discovered",
                tone: "signal",
              },
            }
          : {};
      }
      return { ping: { node: e.agentId, tone: "signal" } };
    case "analysis":
      if (e.action.startsWith("Intent")) {
        const to = pick(idsOf("relevance"));
        return to
          ? {
              pulse: {
                from: e.agentId,
                to,
                label: `Intent identified · ${score}`,
                tone: "signal",
              },
            }
          : {};
      }
      return {
        pulse: {
          from: e.agentId,
          to: strategy,
          label:
            e.status === "rejected" ? `Rejected · ${score}` : `${score} match`,
          tone: e.status === "rejected" ? "neutral" : "success",
        },
      };
    case "policy":
      if (e.action === "Agent paused")
        return { ping: { node: e.agentId, tone: "warning" } };
      return {
        pulse: {
          from: strategy,
          to: e.agentId,
          label: e.status === "blocked" ? "Blocked" : "Rule check · allowed",
          tone: e.status === "blocked" ? "danger" : "success",
        },
      };
    case "writing":
      if (e.action === "Draft generated")
        return {
          pulse: {
            from: strategy,
            to: e.agentId,
            label: "Generate contribution",
            tone: "signal",
          },
        };
      return {
        pulse: {
          from: e.agentId,
          to: REVIEW_ID,
          label: "Ready for review",
          tone: "warning",
        },
      };
    case "monitoring":
      return {
        pulse: {
          from: e.agentId,
          to: strategy,
          label: e.context,
          tone: "neutral",
        },
      };
    case "visibility":
      return {
        pulse: {
          from: e.agentId,
          to: strategy,
          label: e.action,
          tone: "success",
        },
      };
    case "strategy": {
      const to = pick(idsOf("discovery"));
      return to
        ? { pulse: { from: strategy, to, label: e.action, tone: "signal" } }
        : {};
    }
    case "error":
      return { ping: { node: e.agentId, tone: "danger" } };
    default:
      return {};
  }
}

export function AgentNetwork({
  onSelect,
  selectedId,
}: {
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}) {
  const agents = useSim((s) => s.agents);
  const paused = useSim((s) => s.paused);

  const nodes = useMemo(() => layout(agents), [agents]);
  const byId = useMemo(
    () => Object.fromEntries(nodes.map((n) => [n.id, n])),
    [nodes],
  );
  const edges = useMemo(() => staticEdges(nodes), [nodes]);

  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [pings, setPings] = useState<Ping[]>([]);

  // React to new events from the store; only events that arrive while the
  // graph is mounted produce motion, so the page opens calm.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const unsub = useSim.subscribe((s, prev) => {
      if (!s.lastEventId || s.lastEventId === prev.lastEventId) return;
      const e = s.events.find((x) => x.id === s.lastEventId);
      if (!e) return;
      const m = motionFor(e, nodes);
      if (m.pulse && byId[m.pulse.from] && byId[m.pulse.to]) {
        const id = `p_${e.id}`;
        setPulses((p) => [...p, { id, ...m.pulse! }]);
        timers.push(
          setTimeout(
            () => setPulses((p) => p.filter((x) => x.id !== id)),
            1900,
          ),
        );
      }
      if (m.ping) {
        const id = `g_${e.id}`;
        setPings((p) => [...p, { id, ...m.ping! }]);
        timers.push(
          setTimeout(() => setPings((p) => p.filter((x) => x.id !== id)), 900),
        );
      }
    });
    return () => {
      unsub();
      timers.forEach(clearTimeout);
    };
  }, [nodes, byId]);

  const activeEdges = new Set(pulses.map((p) => `${p.from}->${p.to}`));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label="Agent communication network"
      >
        {/* static edges */}
        {edges.map(([a, b, kind]) => {
          const p = pathFor(byId[a], byId[b]);
          const active = activeEdges.has(`${a}->${b}`);
          return (
            <path
              key={`${a}-${b}`}
              d={p.d}
              fill="none"
              stroke={active ? "var(--signal)" : "var(--foreground)"}
              strokeOpacity={active ? 0.6 : kind === "control" ? 0.09 : 0.2}
              strokeWidth={1}
              strokeDasharray={kind === "control" ? "2 5" : undefined}
              style={{ transition: "stroke-opacity 200ms, stroke 200ms" }}
            />
          );
        })}

        {/* pulses */}
        {pulses.map((p) => {
          const a = byId[p.from];
          const b = byId[p.to];
          if (!a || !b) return null;
          const path = pathFor(a, b);
          return (
            <g key={p.id}>
              <path
                d={path.d}
                fill="none"
                stroke={TONE_STROKE[p.tone]}
                strokeOpacity={0.35}
                strokeWidth={1}
              />
              <circle r={3} fill={TONE_STROKE[p.tone]}>
                <animateMotion
                  dur="0.9s"
                  fill="freeze"
                  path={path.d}
                  calcMode="spline"
                  keySplines="0.22 1 0.36 1"
                  keyTimes="0;1"
                />
                <animate
                  attributeName="opacity"
                  values="0;1;1;0"
                  keyTimes="0;0.1;0.8;1"
                  dur="1.4s"
                  fill="freeze"
                />
              </circle>
            </g>
          );
        })}

        {/* pings */}
        {pings.map((g) => {
          const n = byId[g.node];
          if (!n) return null;
          return (
            <circle
              key={g.id}
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill="none"
              stroke={TONE_STROKE[g.tone]}
              strokeWidth={1.5}
            >
              <animate
                attributeName="r"
                from={n.r}
                to={n.r + 14}
                dur="0.8s"
                fill="freeze"
              />
              <animate
                attributeName="opacity"
                from="0.8"
                to="0"
                dur="0.8s"
                fill="freeze"
              />
            </circle>
          );
        })}

        {/* nodes */}
        {nodes.map((n) => {
          const st = n.agent?.status;
          const active =
            st === "searching" ||
            st === "analyzing" ||
            st === "writing" ||
            st === "monitoring";
          const stroke =
            n.id === REVIEW_ID
              ? "var(--warning)"
              : st === "error"
                ? "var(--danger)"
                : st === "paused" || paused
                  ? "var(--fg-subtle)"
                  : active
                    ? "var(--signal)"
                    : "var(--border-strong)";
          const selected = selectedId === n.id;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x} ${n.y})`}
              className={cn("outline-none", n.agent && "cursor-pointer")}
              onClick={() => n.agent && onSelect?.(n.id)}
              role={n.agent ? "button" : undefined}
              tabIndex={n.agent ? 0 : undefined}
            >
              {selected && (
                <circle
                  r={n.r + 5}
                  fill="none"
                  stroke="var(--signal)"
                  strokeOpacity={0.5}
                  strokeWidth={1}
                />
              )}
              <circle
                r={n.r}
                fill="var(--surface-2)"
                stroke={stroke}
                strokeWidth={n.role === "strategy" ? 1.5 : 1}
                style={{ transition: "stroke 250ms" }}
              />
              {n.role === "strategy" ? (
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                  fill="var(--foreground)"
                >
                  S
                </text>
              ) : n.id === REVIEW_ID ? (
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                  fill="var(--warning)"
                >
                  ✓
                </text>
              ) : (
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                  fill="var(--muted-foreground)"
                >
                  {n.label.split("-")[1]}
                </text>
              )}
              <text
                y={n.r + 14}
                textAnchor="middle"
                fontSize={11}
                fontFamily="var(--font-mono)"
                fill={
                  st === "paused" || paused
                    ? "var(--fg-subtle)"
                    : "var(--foreground)"
                }
              >
                {n.label}
              </text>
              {(n.sub || n.role) && (
                <text
                  y={n.r + 26}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--fg-subtle)"
                >
                  {n.sub ?? ROLE_LABEL[n.role!]}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Edge labels rendered in HTML so they get real typography. */}
      <AnimatePresence>
        {pulses.map((p) => {
          const a = byId[p.from];
          const b = byId[p.to];
          if (!a || !b) return null;
          const { mx, my } = pathFor(a, b);
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded border border-border bg-popover px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm"
              style={{
                left: `${(mx / W) * 100}%`,
                top: `calc(${(my / H) * 100}% - 14px)`,
              }}
            >
              {p.label}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
