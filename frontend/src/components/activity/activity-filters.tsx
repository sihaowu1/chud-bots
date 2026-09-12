"use client";

import { ChevronDown, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActivityFilters, CATEGORY_FILTERS } from "@/lib/filters";
import { useSim } from "@/lib/store";
import type { EventStatus, Platform } from "@/lib/types";
import { eventStatusMeta } from "@/components/shared/event-status";
import { cn } from "@/lib/utils";

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "reddit", label: "Reddit" },
  { value: "web", label: "Web" },
  { value: "system", label: "System" },
];

const STATUSES: EventStatus[] = [
  "searching",
  "analyzing",
  "new",
  "complete",
  "allowed",
  "blocked",
  "rejected",
  "review",
  "updated",
  "detected",
  "paused",
  "error",
];

/** Segmented category filter. Kept compact: text-only, single row. */
export function CategorySegments({ className }: { className?: string }) {
  const category = useActivityFilters((s) => s.category);
  const setCategory = useActivityFilters((s) => s.setCategory);
  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role="tablist"
      aria-label="Filter by category"
    >
      {CATEGORY_FILTERS.map((f) => (
        <button
          key={f.value}
          role="tab"
          aria-selected={category === f.value}
          onClick={() => setCategory(f.value)}
          className={cn(
            "h-6 rounded px-2 text-xs transition-colors duration-150",
            category === f.value
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function FilterMenu<T extends string>({
  label,
  value,
  display,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  display?: string;
  options: { value: T; label: string }[];
  onChange: (v: T | null) => void;
}) {
  return (
    <div className="flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex h-6 items-center gap-1 rounded px-2 text-xs transition-colors",
              value
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value ? (display ?? value) : label}
            <ChevronDown className="size-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="max-h-72 min-w-40 overflow-y-auto"
        >
          {options.map((o) => (
            <DropdownMenuItem
              key={o.value}
              onSelect={() => onChange(o.value)}
              className={cn("text-xs", value === o.value && "bg-accent")}
            >
              {o.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {value && (
        <button
          onClick={() => onChange(null)}
          className="-ml-0.5 rounded p-0.5 text-fg-subtle hover:text-foreground"
          aria-label={`Clear ${label} filter`}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

export function SecondaryFilters({ className }: { className?: string }) {
  const agents = useSim((s) => s.agents);
  const f = useActivityFilters();
  const agentName = agents.find((a) => a.id === f.agentId)?.name;
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <FilterMenu
        label="Agent"
        value={f.agentId}
        display={agentName}
        options={agents.map((a) => ({ value: a.id, label: a.name }))}
        onChange={f.setAgent}
      />
      <FilterMenu
        label="Platform"
        value={f.platform}
        display={PLATFORMS.find((p) => p.value === f.platform)?.label}
        options={PLATFORMS}
        onChange={f.setPlatform}
      />
      <FilterMenu
        label="Status"
        value={f.status}
        display={f.status ? eventStatusMeta(f.status).label : undefined}
        options={STATUSES.map((s) => ({
          value: s,
          label: eventStatusMeta(s).label,
        }))}
        onChange={f.setStatus}
      />
    </div>
  );
}
