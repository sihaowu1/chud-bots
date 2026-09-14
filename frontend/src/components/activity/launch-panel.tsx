"use client";

import { useState } from "react";
import { Loader2, Play, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSessions } from "@/lib/sessions/store";
import { toast } from "@/components/shared/toast";

/** Sends the dashboard query to the orchestrator. */
export function LaunchPanel() {
  const planCampaign = useSessions((s) => s.planCampaign);
  const executeCampaign = useSessions((s) => s.executeCampaign);
  const stopAll = useSessions((s) => s.stopAll);
  const clear = useSessions((s) => s.clear);
  const running = useSessions(
    (s) => s.agents.filter((a) => a.status === "running").length,
  );

  const [count, setCount] = useState(3);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const query = prompt.trim();
    try {
      const plan = await planCampaign({ prompt: query, count });
      const result = await executeCampaign(plan.id);
      const assignments = result.phases.flatMap((phase) => phase.assignments);
      const hasBrowserTasks = assignments.some((task) => task.action !== "wait");
      toast({
        title: hasBrowserTasks ? "Campaign executed" : "Agents are idle",
        description: hasBrowserTasks
          ? "Review the completed assignments on the dashboard"
          : `Selected agents are signed in and idle. ${assignments[0]?.instructions || "The planner returned no assignments."}`,
      });
    } catch (err) {
      toast({
        title: "Campaign failed",
        description: String(err instanceof Error ? err.message : err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs text-muted-foreground">
        The orchestrator uses your query and agent history to assign posts,
        comments, or waits, then executes the plan with Steel browser sessions.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="profile-query" className="text-xs font-normal text-muted-foreground">
          Query
        </Label>
        <Textarea id="profile-query" value={prompt}
          onChange={(e) => setPrompt(e.target.value)} required maxLength={2000}
          placeholder="What should the campaign accomplish?" rows={3}
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
            max={15}
            value={count}
            onChange={(e) => setCount(Math.min(15, Math.max(1, Number(e.target.value) || 1)))}
            className="h-8 w-20 font-mono text-xs"
          />
        </div>
        <Button type="submit" size="sm" disabled={busy || !prompt.trim()} className="h-8">
          {busy ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Play data-icon="inline-start" />
          )}
          {busy ? "Executing..." : "Create plan + execute"}
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
