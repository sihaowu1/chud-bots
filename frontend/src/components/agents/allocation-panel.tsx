"use client";

import { Rocket, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useSim } from "@/lib/store";
import {
  allocationFor,
  capacityFor,
  MAX_AGENTS,
  ROLE_LABEL,
  ROLE_ORDER,
} from "@/lib/mock/agents";
import { Panel, SectionHeader } from "@/components/shared/section";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { SwarmCells } from "@/components/dashboard/agents-deployed";
import { toast } from "@/components/shared/toast";
import { cn } from "@/lib/utils";

/** Role allocation and swarm controls. The count itself is set on the dashboard slider. */
export function AllocationPanel({ className }: { className?: string }) {
  const agentCount = useSim((s) => s.agentCount);
  const setAgentCount = useSim((s) => s.setAgentCount);
  const autoOptimize = useSim((s) => s.autoOptimize);
  const setAutoOptimize = useSim((s) => s.setAutoOptimize);
  const reallocate = useSim((s) => s.reallocate);
  const allocation = allocationFor(agentCount);
  const capacity = capacityFor(agentCount);

  return (
    <Panel className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <SectionHeader
          title="Allocation"
          subtitle={`${agentCount} of ${MAX_AGENTS} agents · ~${capacity.discussionsPerHour} discussions/hr`}
        />
        <div className="flex items-center gap-2">
          <Label
            htmlFor="auto-optimize"
            className="text-xs font-normal text-muted-foreground"
          >
            Optimize automatically
          </Label>
          <Switch
            id="auto-optimize"
            size="sm"
            checked={autoOptimize}
            onCheckedChange={setAutoOptimize}
          />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 px-5 py-4">
        <ul className="col-span-12 grid grid-cols-4 gap-x-6 gap-y-2 lg:col-span-8">
          {ROLE_ORDER.map((role) => (
            <li
              key={role}
              className="flex items-baseline justify-between gap-2 border-b border-border/60 pb-1.5 text-xs"
            >
              <span
                className={cn(
                  allocation[role] ? "text-muted-foreground" : "text-fg-subtle",
                )}
              >
                {ROLE_LABEL[role]}
              </span>
              <AnimatedNumber
                value={allocation[role]}
                duration={0.2}
                className={cn(
                  "font-mono",
                  allocation[role] ? "text-foreground" : "text-fg-subtle",
                )}
              />
            </li>
          ))}
        </ul>
        <div className="col-span-12 flex flex-col justify-between gap-3 lg:col-span-4 lg:items-end">
          <SwarmCells count={agentCount} />
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                reallocate();
                toast({
                  title: "Reallocation queued",
                  description: "Strategy-01 is rebalancing the swarm.",
                });
              }}
            >
              <Shuffle data-icon="inline-start" />
              Reallocate
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={agentCount >= MAX_AGENTS}
              onClick={() => setAgentCount(agentCount + 1)}
            >
              <Rocket data-icon="inline-start" />
              Deploy one more
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
