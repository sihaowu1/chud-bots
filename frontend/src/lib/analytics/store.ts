"use client";

import { create } from "zustand";
import type { QueryPresence } from "@/lib/types";

// ---------------------------------------------------------------------------
// Discoverability measurements from the backend's presence probes (analytics/),
// reached through the /backend proxy. No mock fallback: when the backend is
// unreachable the pages show an offline state instead of invented numbers.
// ---------------------------------------------------------------------------

const BACKEND = "/backend";
const POLL_MS = 30_000;
const RETRY_MS = 8_000;

export type AnalyticsConnection = "connecting" | "live" | "offline";

export interface SurfaceScore {
  label: string;
  value: number;
  delta: number;
  /** False until a probe for this surface has written any sample. */
  measured: boolean;
}

/** Probe-measured columns only; mention counts aren't produced by the backend yet. */
export type MeasuredQueryPresence = Omit<QueryPresence, "mentions">;

/** null = that surface wasn't measured that day (a gap, not a zero). */
export interface VisibilityPoint {
  date: string;
  score: number | null;
  community: number | null;
  search: number | null;
  ai: number | null;
}

interface AnalyticsState {
  connection: AnalyticsConnection;
  surfaces: SurfaceScore[];
  queries: MeasuredQueryPresence[];
  series: VisibilityPoint[];
  lastError: string | null;
  /** Begin polling; returns a cleanup. Safe to call from several components. */
  start: () => () => void;
}

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${BACKEND}${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
  return (await r.json()) as T;
}

let subscribers = 0;
let stopPolling: (() => void) | null = null;

export const useAnalytics = create<AnalyticsState>((set) => {
  const beginPolling = () => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const [surfaces, queries, series] = await Promise.all([
          getJson<SurfaceScore[]>("/api/discoverability/surfaces"),
          getJson<MeasuredQueryPresence[]>("/api/discoverability/queries"),
          getJson<VisibilityPoint[]>("/api/discoverability/series?days=14"),
        ]);
        if (cancelled) return;
        set({ connection: "live", surfaces, queries, series, lastError: null });
        timer = setTimeout(poll, POLL_MS);
      } catch (err) {
        if (cancelled) return;
        set({ connection: "offline", lastError: String(err) });
        timer = setTimeout(poll, RETRY_MS);
      }
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  };

  return {
    connection: "connecting",
    surfaces: [],
    queries: [],
    series: [],
    lastError: null,
    start: () => {
      subscribers++;
      if (subscribers === 1) stopPolling = beginPolling();
      return () => {
        subscribers--;
        if (subscribers === 0) {
          stopPolling?.();
          stopPolling = null;
        }
      };
    },
  };
});

export function hasMeasurements(series: VisibilityPoint[]) {
  return series.some((p) => p.score !== null);
}

// Design-doc weights for the five-component discoverability score.
const SCORE_WEIGHTS: Record<string, number> = {
  "Community Presence": 0.3,
  "Topic Association": 0.2,
  "Search Presence": 0.2,
  "AI Answer Presence": 0.15,
  "Organic Mentions": 0.15,
};

/** Weighted blend over the rows that have a value, renormalised by their weights. */
export function blendScore(
  rows: { label: string; value: number; delta: number }[],
): { score: number; delta: number } | null {
  const weighted = rows.filter((r) => SCORE_WEIGHTS[r.label] !== undefined);
  const total = weighted.reduce((n, r) => n + SCORE_WEIGHTS[r.label], 0);
  if (!total) return null;
  const blend = (pick: (r: (typeof weighted)[number]) => number) =>
    Math.round(weighted.reduce((n, r) => n + SCORE_WEIGHTS[r.label] * pick(r), 0) / total);
  return { score: blend((r) => r.value), delta: blend((r) => r.delta) };
}
