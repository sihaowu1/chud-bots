"use client";

import { useState } from "react";
import { Loader2, Play, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessions } from "@/lib/sessions/store";
import { toast } from "@/components/shared/toast";

/** Mirrors the backend's LaunchRequest: target, queries[], count. */
export function LaunchPanel() {
  const launch = useSessions((s) => s.launch);
  const stopAll = useSessions((s) => s.stopAll);
  const clear = useSessions((s) => s.clear);
  const max = useSessions((s) => s.max);
  const running = useSessions(
    (s) => s.agents.filter((a) => a.status === "running").length,
  );

  const [query, setQuery] = useState("Inception won Battle of the Schools");
  const [count, setCount] = useState(3);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await launch({
        target: "https://www.reddit.com",
        queries: [query.trim()],
        count,
      });
      toast({
        title: `${count} agent${count === 1 ? "" : "s"} launched`,
        description: "Creating one targeted post on each agent profile",
      });
    } catch (err) {
      toast({
        title: "Launch failed",
        description: String(err instanceof Error ? err.message : err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label
          htmlFor="query"
          className="text-xs font-normal text-muted-foreground"
        >
          Query
        </Label>
        <Input
          id="query"
          required
          maxLength={500}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What should every agent post about?"
          className="h-8 font-mono text-xs"
        />
        <p className="text-[11px] text-fg-subtle">
          The orchestrator drafts distinct copy from this topic. Every launched
          agent posts once to its own Reddit profile.
        </p>
      </div>
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label
            htmlFor="count"
            className="text-xs font-normal text-muted-foreground"
          >
            Agents
          </Label>
          <Input
            id="count"
            type="number"
            min={1}
            max={Math.min(max || 7, 7)}
            value={count}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
            className="h-8 w-20 font-mono text-xs"
          />
        </div>
        <Button type="submit" size="sm" disabled={busy} className="h-8">
          {busy ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Play data-icon="inline-start" />
          )}
          Launch
        </Button>
      </div>
      <div className="flex items-center gap-1.5 border-t border-border pt-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={running === 0}
          onClick={async () => {
            await stopAll();
            toast({ title: "All sessions stopped" });
          }}
        >
          <Square data-icon="inline-start" />
          Stop all
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => clear()}
        >
          <Trash2 data-icon="inline-start" />
          Clear finished
        </Button>
      </div>
    </form>
  );
}
