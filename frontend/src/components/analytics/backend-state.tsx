"use client";

import { CloudOff, Radar } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalyticsConnection } from "@/lib/analytics/store";

interface Props {
  connection: AnalyticsConnection;
  /** True when the backend answered but has nothing measured to show. */
  empty: boolean;
  height: number;
  children: React.ReactNode;
}

/** Renders backend-driven content, or its loading / offline / not-measured state. */
export function BackendState({ connection, empty, height, children }: Props) {
  if (connection === "live" && !empty) return <>{children}</>;
  return (
    <div style={{ height }} className="flex items-center justify-center">
      {connection === "connecting" ? (
        <Skeleton className="size-full" />
      ) : connection === "offline" ? (
        <EmptyState
          icon={CloudOff}
          title="Backend unreachable"
          description="Retrying automatically. Start it with uv run uvicorn backend.main:app"
          className="py-0"
        />
      ) : (
        <EmptyState
          icon={Radar}
          title="No presence measurements yet"
          description="Probes run every 15 minutes once the backend has a Steel API key."
          className="py-0"
        />
      )}
    </div>
  );
}
