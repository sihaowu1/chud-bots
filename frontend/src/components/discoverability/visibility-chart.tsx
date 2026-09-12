"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART, ChartTooltip } from "@/components/analytics/chart-kit";
import { BackendState } from "@/components/analytics/backend-state";
import { hasMeasurements, useAnalytics } from "@/lib/analytics/store";

export function VisibilityChart({ height = 220 }: { height?: number }) {
  const connection = useAnalytics((s) => s.connection);
  const series = useAnalytics((s) => s.series);

  return (
    <BackendState
      connection={connection}
      empty={!hasMeasurements(series)}
      height={height}
    >
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={series}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="vis-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.18} />
                <stop offset="100%" stopColor={CHART.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="date" interval={2} tickMargin={8} />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickMargin={4}
              width={34}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: "oklch(1 0 0 / 14%)" }}
            />
            <Area
              type="monotone"
              dataKey="score"
              name="Inception score"
              stroke={CHART.accent}
              strokeWidth={2}
              fill="url(#vis-fill)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </BackendState>
  );
}
