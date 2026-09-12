"use client";

import { useSim } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Monospace agent identifier. Resolves id → display name; falls back to the raw label. */
export function AgentName({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const name = useSim((s) => s.agents.find((a) => a.id === id)?.name);
  return (
    <span className={cn("font-mono text-xs text-foreground", className)}>
      {name ?? id}
    </span>
  );
}
