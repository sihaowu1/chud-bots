"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSim } from "@/lib/store";
import {
  allocationFor,
  capacityFor,
  MAX_AGENTS,
  ROLE_LABEL,
  ROLE_ORDER,
  STATUS_LABEL,
} from "@/lib/mock/agents";
import { Panel, SectionHeader } from "@/components/shared/section";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { toast } from "@/components/shared/toast";
import { cn } from "@/lib/utils";

/** One cell per deployed agent, grouped by role. Shared by the dashboard and the Agents page. */
export function SwarmCells({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  const agents = useSim((s) => s.agents);
  const paused = useSim((s) => s.paused);
  const allocation = allocationFor(count);
  return (
    <div
      className={cn("flex h-4 items-end gap-2", className)}
      aria-label="Agent allocation"
    >
      {ROLE_ORDER.map((role) => {
        const n = allocation[role];
        if (!n) return null;
        return (
          <div key={role} className="flex items-end gap-[3px]">
            <AnimatePresence initial={false}>
              {Array.from({ length: n }).map((_, i) => {
                const agent = agents.filter((a) => a.role === role)[i];
                const st = agent?.status;
                return (
                  <Tooltip key={`${role}-${i}`}>
                    <TooltipTrigger asChild>
                      <motion.span
                        initial={{ scaleY: 0, opacity: 0 }}
                        animate={{ scaleY: 1, opacity: 1 }}
                        exit={{ scaleY: 0, opacity: 0 }}
                        transition={{
                          duration: 0.18,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        style={{ originY: 1 }}
                        className={cn(
                          "block h-4 w-2 rounded-[2px]",
                          paused || st === "paused"
                            ? "bg-foreground/20"
                            : st === "error"
                              ? "bg-danger"
                              : st === "idle" || !st
                                ? "bg-foreground/40"
                                : "bg-foreground/85",
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      {agent
                        ? `${agent.name} · ${STATUS_LABEL[agent.status]}`
                        : `${ROLE_LABEL[role]} · deploying`}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/** Dashboard control: how many agents, and what that buys. Allocation detail lives on the Agents page. */
export function AgentsDeployed({ className }: { className?: string }) {
  const agentCount = useSim((s) => s.agentCount);
  const setAgentCount = useSim((s) => s.setAgentCount);
  const agents = useSim((s) => s.agents);
  const paused = useSim((s) => s.paused);
  const setPaused = useSim((s) => s.setPaused);

  // Local value while dragging so the estimate updates on every pixel; commit on release.
  const [draft, setDraft] = useState<number | null>(null);
  const count = draft ?? agentCount;
  const capacity = capacityFor(count);
  const active = agents.filter(
    (a) => a.status !== "paused" && a.status !== "error",
  ).length;

  return (
    <Panel className={cn("flex flex-col", className)}>
      <div className="px-5 pt-4">
        <SectionHeader
          size="lg"
          title="Agents Deployed"
          actions={
            <Button asChild size="sm" variant="ghost">
              <Link href="/agents">
                Manage
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          }
        />
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="flex items-baseline gap-2">
          <AnimatedNumber
            value={count}
            className="text-[28px] font-medium leading-none tracking-[-0.02em]"
            duration={0.25}
          />
          <span className="text-[13px] text-muted-foreground">
            {paused ? "paused" : `active · ${active} working`}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="font-mono text-[11px] text-fg-subtle tnum">1</span>
          <Slider
            min={1}
            max={MAX_AGENTS}
            step={1}
            value={[count]}
            onValueChange={([v]) => setDraft(v)}
            onValueCommit={([v]) => {
              setDraft(null);
              setAgentCount(v);
            }}
            aria-label="Number of agents"
            className="[&_[data-slot=slider-range]]:bg-foreground [&_[data-slot=slider-thumb]]:border-foreground/60 [&_[data-slot=slider-track]]:bg-foreground/15"
          />
          <span className="font-mono text-[11px] text-fg-subtle tnum">
            {MAX_AGENTS}
          </span>
        </div>

        <dl className="mt-3 flex items-baseline gap-5 text-xs">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-fg-subtle">Estimated</dt>
            <dd className="text-foreground">
              <AnimatedNumber
                value={capacity.discussionsPerHour}
                duration={0.3}
              />{" "}
              <span className="text-muted-foreground">discussions/hr</span>
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dd className="text-foreground">
              <AnimatedNumber
                value={capacity.opportunitiesPerHour}
                duration={0.3}
              />{" "}
              <span className="text-muted-foreground">
                strong opportunities/hr
              </span>
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex items-center justify-between gap-4">
          <SwarmCells count={count} />
          {paused ? (
            <Button size="sm" onClick={() => setPaused(false)}>
              <Play data-icon="inline-start" />
              Resume
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPaused(true);
                toast({
                  title: "All agents paused",
                  action: { label: "Undo", onClick: () => setPaused(false) },
                });
              }}
            >
              <Pause data-icon="inline-start" />
              Pause
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
