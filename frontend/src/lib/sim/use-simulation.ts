"use client";

import { useEffect } from "react";
import { useSim } from "@/lib/store";

/**
 * Drives the mock simulation. Mount once in the app shell. Ticks at a random
 * 2–5s cadence so events feel organic rather than metronomic.
 */
export function useSimulation() {
  const hydrate = useSim((s) => s.hydrate);
  const tick = useSim((s) => s.tick);
  const demoMode = useSim((s) => s.demoMode);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!demoMode) return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const loop = () => {
      if (cancelled) return;
      tick();
      timer = setTimeout(loop, 2000 + Math.random() * 3000);
    };
    timer = setTimeout(loop, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [demoMode, tick]);

  // Occasional simulated connection hiccup so the connection state is visible.
  const setConnection = useSim((s) => s.setConnection);
  useEffect(() => {
    if (!demoMode) return;
    const t = setInterval(() => {
      if (Math.random() < 0.08) {
        setConnection("reconnecting");
        setTimeout(
          () => setConnection("connected"),
          2500 + Math.random() * 2000,
        );
      }
    }, 45000);
    return () => clearInterval(t);
  }, [demoMode, setConnection]);
}
