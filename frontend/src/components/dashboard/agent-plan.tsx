"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, Pause, Pencil, Play, X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSim } from "@/lib/store";
import type { PlannedTask, PlanTiming } from "@/lib/types";
import { Panel, SectionHeader } from "@/components/shared/section";
import { AgentName } from "@/components/shared/agent-name";
import { toast } from "@/components/shared/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function timingLabel(t: PlanTiming) {
  if (t.kind === "now") return "Now";
  if (t.kind === "later") return "Later";
  return `+${t.minutes} min`;
}

function timingOrder(t: PlanTiming) {
  if (t.kind === "now") return -1;
  if (t.kind === "later") return 10_000;
  return t.minutes;
}

const STATUS_NOTE: Partial<Record<PlannedTask["status"], string>> = {
  paused: "Paused",
  "awaiting-approval": "Needs approval",
  cancelled: "Cancelled",
};

export function AgentPlan({ className }: { className?: string }) {
  const hydrated = useSim((s) => s.hydrated);
  const plan = useSim((s) => s.plan);
  const paused = useSim((s) => s.paused);
  const updateStatus = useSim((s) => s.updatePlanStatus);
  const delay = useSim((s) => s.delayPlan);
  const remove = useSim((s) => s.removePlan);
  const restore = useSim((s) => s.restorePlan);

  const sorted = useMemo(
    () =>
      [...plan].sort((a, b) => timingOrder(a.timing) - timingOrder(b.timing)),
    [plan],
  );

  const cancel = (task: PlannedTask) => {
    const index = plan.findIndex((p) => p.id === task.id);
    remove(task.id);
    toast({
      title: "Task cancelled",
      description: `${task.title} will not run.`,
      action: { label: "Undo", onClick: () => restore(task, index) },
    });
  };

  return (
    <Panel className={cn("flex flex-col", className)}>
      <div className="border-b border-border px-5 py-4">
        <SectionHeader
          size="lg"
          title="Agent Plan"
          subtitle="Upcoming autonomous actions"
        />
      </div>

      <ol className="scroll-quiet relative min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {!hydrated &&
          Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex gap-4 pb-6">
              <Skeleton className="h-3 w-12" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </li>
          ))}

        <AnimatePresence initial={false}>
          {sorted.map((task, i) => {
            const isNow = task.timing.kind === "now";
            const last = i === sorted.length - 1;
            const inactive =
              task.status === "cancelled" || task.status === "paused" || paused;
            return (
              <motion.li
                key={task.id}
                layout="position"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="group relative grid grid-cols-[56px_16px_minmax(0,1fr)] gap-x-2"
              >
                {/* timing */}
                <div
                  className={cn(
                    "pt-px font-mono text-[11px] uppercase tracking-[0.04em] tnum",
                    isNow ? "text-signal" : "text-fg-subtle",
                  )}
                >
                  {timingLabel(task.timing)}
                </div>

                {/* rail */}
                <div className="relative flex justify-center">
                  <span
                    className={cn(
                      "mt-[5px] size-[7px] shrink-0 rounded-full",
                      isNow && !inactive
                        ? "bg-signal animate-pulse-soft"
                        : task.status === "awaiting-approval"
                          ? "bg-warning"
                          : inactive
                            ? "bg-foreground/20"
                            : "bg-foreground/50",
                    )}
                  />
                  {!last && (
                    <span
                      className="absolute top-[14px] bottom-0 w-px bg-border-strong"
                      aria-hidden
                    />
                  )}
                </div>

                {/* content */}
                <div
                  className={cn(
                    "relative -mt-1 mb-1 rounded-md px-2 py-1 transition-colors duration-150 group-hover:bg-foreground/[0.03]",
                    last ? "pb-1" : "pb-5",
                    inactive && "opacity-60",
                  )}
                >
                  <div className="flex items-baseline gap-2">
                    {task.actorIsGroup ? (
                      <span className="text-xs font-medium text-foreground">
                        {task.actor}
                      </span>
                    ) : (
                      <AgentName id={task.actor} />
                    )}
                    {STATUS_NOTE[task.status] && (
                      <span
                        className={cn(
                          "text-[11px]",
                          task.status === "awaiting-approval"
                            ? "text-warning"
                            : "text-fg-subtle",
                        )}
                      >
                        {STATUS_NOTE[task.status]}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[13px] text-foreground">
                    {task.title}
                  </div>
                  {Array.isArray(task.detail) ? (
                    <div className="mt-0.5 flex flex-wrap gap-x-2.5 text-xs text-muted-foreground">
                      {task.detail.map((d) => (
                        <span key={d} className="font-mono">
                          {d}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {task.detail}
                    </div>
                  )}

                  {/* actions: hidden until hover/focus */}
                  <div className="absolute right-1 top-0.5 flex items-center gap-px rounded-md border border-border bg-popover p-0.5 opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                    {task.status === "awaiting-approval" && (
                      <PlanAction
                        label="Approve"
                        icon={Check}
                        tone="success"
                        onClick={() => updateStatus(task.id, "scheduled")}
                      />
                    )}
                    <PlanAction
                      label="Edit"
                      icon={Pencil}
                      onClick={() =>
                        toast({
                          title: "Edit task",
                          description: "Task editing opens the plan editor.",
                        })
                      }
                    />
                    <PlanAction
                      label="Delay 15 min"
                      icon={Clock}
                      onClick={() => delay(task.id, 15)}
                    />
                    {task.status === "paused" ? (
                      <PlanAction
                        label="Resume"
                        icon={Play}
                        onClick={() => updateStatus(task.id, "scheduled")}
                      />
                    ) : (
                      <PlanAction
                        label="Pause"
                        icon={Pause}
                        onClick={() => updateStatus(task.id, "paused")}
                      />
                    )}
                    <PlanAction
                      label="Cancel"
                      icon={X}
                      tone="danger"
                      onClick={() => cancel(task)}
                    />
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </Panel>
  );
}

function PlanAction({
  label,
  icon: Icon,
  onClick,
  tone,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  tone?: "success" | "danger";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          className={cn(
            "rounded p-1 text-fg-subtle transition-colors hover:bg-foreground/[0.06]",
            tone === "success"
              ? "hover:text-success"
              : tone === "danger"
                ? "hover:text-danger"
                : "hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
