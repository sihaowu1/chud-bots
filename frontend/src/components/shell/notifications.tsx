"use client";

import { Bell } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useSim } from "@/lib/store";
import { RelativeTime } from "@/components/shared/relative-time";
import { StatusDot, type Tone } from "@/components/shared/status-dot";
import { cn } from "@/lib/utils";

const KIND_TONE: Record<string, Tone> = {
  review: "warning",
  info: "neutral",
  warning: "danger",
};

export function Notifications() {
  const notifications = useSim((s) => s.notifications);
  const markAllRead = useSim((s) => s.markAllRead);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <Popover onOpenChange={(o) => !o && unread > 0 && markAllRead()}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          className="relative text-muted-foreground"
        >
          <Bell strokeWidth={1.75} />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-signal" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
          <span className="text-xs font-medium">Notifications</span>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Mark all read
            </button>
          )}
        </div>
        <ul className="scroll-quiet max-h-80 overflow-y-auto">
          {notifications.length === 0 && (
            <li className="px-3.5 py-6 text-center text-xs text-muted-foreground">
              Nothing new.
            </li>
          )}
          {notifications.map((n) => (
            <li
              key={n.id}
              className={cn(
                "flex gap-2.5 border-b border-border px-3.5 py-2.5 last:border-0",
                !n.read && "bg-signal/[0.04]",
              )}
            >
              <StatusDot
                tone={KIND_TONE[n.kind] ?? "neutral"}
                size="xs"
                className="mt-1.5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-medium text-foreground">
                    {n.title}
                  </span>
                  <RelativeTime
                    ts={n.ts}
                    className="shrink-0 text-[11px] text-fg-subtle"
                  />
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {n.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
