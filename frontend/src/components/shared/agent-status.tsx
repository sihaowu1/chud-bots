"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { AgentStatus } from "@/lib/types";
import type { SessionStatus } from "@/lib/sessions/types";
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

/** Real backend session status (`BrowserAgent["status"]`), a separate enum from the mock's `AgentStatus`. */
export const SESSION_STATUS_TONE: Record<SessionStatus, Tone> = {
  queued: "muted",
  running: "signal",
  done: "success",
  failed: "danger",
  stopped: "muted",
};

const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
  stopped: "Stopped",
};

const SESSION_STATUSES: SessionStatus[] = [
  "queued",
  "running",
  "done",
  "failed",
  "stopped",
];

function isSessionStatus(s: AgentStatus | SessionStatus): s is SessionStatus {
  return (SESSION_STATUSES as string[]).includes(s);
}

interface Props {
  status: AgentStatus | SessionStatus;
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

  if (isSessionStatus(rawStatus)) {
    const tone = SESSION_STATUS_TONE[rawStatus];
    return (
      <span
        className={cn("inline-flex items-center gap-1.5 text-xs", className)}
      >
        <StatusDot tone={tone} pulse={rawStatus === "running"} />
        {!dotOnly && (
          <span className={TONE_TEXT[tone]}>
            {SESSION_STATUS_LABEL[rawStatus]}
          </span>
        )}
      </span>
    );
  }

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
