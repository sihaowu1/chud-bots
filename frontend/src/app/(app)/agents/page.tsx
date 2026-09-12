"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { List, Network } from "lucide-react";
import { useSim } from "@/lib/store";
import { ROLE_LABEL, ROLE_ORDER } from "@/lib/mock/agents";
import { PageHeader } from "@/components/shared/page-header";
import { Inspector } from "@/components/shared/inspector";
import { SectionHeader } from "@/components/shared/section";
import { AgentTable } from "@/components/agents/agent-table";
import { AgentDetail } from "@/components/agents/agent-detail";
import { AgentNetwork } from "@/components/agents/agent-network";
import { AllocationPanel } from "@/components/agents/allocation-panel";
import { ActivityFeed } from "@/components/logs/activity-feed";
import { AgentStatusBadge } from "@/components/shared/agent-status";
import { useHotkey } from "@/hooks/use-hotkey";
import { cn } from "@/lib/utils";

type View = "list" | "network";

function AgentsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const agents = useSim((s) => s.agents);
  const [view, setView] = useState<View>("list");
  const paramId = params.get("agent");
  const [selectedId, setSelectedId] = useState<string | null>(paramId);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Adopt a new ?agent= from a navigation without an effect (React's
  // "adjust state during render" pattern).
  const [seenParam, setSeenParam] = useState(paramId);
  if (paramId !== seenParam) {
    setSeenParam(paramId);
    if (paramId) setSelectedId(paramId);
  }

  const selected = agents.find((a) => a.id === selectedId) ?? null;
  const close = () => {
    setSelectedId(null);
    if (params.get("agent")) router.replace("/agents");
  };
  useHotkey("Escape", close, { enabled: !!selected });

  const byStatus = ROLE_ORDER.map((r) => ({
    role: r,
    n: agents.filter((a) => a.role === r).length,
  })).filter((x) => x.n);

  return (
    <div className="flex h-full min-h-0">
      <div className="scroll-quiet flex min-w-0 flex-1 flex-col overflow-y-auto [&>*]:shrink-0">
        <div className="px-6 pt-5">
          <PageHeader
            title="Agents"
            description={
              <span>
                {agents.length} deployed ·{" "}
                {byStatus.map((x, i) => (
                  <span key={x.role}>
                    {i > 0 && ", "}
                    {x.n} {ROLE_LABEL[x.role].toLowerCase()}
                  </span>
                ))}
              </span>
            }
            actions={
              <div
                className="flex items-center rounded-md border border-border p-0.5"
                role="tablist"
              >
                {(
                  [
                    ["list", "List", List],
                    ["network", "Network", Network],
                  ] as const
                ).map(([v, label, Icon]) => (
                  <button
                    key={v}
                    role="tab"
                    aria-selected={view === v}
                    onClick={() => setView(v)}
                    className={cn(
                      "flex h-6 items-center gap-1.5 rounded px-2 text-xs transition-colors",
                      view === v
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            }
          />
        </div>

        {view === "list" ? (
          <>
            <div className="px-6 pt-5">
              <AllocationPanel />
            </div>
            <div className="scroll-quiet mt-5 overflow-x-auto border-t border-border">
              <AgentTable
                agents={agents}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
                onHover={setHoverId}
              />
            </div>
            <div className="flex h-[480px] shrink-0 flex-col border-t border-border">
              <div className="px-6 pb-2 pt-4">
                <SectionHeader
                  title="Recent activity"
                  subtitle={
                    hoverId
                      ? `Showing ${agents.find((a) => a.id === hoverId)?.name}`
                      : "Hover an agent to highlight its work"
                  }
                />
              </div>
              <ActivityFeed
                mode="inline"
                compact
                limit={80}
                showSecondaryFilters={false}
                highlightAgentId={hoverId}
                className="min-h-0 flex-1"
              />
            </div>
          </>
        ) : (
          <div className="px-6 pb-8 pt-4">
            <div className="mx-auto max-w-[1100px] rounded-lg border border-border bg-surface p-6">
              <div className="flex items-center justify-between">
                <SectionHeader
                  title="Agent network"
                  subtitle="Pulses travel along an edge when agents hand work to each other. Click a node to inspect it."
                />
                <ul className="flex items-center gap-4 text-[11px] text-muted-foreground">
                  <li className="flex items-center gap-1.5">
                    <span className="h-px w-4 bg-foreground/30" />
                    Work handoff
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-px w-4 border-t border-dashed border-foreground/40" />
                    Coordination
                  </li>
                </ul>
              </div>
              <div className="mt-4">
                <AgentNetwork
                  selectedId={selectedId}
                  onSelect={(id) =>
                    setSelectedId(id === selectedId ? null : id)
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <Inspector
        open={!!selected}
        onClose={close}
        title={
          selected ? (
            <span className="flex items-center gap-3">
              <span className="font-mono">{selected.name}</span>
              <AgentStatusBadge status={selected.status} />
            </span>
          ) : (
            ""
          )
        }
        subtitle={selected ? ROLE_LABEL[selected.role] : undefined}
        width={440}
      >
        {selected && <AgentDetail agent={selected} />}
      </Inspector>
    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense>
      <AgentsInner />
    </Suspense>
  );
}
