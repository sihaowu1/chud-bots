"use client";

import { useSim } from "@/lib/store";
import { StatusDot } from "./status-dot";
import { cn } from "@/lib/utils";

export function LiveIndicator({ className }: { className?: string }) {
  const paused = useSim((s) => s.paused);
  const connection = useSim((s) => s.connection);

  if (connection === "reconnecting") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-warning",
          className,
        )}
      >
        <StatusDot tone="warning" pulse size="xs" />
        Reconnecting
      </span>
    );
  }
  if (connection === "offline") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-danger",
          className,
        )}
      >
        <StatusDot tone="danger" size="xs" />
        Offline
      </span>
    );
  }
  if (paused) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
          className,
        )}
      >
        <StatusDot tone="muted" size="xs" />
        Paused
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-success",
        className,
      )}
    >
      <StatusDot tone="success" pulse size="xs" />
      Live
    </span>
  );
}
