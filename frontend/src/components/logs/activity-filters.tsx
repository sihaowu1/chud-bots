"use client";

import { ChevronDown, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActivityFilters, STATUS_FILTERS } from "@/lib/filters";
import { useSessions } from "@/lib/sessions/store";
import { cn } from "@/lib/utils";

/** Segmented status filter, backed by real `BrowserAgent.status`. */
export function CategorySegments({ className }: { className?: string }) {
  const status = useActivityFilters((s) => s.status);
  const setStatus = useActivityFilters((s) => s.setStatus);
  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role="tablist"
      aria-label="Filter by status"
    >
      {STATUS_FILTERS.map((f) => (
        <button
          key={f.value}
          role="tab"
          aria-selected={status === f.value}
          onClick={() => setStatus(f.value)}
          className={cn(
            "h-6 rounded px-2 text-xs transition-colors duration-150",
            status === f.value
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

export function SecondaryFilters({ className }: { className?: string }) {
  const agents = useSessions((s) => s.agents);
  const f = useActivityFilters();
  const personas = Array.from(new Set(agents.map((a) => a.persona)));

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex h-6 items-center gap-1 rounded px-2 text-xs transition-colors",
                f.persona
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.persona ?? "Agent"}
              <ChevronDown className="size-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-h-72 min-w-40 overflow-y-auto"
          >
            {personas.map((p) => (
              <DropdownMenuItem
                key={p}
                onSelect={() => f.setPersona(p)}
                className={cn("text-xs", f.persona === p && "bg-accent")}
              >
                {p}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {f.persona && (
          <button
            onClick={() => f.setPersona(null)}
            className="-ml-0.5 rounded p-0.5 text-fg-subtle hover:text-foreground"
            aria-label="Clear agent filter"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      <button
        onClick={() => f.setErrorOnly(!f.errorOnly)}
        className={cn(
          "h-6 rounded px-2 text-xs transition-colors",
          f.errorOnly
            ? "bg-danger/15 text-danger"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Errors only
      </button>
    </div>
  );
}
