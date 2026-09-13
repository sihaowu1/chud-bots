"use client";

import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { MonitorPlay } from "lucide-react";
import { useSessions, BACKEND } from "@/lib/sessions/store";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section";
import { EmptyState } from "@/components/shared/empty-state";
import {
  StatusDot,
  TONE_TEXT,
  type Tone,
} from "@/components/shared/status-dot";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SessionCard } from "@/components/activity/session-card";
import { LaunchPanel } from "@/components/activity/launch-panel";
import { SessionLog } from "@/components/activity/session-log";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { cn } from "@/lib/utils";

const CONN: Record<
  string,
  { label: string; tone: Tone; pulse?: boolean; hint: string }
> = {
  connecting: {
    label: "Connecting",
    tone: "warning",
    pulse: true,
    hint: `Looking for the backend at ${BACKEND}`,
  },
  live: {
    label: "Live",
    tone: "success",
    pulse: true,
    hint: "Streaming from the Inception backend. Viewers are Steel's live debug sessions.",
  },
  offline: {
    label: "Offline",
    tone: "danger",
    hint: "Backend not reachable. Start `uvicorn backend.main:app` to go live.",
  },
};

export default function ActivityPage() {
  const start = useSessions((s) => s.start);
  const connection = useSessions((s) => s.connection);
  const agents = useSessions((s) => s.agents);
  const max = useSessions((s) => s.max);
  const stop = useSessions((s) => s.stop);

  useEffect(() => start(), [start]);

  const running = agents.filter((a) => a.status === "running").length;
  const ordered = [...agents].sort((a, b) => rank(a.status) - rank(b.status));
  const c = CONN[connection];

  return (
    <div className="flex h-full min-h-0">
      <div className="scroll-quiet flex min-w-0 flex-1 flex-col overflow-y-auto [&>*]:shrink-0">
        <div className="px-6 pt-5">
          <PageHeader
            title="Activity"
            description="Watch each agent sign in and work — live browser sessions from the Inception backend"
            actions={
              <>
                <span className="text-xs text-muted-foreground">
                  <AnimatedNumber
                    value={running}
                    className="font-mono text-foreground"
                  />{" "}
                  / {max || "–"} sessions live
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs",
                        TONE_TEXT[c.tone],
                      )}
                    >
                      <StatusDot tone={c.tone} pulse={c.pulse} size="xs" />
                      {c.label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">{c.hint}</TooltipContent>
                </Tooltip>
              </>
            }
          />
        </div>

        <div className="px-6 pb-8 pt-5">
          {ordered.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface">
              <EmptyState
                icon={MonitorPlay}
                title={
                  connection === "offline"
                    ? "Backend offline"
                    : "No sessions yet"
                }
                description={
                  connection === "offline"
                    ? "Start the backend to see live sessions here."
                    : "Launch agents from the panel on the right. Each one gets a cloud browser you can watch here."
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              <AnimatePresence initial={false}>
                {ordered.map((a) => (
                  <SessionCard key={a.id} agent={a} onStop={stop} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <aside className="flex w-[320px] shrink-0 flex-col border-l border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <SectionHeader
            title="Launch agents"
            subtitle="Each agent gets its own cloud browser"
          />
        </div>
        <div className="px-5 py-4">
          <LaunchPanel />
        </div>
        <div className="border-y border-border px-5 py-3">
          <SectionHeader title="Session log" />
        </div>
        <SessionLog className="min-h-0 flex-1 py-1" />
      </aside>
    </div>
  );
}

function rank(s: string) {
  return s === "running" ? 0 : s === "queued" ? 1 : 2;
}
