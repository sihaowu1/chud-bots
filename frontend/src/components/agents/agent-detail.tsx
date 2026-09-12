"use client";

import { useMemo } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Agent } from "@/lib/types";
import { useSim } from "@/lib/store";
import { EventStatusBadge } from "@/components/shared/event-status";
import { Field } from "@/components/shared/section";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { toast } from "@/components/shared/toast";
import { clock } from "@/lib/format";
import { cn } from "@/lib/utils";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="label-xs">{label}</div>
      <AnimatedNumber
        value={value}
        className="mt-1 block text-[20px] font-medium leading-6 tracking-[-0.01em]"
      />
    </div>
  );
}

export function AgentDetail({ agent: a }: { agent: Agent }) {
  const events = useSim((s) => s.events);
  const pauseAgent = useSim((s) => s.pauseAgent);
  const resumeAgent = useSim((s) => s.resumeAgent);
  const recent = useMemo(
    () => events.filter((e) => e.agentId === a.id).slice(0, 8),
    [events, a.id],
  );
  const totalRejected = a.rejections.reduce((n, r) => n + r.count, 0);
  const maxRejected = Math.max(1, ...a.rejections.map((r) => r.count));
  const paused = a.status === "paused";

  return (
    <div className="flex h-full flex-col">
      <div className="scroll-quiet min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <Field label="Current objective">
          <p className="text-muted-foreground">{a.objective}</p>
        </Field>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Field
            label={a.role === "discovery" ? "Current search" : "Current task"}
          >
            <span className={cn(a.role === "discovery" && "font-mono text-xs")}>
              {a.currentTask ?? <span className="text-fg-subtle">Idle</span>}
            </span>
          </Field>
          <Field label="Next task">
            <span className="text-muted-foreground">{a.nextTask}</span>
          </Field>
        </div>

        <section className="grid grid-cols-3 gap-4 border-y border-border py-4">
          {a.role === "discovery" ? (
            <>
              <Stat label="Threads scanned" value={a.stats.scanned} />
              <Stat label="Relevant" value={a.stats.relevant} />
              <Stat label="Rejected" value={a.stats.rejected} />
            </>
          ) : (
            <>
              <Stat label="Completed" value={a.stats.completed} />
              <Stat label="Passed" value={a.stats.relevant} />
              <Stat label="Quality" value={a.stats.quality} />
            </>
          )}
        </section>

        {a.rejections.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between">
              <div className="label-xs">Rejection breakdown</div>
              <span className="font-mono text-[11px] text-fg-subtle tnum">
                {totalRejected} total
              </span>
            </div>
            <ul className="mt-2.5 space-y-2">
              {[...a.rejections]
                .sort((x, y) => y.count - x.count)
                .map((r) => (
                  <li
                    key={r.reason}
                    className="grid grid-cols-[minmax(0,1fr)_32px] items-center gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-muted-foreground">
                          {r.reason}
                        </span>
                      </div>
                      <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-foreground/[0.08]">
                        <div
                          className="h-full rounded-full bg-foreground/50 transition-[width] duration-300"
                          style={{ width: `${(r.count / maxRejected) * 100}%` }}
                        />
                      </div>
                    </div>
                    <AnimatedNumber
                      value={r.count}
                      className="justify-self-end font-mono text-foreground"
                    />
                  </li>
                ))}
            </ul>
          </section>
        )}

        <section>
          <div className="label-xs">Recent activity</div>
          {recent.length === 0 ? (
            <p className="mt-2 text-xs text-fg-subtle">
              No activity recorded yet.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border/60">
              {recent.map((e) => (
                <li
                  key={e.id}
                  className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-baseline gap-3 py-1.5 text-xs"
                >
                  <span className="font-mono text-fg-subtle tnum">
                    {clock(e.ts)}
                  </span>
                  <span className="truncate">
                    <span className="text-foreground">{e.action}</span>
                    <span className="mx-1.5 text-fg-subtle">·</span>
                    <span className="text-muted-foreground">{e.context}</span>
                  </span>
                  <EventStatusBadge status={e.status} className="text-[11px]" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <span className="text-[11px] text-fg-subtle">
          Last active {clock(a.lastActiveAt)}
        </span>
        {paused ? (
          <Button size="sm" onClick={() => resumeAgent(a.id)}>
            <Play data-icon="inline-start" />
            Resume agent
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              pauseAgent(a.id);
              toast({
                title: `${a.name} paused`,
                description: "Its queued tasks will wait until resumed.",
                action: { label: "Undo", onClick: () => resumeAgent(a.id) },
              });
            }}
          >
            <Pause data-icon="inline-start" />
            Pause agent
          </Button>
        )}
      </div>
    </div>
  );
}
