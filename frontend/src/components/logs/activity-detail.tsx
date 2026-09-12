"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ActivityEvent } from "@/lib/types";
import { useSim } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/mock/agents";
import { Field } from "@/components/shared/section";
import { Score } from "@/components/shared/score";
import { EventStatusBadge } from "@/components/shared/event-status";
import { clock } from "@/lib/format";
import { cn } from "@/lib/utils";

const RISK_TONE = {
  low: "text-success",
  medium: "text-warning",
  high: "text-danger",
} as const;

/**
 * Concise decision summary for an event. Deliberately shows conclusions and
 * evidence, not a transcript of the agent's reasoning.
 */
export function ActivityDetail({
  event,
  layout = "inline",
}: {
  event: ActivityEvent;
  layout?: "inline" | "panel";
}) {
  const agent = useSim((s) => s.agents.find((a) => a.id === event.agentId));
  const d = event.detail;
  const opp = useSim((s) =>
    d.opportunityId
      ? s.opportunities.find((o) => o.id === d.opportunityId)
      : undefined,
  );

  const grid =
    layout === "inline"
      ? "grid grid-cols-[1fr_1fr] gap-x-8 gap-y-4"
      : "space-y-5";

  return (
    <div
      className={cn(
        layout === "inline"
          ? "px-4 pb-4 pt-3 pl-[calc(16px+64px+12px)]"
          : "px-5 py-4",
      )}
    >
      <div className={grid}>
        <div className="space-y-4">
          <Field label="Agent">
            <span className="font-mono text-xs">
              {agent?.name ?? event.agentId}
            </span>
            {agent && (
              <span className="ml-2 text-xs text-muted-foreground">
                {ROLE_LABEL[agent.role]}
              </span>
            )}
          </Field>
          <Field label="Task">{d.task}</Field>
          <Field label="Reasoning summary">
            <p className="text-muted-foreground">“{d.summary}”</p>
          </Field>
          {d.evidence && d.evidence.length > 0 && (
            <Field label="Evidence">
              <ul className="space-y-1">
                {d.evidence.map((e) => (
                  <li
                    key={e}
                    className="flex gap-2 text-xs text-muted-foreground"
                  >
                    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-fg-subtle" />
                    {e}
                  </li>
                ))}
              </ul>
            </Field>
          )}
        </div>
        <div
          className={cn(
            layout === "inline" ? "" : "border-t border-border pt-4",
          )}
        >
          <div className="divide-y divide-border">
            <Field label="Status" inline>
              <EventStatusBadge status={event.status} />
            </Field>
            <Field label="Time" inline>
              <span className="font-mono">{clock(event.ts)}</span>
            </Field>
            {(d.relevance !== undefined || event.score !== undefined) && (
              <Field
                label={
                  event.category === "analysis" &&
                  event.action.startsWith("Intent")
                    ? "Confidence"
                    : "Relevance"
                }
                inline
              >
                <Score value={d.relevance ?? event.score!} bar />
              </Field>
            )}
            {d.risk && (
              <Field label="Risk" inline>
                <span className={cn("capitalize", RISK_TONE[d.risk])}>
                  {d.risk}
                </span>
              </Field>
            )}
            {d.metrics?.map((m) => (
              <Field key={m.label} label={m.label} inline>
                <span className="font-mono">{m.value}</span>
              </Field>
            ))}
            {opp && (
              <Field label="Opportunity" inline>
                <Link
                  href={`/opportunities?id=${opp.id}`}
                  className="inline-flex items-center gap-1 text-signal hover:underline"
                >
                  {opp.community}
                  <ArrowUpRight className="size-3" />
                </Link>
              </Field>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
