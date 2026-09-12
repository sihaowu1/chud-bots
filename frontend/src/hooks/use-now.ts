"use client";

import { useEffect, useState } from "react";

/** A clock that ticks every `interval` ms. Use for relative timestamps. */
export function useNow(interval = 10000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}
