"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useSim } from "@/lib/store";
import { useNow } from "@/hooks/use-now";
import { duration, clock } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { LiveIndicator } from "@/components/shared/live-indicator";
import { SectionHeader } from "@/components/shared/section";
import { CampaignSummary } from "@/components/dashboard/campaign-summary";
import { AgentsDeployed } from "@/components/dashboard/agents-deployed";
import { AgentPlan } from "@/components/dashboard/agent-plan";
import { ActivityFeed } from "@/components/logs/activity-feed";

export default function DashboardPage() {
  const campaign = useSim((s) => s.campaign);
  const hydrated = useSim((s) => s.hydrated);
  const now = useNow(1000);

  return (
    <div className="mx-auto max-w-[1480px] px-6 pb-8 pt-5">
      <PageHeader
        title="Dashboard"
        description={
          <>
            {campaign.name} ·{" "}
            {campaign.status === "running" ? "Running" : "Paused"}
            {hydrated && campaign.status === "running" && (
              <> for {duration(now - campaign.startedAt)}</>
            )}
          </>
        }
        actions={
          <>
            <LiveIndicator />
            <span className="font-mono text-xs text-fg-subtle tnum">
              {hydrated ? clock(now) : "--:--:--"}
            </span>
          </>
        }
      />

      <div className="mt-5 grid grid-cols-12 gap-4">
        <CampaignSummary className="col-span-12 xl:col-span-7" />
        <AgentsDeployed className="col-span-12 xl:col-span-5" />
      </div>

      <div className="mt-4 grid grid-cols-12 gap-4">
        <section className="col-span-12 flex h-[560px] flex-col rounded-lg border border-border bg-surface xl:col-span-8">
          <div className="flex items-start justify-between border-b border-border px-5 py-4">
            <SectionHeader
              size="lg"
              title="Live Agent Activity"
              subtitle="What every agent is doing right now"
            />
            <Link
              href="/logs"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Full view
              <ArrowRight className="size-3" />
            </Link>
          </div>
          <ActivityFeed
            mode="inline"
            limit={80}
            showFilters={false}
            className="min-h-0 flex-1"
          />
        </section>
        <AgentPlan className="col-span-12 h-[560px] xl:col-span-4" />
      </div>
    </div>
  );
}
