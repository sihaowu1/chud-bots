"use client";

import { useState } from "react";
import { ChevronDown, Pause, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSim, selectActiveCount } from "@/lib/store";
import { OTHER_CAMPAIGNS } from "@/lib/mock/campaign";
import { StatusDot } from "@/components/shared/status-dot";
import { LiveIndicator } from "@/components/shared/live-indicator";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { Kbd } from "@/components/shared/kbd";
import { Notifications } from "./notifications";
import { toast } from "@/components/shared/toast";

export function TopBar({ onOpenCommand }: { onOpenCommand: () => void }) {
  const campaign = useSim((s) => s.campaign);
  const paused = useSim((s) => s.paused);
  const setPaused = useSim((s) => s.setPaused);
  const active = useSim(selectActiveCount);
  const total = useSim((s) => s.agents.length);
  const [confirm, setConfirm] = useState(false);

  const pauseAll = () => {
    setPaused(true);
    setConfirm(false);
    toast({
      title: "All agents paused",
      description: "No searches, drafts or posts until you resume.",
      action: { label: "Undo", onClick: () => setPaused(false) },
    });
  };

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-7 items-center gap-2 rounded-md px-2 text-[13px] transition-colors hover:bg-accent/60">
              <span className="font-medium text-foreground">
                {campaign.name}
              </span>
              <span className="text-fg-subtle">{campaign.typeLabel}</span>
              <ChevronDown className="size-3.5 text-fg-subtle" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
              Campaigns
            </DropdownMenuLabel>
            {OTHER_CAMPAIGNS.map((c) => (
              <DropdownMenuItem
                key={c.id}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex items-center gap-2">
                  <StatusDot
                    tone={
                      c.status === "running"
                        ? "success"
                        : c.status === "paused"
                          ? "warning"
                          : "muted"
                    }
                    size="xs"
                  />
                  <span>{c.name}</span>
                </span>
                <span className="text-[11px] text-fg-subtle">
                  {c.typeLabel}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem>New campaign…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="h-4 w-px bg-border-strong" />

        <LiveIndicator />

        <span className="h-4 w-px bg-border-strong" />

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <AnimatedNumber
                value={paused ? 0 : active}
                className="font-mono text-foreground"
              />
              <span>/ {total} agents active</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Agents currently searching, analyzing, writing or monitoring
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={onOpenCommand}
          className="mr-1 flex h-7 items-center gap-2 rounded-md border border-border bg-surface px-2 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
        >
          <Search className="size-3.5" />
          <span className="hidden pr-3 xl:inline">Search or jump to…</span>
          <Kbd>⌘K</Kbd>
        </button>

        <Notifications />

        {paused ? (
          <Button size="sm" onClick={() => setPaused(false)} className="ml-1">
            <Play data-icon="inline-start" />
            Resume agents
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirm(true)}
            className="ml-1"
          >
            <Pause data-icon="inline-start" />
            Pause all agents
          </Button>
        )}
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause all {total} agents?</AlertDialogTitle>
            <AlertDialogDescription>
              In-flight searches will finish, but no new discussions will be
              scanned, no drafts written and nothing posted until you resume.
              Drafts already in review are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={pauseAll}>
              Pause all agents
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
