"use client";

import { useState } from "react";
import { useSim } from "@/lib/store";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { ActivityDetail } from "@/components/activity/activity-detail";
import { Inspector } from "@/components/shared/inspector";
import { PageHeader } from "@/components/shared/page-header";
import { LiveIndicator } from "@/components/shared/live-indicator";
import { AnimatedNumber } from "@/components/shared/animated-number";

export default function ActivityPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const events = useSim((s) => s.events);
  const selected = events.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="px-6 pt-5">
          <PageHeader
            title="Activity"
            description="Every action taken by every agent, as it happens"
            actions={
              <>
                <span className="text-xs text-muted-foreground">
                  <AnimatedNumber
                    value={events.length}
                    className="font-mono text-foreground"
                  />{" "}
                  events this session
                </span>
                <LiveIndicator />
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
        title={selected?.action}
        subtitle={selected?.context}
        width={440}
      >
        {selected && <ActivityDetail event={selected} layout="panel" />}
      </Inspector>
    </div>
  );
}
