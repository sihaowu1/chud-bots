"use client";

import { useSessions } from "@/lib/sessions/store";
import { clock } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SessionLog({ className }: { className?: string }) {
  const logs = useSessions((s) => s.logs);
  return (
    <ol className={cn("scroll-quiet overflow-y-auto", className)}>
      {logs.length === 0 && (
        <li className="px-4 py-6 text-center text-xs text-fg-subtle">
          No session events yet.
        </li>
      )}
      {logs.map((l) => (
        <li
          key={l.id}
          className="grid grid-cols-[56px_minmax(0,1fr)] gap-2 px-4 py-1 text-[11px] leading-4"
        >
          <span className="font-mono text-fg-subtle tnum">{clock(l.ts)}</span>
          <span
            className={cn(
              "break-words",
              l.error ? "text-danger" : "text-muted-foreground",
            )}
          >
            {l.persona && (
              <span className="font-mono text-foreground">
                {l.persona}
                {l.level !== undefined && (
                  <span className="text-fg-subtle"> L{l.level}</span>
                )}{" "}
              </span>
            )}
            {l.msg}
            {l.url && (
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="ml-1.5 text-signal hover:underline"
              >
                View post
              </a>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
