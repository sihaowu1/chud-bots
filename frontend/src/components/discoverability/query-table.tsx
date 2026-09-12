"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { QUERY_PRESENCE } from "@/lib/mock/discoverability";
import { BackendState } from "@/components/analytics/backend-state";
import { hasMeasurements, useAnalytics } from "@/lib/analytics/store";

// Mention counts aren't produced by the backend yet, so they stay static; every
// other column comes from the presence probes.
const STATIC_MENTIONS = new Map(QUERY_PRESENCE.map((q) => [q.query, q.mentions]));
import type { QueryPresence } from "@/lib/types";
import { StatusDot, type Tone } from "@/components/shared/status-dot";
import { cn } from "@/lib/utils";

const GRID = "grid-cols-[minmax(0,1fr)_130px_130px_150px_110px_80px]";

function Presence({
  value,
}: {
  value: QueryPresence["reddit"] | QueryPresence["aiAnswer"];
}) {
  const map: Record<string, { label: string; tone: Tone }> = {
    detected: { label: "Detected", tone: "success" },
    partial: { label: "Partial", tone: "warning" },
    none: { label: "Not detected", tone: "muted" },
  };
  const m = map[value];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        value === "none" ? "text-fg-subtle" : "text-foreground",
      )}
    >
      <StatusDot tone={m.tone} size="xs" />
      {m.label}
    </span>
  );
}

function SearchLevel({ value }: { value: QueryPresence["search"] }) {
  const n = { high: 3, medium: 2, low: 1, none: 0 }[value];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 capitalize",
        n === 0 ? "text-fg-subtle" : "text-foreground",
      )}
    >
      <span className="flex items-end gap-px">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-[1px]",
              i <= n ? "bg-foreground/70" : "bg-foreground/15",
            )}
            style={{ height: 4 + i * 3 }}
          />
        ))}
      </span>
      {value === "none" ? "None" : value}
    </span>
  );
}

function Trend({
  trend,
  delta,
}: {
  trend: QueryPresence["trend"];
  delta: number;
}) {
  const Icon =
    trend === "up"
      ? ArrowUpRight
      : trend === "down"
        ? ArrowDownRight
        : ArrowRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono tnum",
        trend === "up"
          ? "text-success"
          : trend === "down"
            ? "text-danger"
            : "text-fg-subtle",
      )}
    >
      <Icon className="size-3" />
      {delta === 0 ? "0" : `${delta > 0 ? "+" : ""}${delta}`}
    </span>
  );
}

export function QueryTable() {
  const connection = useAnalytics((s) => s.connection);
  const rows = useAnalytics((s) => s.queries);
  const series = useAnalytics((s) => s.series);

  return (
    <div className="min-w-[860px]">
      <div
        className={cn(
          "grid items-center gap-4 border-b border-border px-5 py-1.5 label-xs",
          GRID,
        )}
      >
        <span>Query</span>
        <span>Reddit presence</span>
        <span>Search presence</span>
        <span>AI answer presence</span>
        <span className="justify-self-end">Mentions</span>
        <span className="justify-self-end">7d trend</span>
      </div>
      <BackendState
        connection={connection}
        empty={rows.length === 0 || !hasMeasurements(series)}
        height={180}
      >
        <div className="divide-y divide-border/60">
          {rows.map((q) => (
            <div
              key={q.query}
              className={cn(
                "grid h-10 items-center gap-4 px-5 text-xs transition-colors hover:bg-foreground/[0.03]",
                GRID,
              )}
            >
              <span className="truncate font-mono text-foreground">
                “{q.query}”
              </span>
              <Presence value={q.reddit} />
              <SearchLevel value={q.search} />
              <Presence value={q.aiAnswer} />
              <span className="justify-self-end font-mono text-foreground tnum">
                {STATIC_MENTIONS.get(q.query) ?? "—"}
              </span>
              <span className="justify-self-end">
                <Trend trend={q.trend} delta={q.delta7d} />
              </span>
            </div>
          ))}
        </div>
      </BackendState>
    </div>
  );
}
