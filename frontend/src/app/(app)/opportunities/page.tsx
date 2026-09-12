"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Compass } from "lucide-react";
import { useSim } from "@/lib/store";
import type { OpportunityStatus } from "@/lib/types";
import { PageHeader } from "@/components/shared/page-header";
import { Inspector } from "@/components/shared/inspector";
import { EmptyState } from "@/components/shared/empty-state";
import {
  OpportunityTable,
  OPP_STATUS,
} from "@/components/opportunities/opportunity-table";
import { OpportunityPanel } from "@/components/opportunities/opportunity-panel";
import { useHotkey } from "@/hooks/use-hotkey";
import { cn } from "@/lib/utils";

type Tab = "all" | OpportunityStatus;
const TABS: Tab[] = [
  "all",
  "new",
  "review",
  "approved",
  "posted",
  "monitoring",
  "skipped",
];

function OpportunitiesInner() {
  const params = useSearchParams();
  const router = useRouter();
  const opportunities = useSim((s) => s.opportunities);
  const setStatus = useSim((s) => s.setOpportunityStatus);
  const [tab, setTab] = useState<Tab>("all");
  const paramId = params.get("id");
  const [selectedId, setSelectedId] = useState<string | null>(paramId);
  // Adopt a new ?id= from a navigation without an effect (React's
  // "adjust state during render" pattern).
  const [seenParam, setSeenParam] = useState(paramId);
  if (paramId !== seenParam) {
    setSeenParam(paramId);
    if (paramId) setSelectedId(paramId);
  }

  const counts = useMemo(() => {
    const c: Record<Tab, number> = {
      all: opportunities.length,
      new: 0,
      review: 0,
      approved: 0,
      posted: 0,
      monitoring: 0,
      skipped: 0,
    };
    for (const o of opportunities) c[o.status]++;
    return c;
  }, [opportunities]);

  const list = useMemo(
    () =>
      opportunities
        .filter((o) => tab === "all" || o.status === tab)
        .sort((a, b) => b.discoveredAt - a.discoveredAt),
    [opportunities, tab],
  );
  const selected = opportunities.find((o) => o.id === selectedId) ?? null;

  const close = () => {
    setSelectedId(null);
    if (params.get("id")) router.replace("/opportunities");
  };

  useHotkey("Escape", close, { enabled: !!selected });
  useHotkey(
    "a",
    () =>
      selected &&
      (selected.status === "new" || selected.status === "review") &&
      setStatus(selected.id, "approved"),
    { enabled: !!selected },
  );
  useHotkey("j", () => {
    const i = list.findIndex((o) => o.id === selectedId);
    const next = list[Math.min(list.length - 1, i + 1)];
    if (next) setSelectedId(next.id);
  });
  useHotkey("k", () => {
    const i = list.findIndex((o) => o.id === selectedId);
    const prev = list[Math.max(0, i - 1)];
    if (prev) setSelectedId(prev.id);
  });

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="px-6 pt-5">
          <PageHeader
            title="Discovery Opportunities"
            description="Conversations where FlowPilot AI genuinely belongs, ranked by relevance"
          />
        </div>

        <div
          className="mt-4 flex items-center gap-0.5 border-b border-border px-6"
          role="tablist"
        >
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "relative flex h-9 items-center gap-1.5 px-2.5 text-xs transition-colors",
                tab === t
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "all" ? "All" : OPP_STATUS[t].label}
              <span
                className={cn(
                  "font-mono text-[11px] tnum",
                  tab === t ? "text-muted-foreground" : "text-fg-subtle",
                )}
              >
                {counts[t]}
              </span>
              {tab === t && (
                <span className="absolute inset-x-2 -bottom-px h-px bg-foreground" />
              )}
            </button>
          ))}
        </div>

        <div className="scroll-quiet min-h-0 flex-1 overflow-auto">
          {list.length === 0 ? (
            <EmptyState
              icon={Compass}
              title={`No ${tab === "all" ? "" : OPP_STATUS[tab].label.toLowerCase() + " "}opportunities`}
              description="Scouts are scanning. New opportunities appear here as soon as they pass relevance and policy checks."
            />
          ) : (
            <OpportunityTable
              opportunities={list}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
            />
          )}
        </div>
      </div>

      <Inspector
        open={!!selected}
        onClose={close}
        title={selected ? `“${selected.title}”` : ""}
        subtitle={
          selected ? `${selected.community} · ${selected.author}` : undefined
        }
        width={480}
      >
        {selected && (
          <OpportunityPanel key={selected.id} opportunity={selected} />
        )}
      </Inspector>
    </div>
  );
}

export default function OpportunitiesPage() {
  return (
    <Suspense>
      <OpportunitiesInner />
    </Suspense>
  );
}
