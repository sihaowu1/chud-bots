"use client";

import type { LogRow } from "./types";
import { Field } from "@/components/shared/section";
import { AgentStatusBadge } from "@/components/shared/agent-status";
import { clock } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Shows what's actually available for a log line: persona, level, message,
 * timestamp, and — when the line ties back to a live agent — that agent's
 * status, target, query and session link. */
export function ActivityDetail({
  event,
  layout = "inline",
}: {
  event: LogRow;
  layout?: "inline" | "panel";
}) {
  const agent = event.agent;

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
          {event.persona && (
            <Field label="Agent">
              <span className="font-mono text-xs">{event.persona}</span>
              {event.level !== undefined && (
                <span className="ml-2 text-xs text-muted-foreground">
                  Level {event.level}
                </span>
              )}
            </Field>
          )}
          <Field label="Message">
            <p className={cn(event.error ? "text-danger" : "text-muted-foreground")}>
              {event.msg}
            </p>
          </Field>
          {agent?.query && <Field label="Query">“{agent.query}”</Field>}
          {agent?.url && (
            <Field label="URL">
              <span className="break-all font-mono text-xs text-muted-foreground">
                {agent.url}
              </span>
            </Field>
          )}
        </div>
        <div
          className={cn(
            layout === "inline" ? "" : "border-t border-border pt-4",
          )}
        >
          <div className="divide-y divide-border">
            <Field label="Time" inline>
              <span className="font-mono">{clock(event.ts)}</span>
            </Field>
            {agent && (
              <Field label="Agent status" inline>
                <AgentStatusBadge status={agent.status} />
              </Field>
            )}
            {agent?.target && (
              <Field label="Target" inline>
                <span className="truncate font-mono text-xs">
                  {agent.target}
                </span>
              </Field>
            )}
            {agent?.session?.viewer_url && (
              <Field label="Session" inline>
                <a
                  href={agent.session.viewer_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-signal hover:underline"
                >
                  Open in Steel
                </a>
              </Field>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
