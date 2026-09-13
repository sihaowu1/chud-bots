"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionStatus } from "@/lib/sessions/types";

export const STATUS_FILTERS: { value: SessionStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "done", label: "Done" },
  { value: "failed", label: "Failed" },
  { value: "stopped", label: "Stopped" },
];

interface FilterState {
  status: SessionStatus | "all";
  persona: string | null;
  errorOnly: boolean;
  setStatus: (s: SessionStatus | "all") => void;
  setPersona: (p: string | null) => void;
  setErrorOnly: (v: boolean) => void;
  reset: () => void;
}

export const useActivityFilters = create<FilterState>()(
  persist(
    (set) => ({
      status: "all",
      persona: null,
      errorOnly: false,
      setStatus: (status) => set({ status }),
      setPersona: (persona) => set({ persona }),
      setErrorOnly: (errorOnly) => set({ errorOnly }),
      reset: () => set({ status: "all", persona: null, errorOnly: false }),
    }),
    { name: "inception.activity-filters" },
  ),
);
