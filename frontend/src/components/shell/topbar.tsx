"use client";

import { useState } from "react";
import { Pause, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useSim } from "@/lib/store";
import { Kbd } from "@/components/shared/kbd";
import { Notifications } from "./notifications";
import { toast } from "@/components/shared/toast";

export function TopBar({ onOpenCommand }: { onOpenCommand: () => void }) {
  const paused = useSim((s) => s.paused);
  const setPaused = useSim((s) => s.setPaused);
  const deployed = useSim((s) => s.agentCount);
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
    <header className="flex h-12 shrink-0 items-center justify-end border-b border-border bg-background px-4">
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
            <AlertDialogTitle>Pause all {deployed} agents?</AlertDialogTitle>
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
