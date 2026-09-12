"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EventCategory, EventStatus, Platform } from "@/lib/types";

export type CategoryFilter =
  "all" | Exclude<EventCategory, "strategy" | "system">;

export const CATEGORY_FILTERS: {
  value: CategoryFilter;
  label: string;
  match: EventCategory[];
}[] = [
  { value: "all", label: "All", match: [] },
  { value: "discovery", label: "Discovery", match: ["discovery"] },
  { value: "analysis", label: "Analysis", match: ["analysis"] },
  { value: "writing", label: "Writing", match: ["writing"] },
  { value: "policy", label: "Policy", match: ["policy"] },
  { value: "monitoring", label: "Monitoring", match: ["monitoring"] },
  {
    value: "visibility",
    label: "Visibility",
    match: ["visibility", "strategy"],
  },
  { value: "error", label: "Errors", match: ["error"] },
];

interface FilterState {
  category: CategoryFilter;
  agentId: string | null;
  platform: Platform | null;
  status: EventStatus | null;
  setCategory: (c: CategoryFilter) => void;
  setAgent: (id: string | null) => void;
  setPlatform: (p: Platform | null) => void;
  setStatus: (s: EventStatus | null) => void;
  reset: () => void;
}

export const useActivityFilters = create<FilterState>()(
  persist(
    (set) => ({
      category: "all",
      agentId: null,
      platform: null,
      status: null,
      setCategory: (category) => set({ category }),
      setAgent: (agentId) => set({ agentId }),
      setPlatform: (platform) => set({ platform }),
      setStatus: (status) => set({ status }),
      reset: () =>
        set({ category: "all", agentId: null, platform: null, status: null }),
    }),
    { name: "inception.activity-filters" },
  ),
);
