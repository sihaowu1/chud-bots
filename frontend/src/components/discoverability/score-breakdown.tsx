"use client";

import { Info } from "lucide-react";
import {
  DISCOVERABILITY_SCORE,
  SCORE_BREAKDOWN,
} from "@/lib/mock/discoverability";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { signed } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ScoreBreakdown() {
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
      <div className="mt-1 flex items-baseline gap-2">
        <AnimatedNumber
          value={DISCOVERABILITY_SCORE}
          className="text-[40px] font-medium leading-none tracking-[-0.03em]"
        />
        <span className="text-[15px] text-muted-foreground">/ 100</span>
        <span className="ml-2 text-xs text-success">+5 this week</span>
      </div>

      <ul className="mt-5 space-y-3">
        {SCORE_BREAKDOWN.map((b) => (
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
                  style={{ width: `${b.value}%` }}
                />
              </div>
            </div>
            <span className="justify-self-end font-mono text-foreground tnum">
              {b.value}
            </span>
            <span
              className={cn(
                "justify-self-end font-mono text-[11px] tnum",
                b.delta > 0
                  ? "text-success"
                  : b.delta < 0
                    ? "text-danger"
                    : "text-fg-subtle",
              )}
            >
              {signed(b.delta)}
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
