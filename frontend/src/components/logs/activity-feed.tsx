"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, Inbox } from "lucide-react";
import { useSessions } from "@/lib/sessions/store";
import { useActivityFilters } from "@/lib/filters";
import type { LogRow } from "./types";
import { ActivityRow, ROW_GRID, ROW_GRID_COMPACT } from "./activity-row";
import { ActivityDetail } from "./activity-detail";
import { CategorySegments, SecondaryFilters } from "./activity-filters";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  /** `inline` expands the row in place; `external` hands selection to the parent. */
  mode?: "inline" | "external";
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  limit?: number;
  compact?: boolean;
  showFilters?: boolean;
  showSecondaryFilters?: boolean;
  /** Agent (by BrowserAgent id) to visually emphasise (e.g. hovered in another panel). */
  highlightAgentId?: string | null;
  className?: string;
  listClassName?: string;
}

export function useFilteredEvents(rows: LogRow[]) {
  const { status, persona, errorOnly } = useActivityFilters();
  return useMemo(() => {
    return rows.filter((r) => {
      if (status !== "all" && r.agent?.status !== status) return false;
      if (persona && r.persona !== persona) return false;
      if (errorOnly && !r.error) return false;
      return true;
    });
  }, [rows, status, persona, errorOnly]);
}

export function ActivityFeed({
  mode = "inline",
  selectedId: controlledSelected,
  onSelect,
  limit = 150,
  compact = false,
  showFilters = true,
  showSecondaryFilters = true,
  highlightAgentId,
  className,
  listClassName,
}: Props) {
  const start = useSessions((s) => s.start);
  const connection = useSessions((s) => s.connection);
  const logs = useSessions((s) => s.logs);
  const agents = useSessions((s) => s.agents);
  const reset = useActivityFilters((s) => s.reset);
  const hasFilter = useActivityFilters(
    (s) => s.status !== "all" || s.persona || s.errorOnly,
  );

  useEffect(() => start(), [start]);

  const rows: LogRow[] = useMemo(
    () =>
      logs.map((l) => ({
        ...l,
        agent: l.persona
          ? agents.find((a) => a.persona === l.persona)
          : undefined,
      })),
    [logs, agents],
  );

  const filtered = useFilteredEvents(rows);

  // --- Freeze logic: don't move rows under a user who is reading. --------
  const scrollRef = useRef<HTMLDivElement>(null);
  const [frozenTs, setFrozenTs] = useState<number | null>(null);
  const [mountedAt] = useState(() => Date.now());

  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selectedId =
    controlledSelected !== undefined ? controlledSelected : internalSelected;
  const select = useCallback(
    (id: string | null) => {
      const next = id === selectedId ? null : id;
      if (onSelect) onSelect(next);
      if (controlledSelected === undefined) setInternalSelected(next);
      if (next) setFrozenTs((f) => f ?? filtered[0]?.ts ?? Date.now());
      else if ((scrollRef.current?.scrollTop ?? 0) <= 8) setFrozenTs(null);
    },
    [onSelect, selectedId, controlledSelected, filtered],
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop > 40)
      setFrozenTs((f) => f ?? filtered[0]?.ts ?? Date.now());
    else if (el.scrollTop <= 8 && !selectedId) setFrozenTs(null);
  }, [filtered, selectedId]);

  const visible = useMemo(
    () =>
      (frozenTs === null
        ? filtered
        : filtered.filter((e) => e.ts <= frozenTs)
      ).slice(0, limit),
    [filtered, frozenTs, limit],
  );
  const pending =
    frozenTs === null ? 0 : filtered.filter((e) => e.ts > frozenTs).length;

  const release = () => {
    setFrozenTs(null);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Esc clears selection.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && select(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, select]);

  const loading = connection === "connecting" && rows.length === 0;

  return (
    <div className={cn("@container flex min-h-0 flex-col", className)}>
      {showFilters && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <CategorySegments />
          {showSecondaryFilters && <SecondaryFilters />}
        </div>
      )}

      <div
        className={cn(
          "grid items-center gap-3 border-b border-border px-4 py-1.5 label-xs",
          compact ? ROW_GRID_COMPACT : ROW_GRID,
        )}
      >
        <span>Time</span>
        <span>Message</span>
        <span>Status</span>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={cn(
          "scroll-quiet relative min-h-0 flex-1 overflow-y-auto",
          listClassName,
        )}
      >
        <AnimatePresence>
          {pending > 0 && (
            <motion.div
              key="pending"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-none sticky top-2 z-10 flex h-0 justify-center overflow-visible"
            >
              <button
                onClick={release}
                className="pointer-events-auto flex h-7 items-center gap-1.5 rounded-full border border-border-strong bg-popover px-3 text-xs font-medium text-foreground shadow-md shadow-black/30 transition-colors hover:bg-accent"
              >
                {pending} new event{pending === 1 ? "" : "s"}
                <ArrowDown className="size-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {loading && (
          <div className="space-y-px px-4 py-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex h-9 items-center gap-3">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        )}

        {!loading && visible.length === 0 && (
          <EmptyState
            icon={Inbox}
            title={
              hasFilter
                ? "No events match these filters"
                : connection === "offline"
                  ? "Backend offline"
                  : "No activity yet"
            }
            description={
              hasFilter
                ? "Try clearing the agent, status or error filters."
                : connection === "offline"
                  ? "Start the backend to see live logs here."
                  : "Agents will report here as soon as they start working."
            }
            action={
              hasFilter ? (
                <Button size="sm" variant="outline" onClick={reset}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}

        <div className="divide-y divide-border/60">
          {visible.map((row) => {
            const isSelected = selectedId === row.id;
            return (
              <div key={row.id}>
                <ActivityRow
                  row={row}
                  selected={isSelected}
                  isNew={row.ts > mountedAt}
                  compact={compact}
                  highlighted={
                    !!highlightAgentId && row.agent?.id === highlightAgentId
                  }
                  dimmed={
                    !!highlightAgentId && row.agent?.id !== highlightAgentId
                  }
                  onSelect={select}
                />
                {mode === "inline" && (
                  <AnimatePresence initial={false}>
                    {isSelected && (
                      <motion.div
                        key="detail"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                          duration: 0.22,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className="overflow-hidden bg-signal/[0.03]"
                      >
                        <ActivityDetail event={row} layout="inline" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
