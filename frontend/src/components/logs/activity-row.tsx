"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import type { LogRow } from "./types";
import { clock } from "@/lib/format";
import { AgentName } from "@/components/shared/agent-name";
import { AgentStatusBadge } from "@/components/shared/agent-status";
import { cn } from "@/lib/utils";

/**
 * Column template. Below the `@3xl` container width the Agent column folds
 * into the message so the feed stays readable in narrow panels.
 */
export const ROW_GRID = "grid-cols-[64px_minmax(0,1fr)_96px]";
export const ROW_GRID_COMPACT = "grid-cols-[64px_minmax(0,1fr)_96px]";

interface Props {
  row: LogRow;
  selected: boolean;
  isNew: boolean;
  compact?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  onSelect: (id: string) => void;
}

function ActivityRowInner({
  row,
  selected,
  isNew,
  compact,
  highlighted,
  dimmed,
  onSelect,
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
      onClick={() => onSelect(row.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(row.id);
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
        row.error && !selected && "text-danger",
      )}
    >
      {selected && (
        <span
          className="absolute inset-y-0 left-0 w-0.5 bg-signal"
          aria-hidden
        />
      )}
      <span className="font-mono text-fg-subtle tnum">{clock(row.ts)}</span>
      <span className="truncate">
        {row.persona && (
          <span className="mr-1.5">
            <AgentName id={row.persona} name={row.persona} />
            {row.level !== undefined && (
              <span className="ml-1 text-fg-subtle">L{row.level}</span>
            )}
          </span>
        )}
        <span className={cn(row.error ? "text-danger" : "text-muted-foreground")}>
          {row.msg}
        </span>
        {row.url && (
          <a
            href={row.url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="ml-1.5 text-signal hover:underline"
          >
            View post
          </a>
        )}
      </span>
      {row.agent ? (
        <AgentStatusBadge status={row.agent.status} dotOnly={compact} />
      ) : (
        <span className="justify-self-start text-fg-subtle">—</span>
      )}
    </motion.div>
  );
}

export const ActivityRow = memo(ActivityRowInner);
