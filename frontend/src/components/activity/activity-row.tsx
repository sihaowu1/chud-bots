"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { Bot, ExternalLink } from "lucide-react";
import type { ActivityEvent } from "@/lib/types";
import { clock } from "@/lib/format";
import { AgentName } from "@/components/shared/agent-name";
import { EventStatusBadge } from "@/components/shared/event-status";
import { Score } from "@/components/shared/score";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Column template. Below the `@3xl` container width the Action column folds
 * into Context so the feed stays readable in narrow panels.
 */
export const ROW_GRID =
  "grid-cols-[64px_92px_minmax(0,1fr)_44px_92px_44px] @3xl:grid-cols-[64px_96px_150px_minmax(0,1fr)_48px_96px_44px]";
export const ROW_GRID_COMPACT =
  "grid-cols-[64px_92px_minmax(0,1fr)_44px_92px_44px]";

interface Props {
  event: ActivityEvent;
  selected: boolean;
  isNew: boolean;
  compact?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  onSelect: (id: string) => void;
  onAgentClick?: (agentId: string) => void;
}

function ActivityRowInner({
  event,
  selected,
  isNew,
  compact,
  highlighted,
  dimmed,
  onSelect,
  onAgentClick,
}: Props) {
  return (
    <motion.div
      layout="position"
      initial={isNew ? { opacity: 0, y: -6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      role="button"
      tabIndex={0}
      aria-expanded={selected}
      onClick={() => onSelect(event.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(event.id);
        }
      }}
      className={cn(
        "group relative grid h-9 cursor-pointer items-center gap-3 px-4 text-xs outline-none transition-colors duration-150",
        compact ? ROW_GRID_COMPACT : ROW_GRID,
        selected
          ? "bg-signal/[0.08]"
          : "hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.03]",
        isNew && !selected && "animate-row-flash",
        highlighted && !selected && "bg-foreground/[0.04]",
        dimmed && "opacity-40",
      )}
    >
      {selected && (
        <span
          className="absolute inset-y-0 left-0 w-0.5 bg-signal"
          aria-hidden
        />
      )}
      <span className="font-mono text-fg-subtle tnum">{clock(event.ts)}</span>
      <button
        onClick={(e) => {
          if (!onAgentClick) return;
          e.stopPropagation();
          onAgentClick(event.agentId);
        }}
        className="truncate text-left hover:underline hover:decoration-border-strong hover:underline-offset-2"
      >
        <AgentName id={event.agentId} />
      </button>
      {!compact && (
        <span className="hidden truncate text-foreground @3xl:block">
          {event.action}
        </span>
      )}
      <span className="truncate text-muted-foreground">
        <span className={cn("text-foreground", !compact && "@3xl:hidden")}>
          {event.action} ·{" "}
        </span>
        {event.context}
      </span>
      <span className="justify-self-end">
        {event.score !== undefined ? (
          <Score value={event.score} bar={false} />
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </span>
      <EventStatusBadge status={event.status} animateCheck={isNew} />
      <span className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
        {event.platform === "reddit" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="rounded p-1 text-fg-subtle hover:bg-foreground/[0.06] hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
                aria-label="Open discussion"
              >
                <ExternalLink className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Open discussion</TooltipContent>
          </Tooltip>
        )}
        {onAgentClick && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="rounded p-1 text-fg-subtle hover:bg-foreground/[0.06] hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onAgentClick(event.agentId);
                }}
                aria-label="View agent"
              >
                <Bot className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent>View agent</TooltipContent>
          </Tooltip>
        )}
      </span>
    </motion.div>
  );
}

export const ActivityRow = memo(ActivityRowInner);
