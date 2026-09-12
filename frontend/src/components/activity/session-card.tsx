"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Square } from "lucide-react";
import type { BrowserAgent } from "@/lib/sessions/types";
import { STAGE_LABEL, STEPS, stageOf, stepIndex } from "@/lib/sessions/types";
import {
  StatusDot,
  TONE_TEXT,
  type Tone,
} from "@/components/shared/status-dot";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MockViewer } from "./mock-viewer";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<BrowserAgent["status"], Tone> = {
  queued: "muted",
  running: "signal",
  done: "success",
  failed: "danger",
  stopped: "muted",
};

const STATUS_LABEL: Record<BrowserAgent["status"], string> = {
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
  stopped: "Stopped",
};

interface Props {
  agent: BrowserAgent;
  onStop: (id: string) => void;
}

function SessionCardInner({ agent: a, onStop }: Props) {
  const stage = stageOf(a);
  const idx = stepIndex(stage);
  const live = a.session?.debug_url && a.session.status !== "released";
  const running = a.status === "running";
  const finished = !running && a.status !== "queued";

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border bg-surface",
        finished && "opacity-70",
      )}
    >
      <header className="flex h-10 items-center justify-between gap-3 px-3.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-mono text-[13px] font-medium">{a.persona}</span>
          <span className="truncate text-[11px] text-fg-subtle">
            {a.traits.join(" · ")}
          </span>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 text-xs",
            TONE_TEXT[STATUS_TONE[a.status]],
          )}
        >
          <StatusDot tone={STATUS_TONE[a.status]} pulse={running} size="xs" />
          {running ? STAGE_LABEL[stage] : STATUS_LABEL[a.status]}
        </span>
      </header>

      {/* viewer — Steel's live debug view when we have one, otherwise the sketch */}
      <div className="relative aspect-[16/10] border-y border-border bg-background">
        {live ? (
          <iframe
            title={`${a.persona} live session`}
            src={a.session!.debug_url!}
            allow="autoplay"
            loading="lazy"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <MockViewer agent={a} />
        )}
        {a.session && !live && a.session.status !== "released" && (
          <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white/75">
            simulated view
          </span>
        )}
      </div>

      {/* step strip */}
      <ol className="flex items-center gap-1 px-3.5 pt-3" aria-label="Progress">
        {STEPS.map((s, i) => {
          const state =
            i < idx || stage === "done"
              ? "done"
              : i === idx
                ? "current"
                : "todo";
          return (
            <li key={s.key} className="flex flex-1 items-center gap-1">
              <span className="flex flex-1 flex-col gap-1">
                <span
                  className={cn(
                    "h-[3px] rounded-full",
                    state === "done"
                      ? "bg-foreground/60"
                      : state === "current"
                        ? "bg-signal"
                        : "bg-foreground/10",
                  )}
                />
                <span
                  className={cn(
                    "text-[10px]",
                    state === "current"
                      ? "text-foreground"
                      : state === "done"
                        ? "text-muted-foreground"
                        : "text-fg-subtle",
                  )}
                >
                  {s.label}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="px-3.5 pb-3 pt-2">
        <p className="truncate text-xs text-foreground" title={a.note}>
          {a.note || (
            <span className="text-fg-subtle">Waiting for session…</span>
          )}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <span
            className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
            title={a.url ?? undefined}
          >
            {a.query ? `“${a.query}”` : "login only"}
            {a.url && (
              <>
                <span className="mx-1.5 text-fg-subtle">·</span>
                {a.url.replace(/^https?:\/\/(www\.)?/, "")}
              </>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-0.5">
            {a.session?.viewer_url && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={a.session.viewer_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded p-1 text-fg-subtle hover:bg-foreground/[0.06] hover:text-foreground"
                    aria-label="Open in Steel"
                  >
                    <ArrowUpRight className="size-3.5" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Open in Steel</TooltipContent>
              </Tooltip>
            )}
            {running && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onStop(a.id)}
                    className="rounded p-1 text-fg-subtle hover:bg-foreground/[0.06] hover:text-danger"
                    aria-label="Stop agent"
                  >
                    <Square className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Stop agent</TooltipContent>
              </Tooltip>
            )}
          </span>
        </div>
      </div>
    </motion.article>
  );
}

export const SessionCard = memo(SessionCardInner);
