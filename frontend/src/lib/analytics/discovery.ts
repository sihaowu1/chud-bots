"use client";

import { useEffect } from "react";
import { create } from "zustand";

export interface Finding {
  id: string;
  url: string;
  title: string;
  author: string | null;
  text: string;
  community: string;
  query: string;
  scrapedAt: number;
  relevant: boolean | null;
  score: number | null;
  reason: string;
}
export interface DiscoveryRun {
  id: string;
  prompt: string;
  limit: number;
  status: "queued" | "running" | "completed" | "failed" | "stopped";
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  queries: string[];
  findings: Finding[];
  events: { ts: number; message: string }[];
  discovered: number;
  viewerUrl: string | null;
  error: string | null;
}

async function request(path = "", init?: RequestInit) {
  const response = await fetch(`/api/analytics${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : "The request could not be completed",
    );
  return body;
}

const useDiscoveryStore = create<{
  runs: DiscoveryRun[];
  loaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}>((set) => ({
  runs: [],
  loaded: false,
  error: null,
  refresh: async () => {
    try {
      const data = await request();
      set({ runs: data.runs, loaded: true, error: null });
    } catch (error) {
      set({ error: (error as Error).message, loaded: true });
    }
  },
}));

export function useDiscovery() {
  const state = useDiscoveryStore();
  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await useDiscoveryStore.getState().refresh();
      if (mounted) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);
  return state;
}

export async function startDiscovery(prompt: string, limit: number) {
  await request("", {
    method: "POST",
    body: JSON.stringify({ prompt, limit }),
  });
  await useDiscoveryStore.getState().refresh();
}
export async function stopDiscovery(id: string) {
  await request(`/${id}`, { method: "DELETE" });
  await useDiscoveryStore.getState().refresh();
}

export function findingsFor(runs: DiscoveryRun[]) {
  const latest = new Map<string, Finding>();
  for (const run of runs)
    for (const finding of run.findings) {
      const previous = latest.get(finding.url);
      if (!previous || finding.scrapedAt > previous.scrapedAt)
        latest.set(finding.url, finding);
    }
  return [...latest.values()].sort((a, b) => b.scrapedAt - a.scrapedAt);
}
