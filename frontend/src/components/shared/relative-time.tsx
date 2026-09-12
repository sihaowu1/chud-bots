"use client";

import { useNow } from "@/hooks/use-now";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";

export function RelativeTime({
  ts,
  className,
}: {
  ts: number;
  className?: string;
}) {
  const now = useNow(10000);
  return (
    <time
      dateTime={new Date(ts).toISOString()}
      title={new Date(ts).toLocaleString()}
      className={cn("tnum", className)}
    >
      {relative(ts, now)}
    </time>
  );
}
