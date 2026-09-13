"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import {
  BarList,
  CHART,
  ChartTooltip,
  Legend,
} from "@/components/analytics/chart-kit";
import { findingsFor, useDiscovery } from "@/lib/analytics/discovery";

export default function AnalyticsPage() {
  const { runs, loaded, error } = useDiscovery();
  const [runId, setRunId] = useState("all");
  const scoped =
    runId === "all" ? runs : runs.filter((run) => run.id === runId);
  const findings = findingsFor(scoped);
  const relevant = findings.filter((finding) => finding.relevant === true);
  const assessed = findings.filter((finding) => finding.relevant !== null);
  const communities = [...new Set(relevant.map((finding) => finding.community))]
    .map((label) => ({
      label,
      value: relevant.filter((finding) => finding.community === label).length,
    }))
    .sort((a, b) => b.value - a.value);
  const volume = [...scoped]
    .reverse()
    .map((run, index) => ({
      label: `${index + 1}`,
      relevant: run.findings.filter((finding) => finding.relevant === true)
        .length,
      rejected: run.findings.filter((finding) => finding.relevant === false)
        .length,
      pending: run.findings.filter((finding) => finding.relevant === null)
        .length,
    }));
  const metrics = [
    ["Unique threads scraped", findings.length],
    ["Relevant threads", relevant.length],
    [
      "Relevance rate",
      assessed.length
        ? `${Math.round((relevant.length / assessed.length) * 100)}%`
        : "--",
    ],
    ["Communities with matches", communities.length],
  ];

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 px-4 py-5 sm:px-6">
      <PageHeader
        title="Analytics"
        actions={
          <Link href="/opportunities" className="text-xs text-signal">
            Opportunities
          </Link>
        }
      />
      <select
        aria-label="Analytics research run"
        value={runId}
        onChange={(event) => setRunId(event.target.value)}
        className="h-9 max-w-full rounded border border-border bg-surface px-2 text-xs"
      >
        <option value="all">All explorations</option>
        {runs.map((run) => (
          <option key={run.id} value={run.id}>
            {run.prompt.slice(0, 70)}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {!loaded ? (
        <p role="status">Loading analytics...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-y-5 border-y border-border py-5 lg:grid-cols-4">
            {metrics.map(([label, value]) => (
              <div key={label} className="min-w-0 pr-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 font-mono text-2xl">{value}</p>
              </div>
            ))}
          </div>
          {!runs.length && (
            <p className="py-6 text-muted-foreground">
              No exploration data yet
            </p>
          )}
          <div className="grid gap-8 lg:grid-cols-2">
            <section className="min-w-0">
              <h2 className="mb-4 text-sm font-medium">
                Threads by exploration
              </h2>
              {volume.length ? (
                <>
                  <Legend
                    className="mb-3 flex-wrap"
                    items={[
                      { label: "Relevant", color: CHART.accent },
                      { label: "Not relevant", color: CHART.neutral },
                      { label: "Pending analysis", color: "var(--warning)" },
                    ]}
                  />
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={volume}>
                        <CartesianGrid vertical={false} stroke={CHART.grid} />
                        <XAxis dataKey="label" />
                        <YAxis allowDecimals={false} width={30} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar
                          dataKey="relevant"
                          name="Relevant"
                          stackId="a"
                          fill={CHART.accent}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="rejected"
                          name="Not relevant"
                          stackId="a"
                          fill={CHART.neutral}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="pending"
                          name="Pending analysis"
                          stackId="a"
                          fill="var(--warning)"
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <p className="py-12 text-xs text-muted-foreground">
                  No threads scraped
                </p>
              )}
            </section>
            <section className="min-w-0">
              <h2 className="mb-4 text-sm font-medium">
                Relevant threads by community
              </h2>
              {communities.length ? (
                <BarList rows={communities} accent />
              ) : (
                <p className="py-12 text-xs text-muted-foreground">
                  No relevant communities yet
                </p>
              )}
            </section>
          </div>
          <section className="border-t border-border pt-5">
            <h2 className="mb-3 text-sm font-medium">Exploration history</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[580px] text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    {["Topic", "Status", "Scraped", "Relevant", "Started"].map(
                      (label) => (
                        <th key={label} className="px-2 py-3 font-normal">
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {scoped.map((run) => (
                    <tr key={run.id} className="border-t border-border">
                      <td className="max-w-80 px-2 py-3 break-words">
                        {run.prompt}
                        {run.error && (
                          <p className="mt-1 text-danger">{run.error}</p>
                        )}
                      </td>
                      <td className="px-2 py-3">{run.status}</td>
                      <td className="px-2 py-3 font-mono">
                        {run.findings.length}
                      </td>
                      <td className="px-2 py-3 font-mono">
                        {
                          run.findings.filter(
                            (finding) => finding.relevant === true,
                          ).length
                        }
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-muted-foreground">
                        {new Date(run.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
