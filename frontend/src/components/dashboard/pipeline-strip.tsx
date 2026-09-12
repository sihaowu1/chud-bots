"use client";

import { ChevronRight } from "lucide-react";
import { useSim } from "@/lib/store";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The system loop — understand → discover → analyze → engage → monitor → learn —
 * rendered as the campaign's performance summary, so the workflow is part of
 * the data rather than a marketing graphic.
 */
export function PipelineStrip({ className }: { className?: string }) {
  const hydrated = useSim((s) => s.hydrated);
  const c = useSim((s) => s.counters);
  const campaign = useSim((s) => s.campaign);

  const stages: { stage: string; value: React.ReactNode; sub: string }[] = [
    {
      stage: "Understand",
      value: <span>1 campaign</span>,
      sub: `${campaign.searchIntent.length} target queries`,
    },
    {
      stage: "Discover",
      value: <AnimatedNumber value={c.scanned} />,
      sub: "discussions scanned",
    },
    {
      stage: "Analyze",
      value: <AnimatedNumber value={c.opportunities} />,
      sub: `relevant · ${((c.opportunities / Math.max(1, c.scanned)) * 100).toFixed(1)}% pass`,
    },
    {
      stage: "Engage",
      value: <AnimatedNumber value={c.posted} />,
      sub: `posted · ${c.inReview} in review`,
    },
    {
      stage: "Monitor",
      value: (
        <AnimatedNumber value={c.replies} format={(n) => `+${Math.round(n)}`} />
      ),
      sub: `replies · ${c.mentions} mentions`,
    },
    {
      stage: "Learn",
      value: <AnimatedNumber value={c.strategyUpdates} />,
      sub: "strategy updates",
    },
  ];

  return (
    <div className={cn("grid grid-cols-6 border-y border-border", className)}>
      {stages.map((s, i) => (
        <div
          key={s.stage}
          className="relative flex items-start gap-3 py-3 pr-4 first:pl-0 [&:not(:first-child)]:pl-4"
        >
          {i > 0 && (
            <ChevronRight
              className="absolute -left-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle/60"
              strokeWidth={2}
            />
          )}
          <div className="min-w-0">
            <div className="label-xs">{s.stage}</div>
            {hydrated ? (
              <>
                <div className="mt-1 text-[15px] font-medium leading-5 tracking-[-0.01em] tnum">
                  {s.value}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {s.sub}
                </div>
              </>
            ) : (
              <>
                <Skeleton className="mt-1.5 h-4 w-16" />
                <Skeleton className="mt-1.5 h-3 w-24" />
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
