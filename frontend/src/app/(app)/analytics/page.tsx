"use client";

import { useEffect } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { PipelineStrip } from "@/components/dashboard/pipeline-strip";
import {
  BarList,
  CHART,
  ChartCard,
  ChartTooltip,
  Legend,
} from "@/components/analytics/chart-kit";
import {
  AGENT_WORKLOAD,
  OPPORTUNITY_VOLUME,
  REJECTION_SUMMARY,
  TOPIC_PERFORMANCE,
} from "@/lib/mock/analytics";
import { BackendState } from "@/components/analytics/backend-state";
import { hasMeasurements, useAnalytics } from "@/lib/analytics/store";

const totalRelevant = OPPORTUNITY_VOLUME.reduce((n, d) => n + d.relevant, 0);
const totalScanned = OPPORTUNITY_VOLUME.reduce((n, d) => n + d.scanned, 0);

export default function AnalyticsPage() {
  // Visibility trend comes from the backend's presence probes. The other widgets
  // measure opportunities/rejections the backend doesn't produce yet, so they
  // stay on static data for now.
  const start = useAnalytics((s) => s.start);
  const connection = useAnalytics((s) => s.connection);
  const series = useAnalytics((s) => s.series);
  useEffect(() => start(), [start]);

  return (
    <div className="mx-auto max-w-[1480px] px-6 pb-8 pt-5">
      <PageHeader title="Analytics" description="Last 24 hours unless noted" />

      <PipelineStrip className="mt-5" />

      <div className="mt-5 grid grid-cols-12 gap-4">
        <ChartCard
          className="col-span-12 lg:col-span-7"
          title="Opportunity volume"
          subtitle={`${totalRelevant} relevant opportunities from ${totalScanned.toLocaleString()} discussions scanned`}
          legend={
            <Legend
              items={[
                { label: "Relevant", color: CHART.accent },
                { label: "Rejected", color: CHART.neutral },
              ]}
            />
          }
        >
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={OPPORTUNITY_VOLUME}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                barCategoryGap={3}
              >
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="label" interval={3} tickMargin={8} />
                <YAxis width={34} tickMargin={4} />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: "oklch(1 0 0 / 4%)" }}
                />
                <Bar
                  dataKey="relevant"
                  name="Relevant"
                  stackId="a"
                  fill={CHART.accent}
                  stroke="var(--surface)"
                  strokeWidth={1}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="rejected"
                  name="Rejected"
                  stackId="a"
                  fill={CHART.neutral}
                  stroke="var(--surface)"
                  strokeWidth={1}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          className="col-span-12 lg:col-span-5"
          title="Visibility trend"
          subtitle="Inception score, last 14 days"
        >
          <div style={{ height: 240 }}>
            <BackendState
              connection={connection}
              empty={!hasMeasurements(series)}
              height={240}
            >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={series}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="date" interval={3} tickMargin={8} />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 50, 100]}
                  width={34}
                  tickMargin={4}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ stroke: "oklch(1 0 0 / 14%)" }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  name="Score"
                  stroke={CHART.accent}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
            </BackendState>
          </div>
        </ChartCard>

        <ChartCard
          className="col-span-12 lg:col-span-5"
          title="Best-performing topics"
          subtitle="Opportunities found per topic, with average relevance"
        >
          <div className="pt-1">
            <BarList
              accent
              rows={TOPIC_PERFORMANCE.map((t) => ({
                label: t.topic,
                value: t.opportunities,
                meta: (
                  <>
                    {t.avgRelevance}% avg · {t.posted} posted
                  </>
                ),
              }))}
            />
          </div>
        </ChartCard>

        <ChartCard
          className="col-span-12 lg:col-span-4"
          title="Agent workload"
          subtitle="Tasks completed by role"
        >
          <div className="pt-1">
            <BarList
              rows={AGENT_WORKLOAD.map((w) => ({
                label: w.role,
                value: w.tasks,
                meta: `${w.share}%`,
              }))}
            />
          </div>
        </ChartCard>

        <ChartCard
          className="col-span-12 lg:col-span-3"
          title="Why discussions were rejected"
          subtitle="Across all scouts"
        >
          <div className="pt-1">
            <BarList
              rows={REJECTION_SUMMARY.map((r) => ({
                label: r.reason,
                value: r.count,
              }))}
            />
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
