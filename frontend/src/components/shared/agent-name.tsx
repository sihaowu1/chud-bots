"use client";

import { useSim } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Monospace agent identifier. Resolves id → display name; falls back to the
 * raw label. Pass `name` directly to bypass the mock `useSim` lookup (used by
 * the Logs page, which resolves names from real backend data instead).
 */
export function AgentName({
  id,
  name,
  className,
}: {
  id: string;
  name?: string;
  className?: string;
}) {
  const simName = useSim((s) => s.agents.find((a) => a.id === id)?.name);
  return (
    <span className={cn("font-mono text-xs text-foreground", className)}>
      {name ?? simName ?? id}
    </span>
  );
}
