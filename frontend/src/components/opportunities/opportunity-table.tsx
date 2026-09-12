"use client";

import { motion } from "framer-motion";
import type { Opportunity, OpportunityStatus } from "@/lib/types";
import { Score } from "@/components/shared/score";
import { RelativeTime } from "@/components/shared/relative-time";
import {
  StatusDot,
  TONE_TEXT,
  type Tone,
} from "@/components/shared/status-dot";
import { cn } from "@/lib/utils";

export const OPP_STATUS: Record<
  OpportunityStatus,
  { label: string; tone: Tone }
> = {
  new: { label: "New", tone: "signal" },
  review: { label: "In review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  posted: { label: "Posted", tone: "success" },
  monitoring: { label: "Monitoring", tone: "neutral" },
  skipped: { label: "Skipped", tone: "muted" },
};

const ACTIVITY_BARS: Record<Opportunity["activity"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function OpportunityStatusBadge({
  status,
}: {
  status: OpportunityStatus;
}) {
  const m = OPP_STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        TONE_TEXT[m.tone],
      )}
    >
      <StatusDot tone={m.tone} size="xs" />
      {m.label}
    </span>
  );
}

export function ActivityMeter({ level }: { level: Opportunity["activity"] }) {
  const n = ACTIVITY_BARS[level];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs capitalize text-muted-foreground"
      title={`${level} activity`}
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
      {level}
    </span>
  );
}

const GRID = "grid-cols-[140px_minmax(0,1fr)_130px_60px_80px_56px_88px]";

interface Props {
  opportunities: Opportunity[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function OpportunityTable({
  opportunities,
  selectedId,
  onSelect,
}: Props) {
  return (
    <div className="min-w-[820px]">
      <div
        className={cn(
          "grid items-center gap-3 border-b border-border px-6 py-1.5 label-xs",
          GRID,
        )}
      >
        <span>Source</span>
        <span>Discussion</span>
        <span>Intent</span>
        <span className="justify-self-end">Relevance</span>
        <span>Activity</span>
        <span>Age</span>
        <span>Status</span>
      </div>
      <div className="divide-y divide-border/60">
        {opportunities.map((o) => {
          const selected = o.id === selectedId;
          return (
            <motion.div
              key={o.id}
              layout="position"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(o.id)}
              onKeyDown={(e) =>
                (e.key === "Enter" || e.key === " ") &&
                (e.preventDefault(), onSelect(o.id))
              }
              className={cn(
                "relative grid h-11 cursor-pointer items-center gap-3 px-6 text-xs outline-none transition-colors duration-150",
                GRID,
                selected
                  ? "bg-signal/[0.08]"
                  : "hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.03]",
              )}
            >
              {selected && (
                <span
                  className="absolute inset-y-0 left-0 w-0.5 bg-signal"
                  aria-hidden
                />
              )}
              <span className="truncate">
                <span className="text-muted-foreground">Reddit</span>
                <span className="mx-1 text-fg-subtle">·</span>
                <span className="font-mono text-foreground">{o.community}</span>
              </span>
              <span className="truncate text-[13px] text-foreground">
                “{o.title}”
              </span>
              <span className="truncate text-muted-foreground">{o.intent}</span>
              <span className="justify-self-end">
                <Score value={o.relevance} />
              </span>
              <ActivityMeter level={o.activity} />
              <RelativeTime
                ts={o.createdAt}
                className="text-muted-foreground"
              />
              <OpportunityStatusBadge status={o.status} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
