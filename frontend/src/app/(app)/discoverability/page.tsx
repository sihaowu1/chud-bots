"use client";

import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section";
import { ScoreBreakdown } from "@/components/discoverability/score-breakdown";
import { VisibilityChart } from "@/components/discoverability/visibility-chart";
import { QueryTable } from "@/components/discoverability/query-table";
import { QUERY_PRESENCE } from "@/lib/mock/discoverability";

export default function DiscoverabilityPage() {
  const detected = QUERY_PRESENCE.filter((q) => q.reddit === "detected").length;
  return (
    <div className="mx-auto max-w-[1480px] px-6 pb-8 pt-5">
      <PageHeader
        title="Discoverability"
        description="Where FlowPilot AI shows up for the queries you care about"
      />

      <div className="mt-5 grid grid-cols-12 gap-4">
        <section className="col-span-12 rounded-lg border border-border bg-surface p-5 lg:col-span-4">
          <ScoreBreakdown />
        </section>
        <section className="col-span-12 flex flex-col rounded-lg border border-border bg-surface lg:col-span-8">
          <div className="px-5 pt-4">
            <SectionHeader
              title="Visibility over time"
              subtitle="Inception score, last 14 days"
            />
          </div>
          <div className="flex-1 px-3 pb-3 pt-4">
            <VisibilityChart height={260} />
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-lg border border-border bg-surface">
        <div className="px-5 py-4">
          <SectionHeader
            title="Target queries"
            subtitle={`${QUERY_PRESENCE.length} queries · detected on Reddit for ${detected}`}
          />
        </div>
        <div className="scroll-quiet overflow-x-auto border-t border-border pb-1">
          <QueryTable />
        </div>
      </section>
    </div>
  );
}
