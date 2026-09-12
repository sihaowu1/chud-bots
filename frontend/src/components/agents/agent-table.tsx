"use client";

import type { Agent } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/mock/agents";
import { AgentStatusBadge } from "@/components/shared/agent-status";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { cn } from "@/lib/utils";

const GRID =
  "grid-cols-[100px_84px_100px_minmax(0,1fr)_132px_60px_minmax(0,200px)]";

interface Props {
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
}

function completedLabel(a: Agent) {
  switch (a.role) {
    case "discovery":
      return (
        <>
          <AnimatedNumber
            value={a.stats.scanned}
            className="font-mono text-foreground"
          />{" "}
          <span className="text-fg-subtle">scanned</span>
          <span className="mx-1 text-fg-subtle">·</span>
          <AnimatedNumber
            value={a.stats.relevant}
            className="font-mono text-foreground"
          />{" "}
          <span className="text-fg-subtle">rel.</span>
        </>
      );
    default:
      return (
        <>
          <AnimatedNumber
            value={a.stats.completed}
            className="font-mono text-foreground"
          />{" "}
          <span className="text-fg-subtle">done</span>
        </>
      );
  }
}

export function AgentTable({ agents, selectedId, onSelect, onHover }: Props) {
  return (
    <div className="min-w-[900px]">
      <div
        className={cn(
          "grid items-center gap-3 border-b border-border px-6 py-1.5 label-xs",
          GRID,
        )}
      >
        <span>Agent</span>
        <span>Role</span>
        <span>Status</span>
        <span className="whitespace-nowrap">Current task</span>
        <span>Completed</span>
        <span className="justify-self-end">Quality</span>
        <span>Next</span>
      </div>
      <div className="divide-y divide-border/60">
        {agents.map((a) => {
          const selected = a.id === selectedId;
          const inactive = a.status === "paused" || a.status === "error";
          return (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(a.id)}
              onKeyDown={(e) =>
                (e.key === "Enter" || e.key === " ") &&
                (e.preventDefault(), onSelect(a.id))
              }
              onMouseEnter={() => onHover?.(a.id)}
              onMouseLeave={() => onHover?.(null)}
              className={cn(
                "relative grid h-10 cursor-pointer items-center gap-3 px-6 text-xs outline-none transition-colors duration-150",
                GRID,
                selected
                  ? "bg-signal/[0.08]"
                  : "hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.03]",
              )}
            >
              {selected && (
                <span
                  className="absolute inset-y-0 left-0 w-0.5 bg-signal"
                  aria-hidden
                />
              )}
              <span className="font-mono text-foreground">{a.name}</span>
              <span className="text-muted-foreground">
                {ROLE_LABEL[a.role]}
              </span>
              <AgentStatusBadge status={a.status} />
              <span
                className={cn(
                  "truncate",
                  inactive ? "text-fg-subtle" : "text-muted-foreground",
                )}
              >
                {a.currentTask ?? <span className="text-fg-subtle">—</span>}
              </span>
              <span className="whitespace-nowrap text-muted-foreground tnum">
                {completedLabel(a)}
              </span>
              <span className="justify-self-end font-mono text-foreground tnum">
                {a.stats.quality}%
              </span>
              <span className="truncate text-muted-foreground">
                <span className="text-fg-subtle">Next: </span>
                {a.nextTask}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
