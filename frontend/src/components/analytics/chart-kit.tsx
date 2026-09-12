"use client";

import type { TooltipContentProps } from "recharts";
import { cn } from "@/lib/utils";

/** Shared chart tokens so every chart reads as one system. */
export const CHART = {
  accent: "var(--signal)",
  neutral: "oklch(1 0 0 / 22%)",
  neutralStrong: "oklch(1 0 0 / 45%)",
  grid: "oklch(1 0 0 / 6%)",
  success: "var(--success)",
};

export function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: Partial<TooltipContentProps<number, string>> & { unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border-strong bg-popover px-2.5 py-2 text-xs shadow-md shadow-black/30">
      <div className="mb-1 font-mono text-[11px] text-muted-foreground">
        {label}
      </div>
      <ul className="space-y-0.5">
        {payload.map((p) => (
          <li
            key={String(p.dataKey)}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="size-2 rounded-[2px]"
                style={{ background: p.color }}
              />
              {p.name}
            </span>
            <span className="font-mono text-foreground tnum">
              {typeof p.value === "number"
                ? p.value.toLocaleString("en-US")
                : p.value}
              {unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Legend({
  items,
  className,
}: {
  items: { label: string; color: string }[];
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "flex items-center gap-4 text-[11px] text-muted-foreground",
        className,
      )}
    >
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            className="size-2 rounded-[2px]"
            style={{ background: i.color }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function ChartCard({
  title,
  subtitle,
  legend,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-lg border border-border bg-surface",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-4">
        <div>
          <h3 className="text-[13px] font-medium">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {legend}
      </div>
      <div className="px-3 pb-3 pt-3">{children}</div>
    </section>
  );
}

/** Horizontal bar list in plain HTML — for ranked categories where a table beats a chart. */
export function BarList({
  rows,
  max,
  format = (n) => String(n),
  accent,
}: {
  rows: { label: string; value: number; meta?: React.ReactNode }[];
  max?: number;
  format?: (n: number) => string;
  accent?: boolean;
}) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5 px-2">
      {rows.map((r) => (
        <li
          key={r.label}
          className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] items-center gap-3 text-xs"
        >
          <span className="truncate text-muted-foreground">{r.label}</span>
          <span className="relative h-[6px] overflow-hidden rounded-[3px] bg-foreground/[0.06]">
            <span
              className={cn(
                "absolute inset-y-0 left-0 rounded-[3px]",
                accent ? "bg-signal" : "bg-foreground/50",
              )}
              style={{ width: `${(r.value / m) * 100}%` }}
            />
          </span>
          <span className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="font-mono text-foreground tnum">
              {format(r.value)}
            </span>
            {r.meta && (
              <span className="text-[11px] text-fg-subtle">{r.meta}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
