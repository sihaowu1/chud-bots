"use client";

import { Check } from "lucide-react";
import type { EventStatus } from "@/lib/types";
import { StatusDot, TONE_TEXT, type Tone } from "./status-dot";
import { cn } from "@/lib/utils";

const META: Record<
  EventStatus,
  { label: string; tone: Tone; pulse?: boolean; check?: boolean }
> = {
  searching: { label: "Searching", tone: "signal", pulse: true },
  analyzing: { label: "Analyzing", tone: "signal", pulse: true },
  new: { label: "New", tone: "signal" },
  complete: { label: "Complete", tone: "success", check: true },
  allowed: { label: "Allowed", tone: "success", check: true },
  blocked: { label: "Blocked", tone: "danger" },
  rejected: { label: "Rejected", tone: "muted" },
  review: { label: "In review", tone: "warning" },
  updated: { label: "Updated", tone: "neutral" },
  detected: { label: "Detected", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  error: { label: "Error", tone: "danger" },
  info: { label: "Info", tone: "muted" },
};

export function eventStatusMeta(status: EventStatus) {
  return META[status];
}

export function EventStatusBadge({
  status,
  className,
  animateCheck,
}: {
  status: EventStatus;
  className?: string;
  animateCheck?: boolean;
}) {
  const m = META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs whitespace-nowrap",
        TONE_TEXT[m.tone],
        className,
      )}
    >
      {m.check ? (
        <Check
          className={cn("size-3", animateCheck && "animate-check-in")}
          strokeWidth={2.5}
        />
      ) : (
        <StatusDot tone={m.tone} pulse={m.pulse} size="xs" />
      )}
      {m.label}
    </span>
  );
}
