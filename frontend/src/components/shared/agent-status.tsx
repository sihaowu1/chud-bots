"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { AgentStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/mock/agents";
import { StatusDot, TONE_TEXT, type Tone } from "./status-dot";
import { useSim } from "@/lib/store";
import { cn } from "@/lib/utils";

export const AGENT_STATUS_TONE: Record<AgentStatus, Tone> = {
  idle: "muted",
  searching: "signal",
  analyzing: "signal",
  writing: "signal",
  waiting: "warning",
  monitoring: "success",
  paused: "muted",
  error: "danger",
};

const ACTIVE: AgentStatus[] = ["searching", "analyzing", "writing"];

interface Props {
  status: AgentStatus;
  className?: string;
  /** Hide the label, show only the dot. */
  dotOnly?: boolean;
}

/** Animated status label: the text slides when the state changes. */
export function AgentStatusBadge({
  status: rawStatus,
  className,
  dotOnly,
}: Props) {
  const globalPause = useSim((s) => s.paused);
  const status: AgentStatus =
    globalPause && rawStatus !== "error" ? "paused" : rawStatus;
  const tone = AGENT_STATUS_TONE[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <StatusDot tone={tone} pulse={ACTIVE.includes(status)} />
      {!dotOnly && (
        <span className="relative inline-grid overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={status}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "col-start-1 row-start-1",
                status === "paused" || status === "idle"
                  ? "text-muted-foreground"
                  : TONE_TEXT[tone],
              )}
            >
              {STATUS_LABEL[status]}
            </motion.span>
          </AnimatePresence>
        </span>
      )}
    </span>
  );
}
