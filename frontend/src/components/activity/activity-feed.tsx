"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, Inbox, Pause } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSim } from "@/lib/store";
import { useActivityFilters, CATEGORY_FILTERS } from "@/lib/filters";
import type { ActivityEvent } from "@/lib/types";
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
  /** Agent to visually emphasise (e.g. hovered in another panel). */
  highlightAgentId?: string | null;
  className?: string;
  listClassName?: string;
}

export function useFilteredEvents(events: ActivityEvent[]) {
  const { category, agentId, platform, status } = useActivityFilters();
  return useMemo(() => {
    const cat = CATEGORY_FILTERS.find((c) => c.value === category);
    return events.filter((e) => {
      if (cat && cat.value !== "all" && !cat.match.includes(e.category))
        return false;
      if (agentId && e.agentId !== agentId) return false;
      if (platform && e.platform !== platform) return false;
      if (status && e.status !== status) return false;
      return true;
    });
  }, [events, category, agentId, platform, status]);
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
  const router = useRouter();
  const hydrated = useSim((s) => s.hydrated);
  const paused = useSim((s) => s.paused);
  const events = useSim((s) => s.events);
  const reset = useActivityFilters((s) => s.reset);
  const hasFilter = useActivityFilters(
    (s) => s.category !== "all" || s.agentId || s.platform || s.status,
  );

  const filtered = useFilteredEvents(events);

  // --- Freeze logic: don't move rows under a user who is reading. --------
  // While a row is selected or the list is scrolled, new events are held back
  // and surfaced as a "N new events" affordance instead of shifting the list.
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

  const onAgentClick = useCallback(
    (agentId: string) => router.push(`/agents?agent=${agentId}`),
    [router],
  );

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
        <span>Agent</span>
        {!compact && <span className="hidden @3xl:block">Action</span>}
        <span>
          <span className={cn(!compact && "@3xl:hidden")}>Action · </span>
          Context
        </span>
        <span className="justify-self-end">Score</span>
        <span>Status</span>
        <span />
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

        {!hydrated && (
          <div className="space-y-px px-4 py-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex h-9 items-center gap-3">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        )}

        {hydrated && paused && visible.length === 0 && (
          <EmptyState
            icon={Pause}
            title="Agents are paused"
            description="Resume agents to continue receiving activity."
          />
        )}

        {hydrated && !paused && visible.length === 0 && (
          <EmptyState
            icon={Inbox}
            title={
              hasFilter ? "No events match these filters" : "No activity yet"
            }
            description={
              hasFilter
                ? "Try widening the category or clearing the agent, platform and status filters."
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
          {visible.map((e) => {
            const isSelected = selectedId === e.id;
            return (
              <div key={e.id}>
                <ActivityRow
                  event={e}
                  selected={isSelected}
                  isNew={e.ts > mountedAt}
                  compact={compact}
                  highlighted={
                    !!highlightAgentId && e.agentId === highlightAgentId
                  }
                  dimmed={!!highlightAgentId && e.agentId !== highlightAgentId}
                  onSelect={select}
                  onAgentClick={onAgentClick}
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
                        <ActivityDetail event={e} layout="inline" />
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
