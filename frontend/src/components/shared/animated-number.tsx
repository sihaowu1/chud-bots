"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  format?: (n: number) => string;
  className?: string;
  duration?: number;
}

/** Tweens between values so counters feel continuous instead of flickering. */
export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toLocaleString("en-US"),
  className,
  duration = 0.45,
}: Props) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    const controls = animate(from, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value, duration]);

  return <span className={cn("tnum", className)}>{format(display)}</span>;
}
