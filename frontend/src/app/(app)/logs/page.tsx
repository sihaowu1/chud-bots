"use client";

import { useState } from "react";
import { useSessions } from "@/lib/sessions/store";
import { ActivityFeed } from "@/components/logs/activity-feed";
import { ActivityDetail } from "@/components/logs/activity-detail";
import { Inspector } from "@/components/shared/inspector";
import { PageHeader } from "@/components/shared/page-header";
import { LiveIndicator } from "@/components/shared/live-indicator";
import { AnimatedNumber } from "@/components/shared/animated-number";

export default function ActivityPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const logs = useSessions((s) => s.logs);
  const agents = useSessions((s) => s.agents);
  const connection = useSessions((s) => s.connection);
  const line = logs.find((e) => e.id === selectedId) ?? null;
  const selected = line
    ? {
        ...line,
        agent: line.persona
          ? agents.find((a) => a.persona === line.persona)
          : undefined,
      }
    : null;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="px-6 pt-5">
          <PageHeader
            title="Logs"
            description="Every action taken by every agent, as it happens"
            actions={
              <>
                <span className="text-xs text-muted-foreground">
                  <AnimatedNumber
                    value={logs.length}
                    className="font-mono text-foreground"
                  />{" "}
                  events this session
                </span>
                <LiveIndicator connection={connection} />
              </>
            }
          />
        </div>
        <ActivityFeed
          mode="external"
          selectedId={selectedId}
          onSelect={setSelectedId}
          limit={300}
          className="mt-4 min-h-0 flex-1 border-t border-border"
        />
      </div>

      <Inspector
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.persona ?? "Log"}
        subtitle={selected?.agent?.target}
        width={440}
      >
        {selected && <ActivityDetail event={selected} layout="panel" />}
      </Inspector>
    </div>
  );
}
