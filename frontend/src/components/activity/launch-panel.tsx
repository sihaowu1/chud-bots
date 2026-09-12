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

  const [subreddit, setSubreddit] = useState("SaaS");
  const [queries, setQueries] = useState(
    "best alternatives to Zapier\nAI workflow automation",
  );
  const [count, setCount] = useState(3);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const sub = subreddit
      .trim()
      .replace(/^https?:\/\/(?:www\.)?reddit\.com\/r\//i, "")
      .replace(/^\/?r\//i, "")
      .replace(/^\/+|\/+$/g, "");
    try {
      await launch({
        target: sub
          ? `https://www.reddit.com/r/${encodeURIComponent(sub)}`
          : "https://www.reddit.com",
        queries: queries
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        count,
      });
      toast({
        title: `${count} agent${count === 1 ? "" : "s"} launched`,
        description: sub ? `Target r/${sub}` : "Login only",
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
          htmlFor="sub"
          className="text-xs font-normal text-muted-foreground"
        >
          Target subreddit <span className="text-fg-subtle">(optional)</span>
        </Label>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-fg-subtle">r/</span>
          <Input
            id="sub"
            value={subreddit}
            onChange={(e) => setSubreddit(e.target.value)}
            placeholder="SaaS"
            className="h-8 font-mono text-xs"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor="queries"
          className="text-xs font-normal text-muted-foreground"
        >
          Search queries{" "}
          <span className="text-fg-subtle">
            (one per line; blank = login only)
          </span>
        </Label>
        <Textarea
          id="queries"
          rows={3}
          value={queries}
          onChange={(e) => setQueries(e.target.value)}
          className="font-mono text-xs"
        />
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
            max={max || 50}
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
