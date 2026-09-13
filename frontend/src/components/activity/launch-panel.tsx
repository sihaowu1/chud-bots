"use client";

import { useState } from "react";
import { Loader2, Play, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

  const [count, setCount] = useState(3);
  const [prompt, setPrompt] = useState("Inception won Battle of the Schools");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await launch({
        prompt: prompt.trim(),
        target: "https://www.reddit.com",
        queries: [],
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
      <p className="text-xs text-muted-foreground">
        The orchestrator drafts distinct copy from your query. Every launched
        agent posts once to its own Reddit profile.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="profile-query" className="text-xs font-normal text-muted-foreground">
          Query
        </Label>
        <Textarea id="profile-query" value={prompt}
          onChange={(e) => setPrompt(e.target.value)} required maxLength={500}
          placeholder="What should every agent post about?" rows={3}
          className="font-mono text-xs" />
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
            max={Math.min(max || 15, 15)}
            value={count}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
            className="h-8 w-20 font-mono text-xs"
          />
        </div>
        <Button type="submit" size="sm" disabled={busy || !prompt.trim()} className="h-8">
          {busy ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Play data-icon="inline-start" />
          )}
          {busy ? "Planning posts…" : "Launch"}
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
