"use client";

import { Info } from "lucide-react";
import { SCORE_BREAKDOWN } from "@/lib/mock/discoverability";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { Skeleton } from "@/components/ui/skeleton";
import { blendScore, useAnalytics } from "@/lib/analytics/store";
import { signed } from "@/lib/format";
import { cn } from "@/lib/utils";

// The backend doesn't measure these yet (no opportunity or mention data), so they
// keep their static values. The other three rows come from the presence probes.
const STATIC_ROWS = new Set(["Topic Association", "Organic Mentions"]);

interface Row {
  label: string;
  value: number;
  delta: number;
  available: boolean;
}

export function ScoreBreakdown() {
  const connection = useAnalytics((s) => s.connection);
  const surfaces = useAnalytics((s) => s.surfaces);

  const rows: Row[] = SCORE_BREAKDOWN.map((b) => {
    if (STATIC_ROWS.has(b.label)) return { ...b, available: true };
    const s = surfaces.find((x) => x.label === b.label);
    return connection === "live" && s?.measured
      ? { label: b.label, value: s.value, delta: s.delta, available: true }
      : { label: b.label, value: 0, delta: 0, available: false };
  });
  const anyMeasured = rows.some((r) => r.available && !STATIC_ROWS.has(r.label));
  const blended = anyMeasured
    ? blendScore(rows.filter((r) => r.available))
    : null;

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="label-xs">Discoverability score</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="size-3 text-fg-subtle" />
          </TooltipTrigger>
          <TooltipContent className="max-w-56">
            Weighted blend of the five signals below, measured by Visibility-01
            every 15 minutes.
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="mt-1 flex h-10 items-baseline gap-2">
        {connection === "connecting" ? (
          <Skeleton className="h-9 w-24" />
        ) : blended ? (
          <>
            <AnimatedNumber
              value={blended.score}
              className="text-[40px] font-medium leading-none tracking-[-0.03em]"
            />
            <span className="text-[15px] text-muted-foreground">/ 100</span>
            <span
              className={cn(
                "ml-2 text-xs",
                blended.delta > 0
                  ? "text-success"
                  : blended.delta < 0
                    ? "text-danger"
                    : "text-fg-subtle",
              )}
            >
              {signed(blended.delta)} this week
            </span>
          </>
        ) : (
          <span className="self-center text-[13px] text-muted-foreground">
            {connection === "offline"
              ? "Backend unreachable"
              : "Not measured yet"}
          </span>
        )}
      </div>

      <ul className="mt-5 space-y-3">
        {rows.map((b) => (
          <li
            key={b.label}
            className="grid grid-cols-[minmax(0,1fr)_36px_40px] items-center gap-3 text-xs"
          >
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">{b.label}</span>
              </div>
              <div className="mt-1.5 h-[4px] w-full overflow-hidden rounded-[2px] bg-foreground/[0.06]">
                <div
                  className="h-full rounded-[2px] bg-foreground/70"
                  style={{ width: `${b.available ? b.value : 0}%` }}
                />
              </div>
            </div>
            <span
              className={cn(
                "justify-self-end font-mono tnum",
                b.available ? "text-foreground" : "text-fg-subtle",
              )}
            >
              {b.available ? b.value : "—"}
            </span>
            <span
              className={cn(
                "justify-self-end font-mono text-[11px] tnum",
                !b.available || b.delta === 0
                  ? "text-fg-subtle"
                  : b.delta > 0
                    ? "text-success"
                    : "text-danger",
              )}
            >
              {b.available ? signed(b.delta) : ""}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-[11px] leading-4 text-fg-subtle">
        Inception Score is an internal visibility metric and does not represent
        an official search-engine ranking.
      </p>
    </div>
  );
}
