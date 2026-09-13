"use client";

import { useSim } from "@/lib/store";
import type { SessionConnection } from "@/lib/sessions/store";
import type { ConnectionState } from "@/lib/types";
import { StatusDot } from "./status-dot";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  /**
   * Pass the real `useSessions` connection state to drive this from the
   * backend (used by the Logs page) instead of the mock `useSim` store.
   */
  connection?: SessionConnection | ConnectionState;
}

export function LiveIndicator({ className, connection: connectionProp }: Props) {
  const simPaused = useSim((s) => s.paused);
  const simConnection = useSim((s) => s.connection);
  const connection = connectionProp ?? simConnection;
  const paused = connectionProp === undefined && simPaused;

  if (connection === "connecting") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-warning",
          className,
        )}
      >
        <StatusDot tone="warning" pulse size="xs" />
        Connecting
      </span>
    );
  }
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
