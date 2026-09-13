"use client";

import { useState } from "react";
import { ArrowUpRight, Download, Loader2, Search, Square } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import {
  findingsFor,
  startDiscovery,
  stopDiscovery,
  useDiscovery,
} from "@/lib/analytics/discovery";

export default function OpportunitiesPage() {
  const { runs, loaded, error } = useDiscovery();
  const [prompt, setPrompt] = useState("");
  const [limit, setLimit] = useState(12);
  const [runId, setRunId] = useState("all");
  const [filter, setFilter] = useState("relevant");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const active = runs.find(
    (run) => run.status === "running" || run.status === "queued",
  );
  const scoped =
    runId === "all" ? runs : runs.filter((run) => run.id === runId);
  const findings = findingsFor(scoped);
  const visible = findings.filter(
    (item) =>
      (filter === "all" ||
        (filter === "relevant"
          ? item.relevant === true
          : item.relevant === false)) &&
      `${item.title} ${item.text} ${item.community}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const latest = scoped[0];

  async function action(work: () => Promise<void>) {
    setPending(true);
    setActionError(null);
    try {
      await work();
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(visible, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "reddit-opportunities.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-[1480px] space-y-5 px-4 py-5 sm:px-6">
      <PageHeader title="Discovery Opportunities" />
      <form
        className="space-y-3 border-y border-border py-4"
        onSubmit={(event) => {
          event.preventDefault();
          void action(() => startDiscovery(prompt.trim(), limit));
        }}
      >
        <label htmlFor="topic" className="text-xs font-medium">
          Research topic
        </label>
        <textarea
          id="topic"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          required
          minLength={3}
          maxLength={2000}
          rows={2}
          placeholder="Find discussions about organizing university hackathons in Canada"
          className="block w-full resize-y rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-signal"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Thread limit{" "}
            <input
              aria-label="Thread limit"
              type="number"
              min={1}
              max={30}
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="w-16 rounded border border-border bg-surface p-1.5 text-foreground"
            />
          </label>
          <button
            disabled={
              pending ||
              !!active ||
              prompt.trim().length < 3 ||
              !loaded ||
              !!error
            }
            type="submit"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-signal px-3 text-xs text-background disabled:opacity-40"
          >
            {pending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Search size={14} />
            )}
            Explore Reddit
          </button>
          {active && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void action(() => stopDiscovery(active.id))}
              className="inline-flex items-center gap-2 text-xs text-danger"
            >
              <Square size={13} />
              Stop
            </button>
          )}
          {active?.viewerUrl && (
            <a
              href={active.viewerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-signal"
            >
              Live browser <ArrowUpRight size={14} />
            </a>
          )}
        </div>
      </form>
      {(error || actionError) && (
        <p role="alert" className="text-sm text-danger">
          {actionError || error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Research run"
          value={runId}
          onChange={(event) => setRunId(event.target.value)}
          className="h-9 max-w-full rounded border border-border bg-surface px-2 text-xs sm:max-w-80"
        >
          <option value="all">All explorations</option>
          {runs.map((run) => (
            <option key={run.id} value={run.id}>
              {run.prompt.slice(0, 70)} - {run.status}
            </option>
          ))}
        </select>
        <input
          aria-label="Search scraped threads"
          placeholder="Search scraped threads"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-9 min-w-0 flex-1 rounded border border-border bg-surface px-3 text-xs"
        />
        <button
          aria-label="Export filtered findings"
          title="Export filtered findings"
          onClick={download}
          disabled={!visible.length}
          className="flex size-9 shrink-0 items-center justify-center rounded border border-border disabled:opacity-40"
        >
          <Download size={15} />
        </button>
      </div>
      {latest && (
        <div
          className="space-y-1 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <p className="break-words">
            <span
              className={
                latest.status === "failed" ? "text-danger" : "text-signal"
              }
            >
              {latest.status}
            </span>{" "}
            · {latest.prompt} · {latest.findings.length} scraped
          </p>
          {latest.error && <p className="text-danger">{latest.error}</p>}
          <details>
            <summary className="cursor-pointer">
              Run activity ({latest.events.length})
            </summary>
            <ol className="mt-2 max-h-44 space-y-1 overflow-auto">
              {latest.events.map((event, index) => (
                <li key={index} className="break-words">
                  <time>{new Date(event.ts).toLocaleTimeString()}</time> ·{" "}
                  {event.message}
                </li>
              ))}
            </ol>
          </details>
        </div>
      )}
      <div
        className="flex flex-wrap gap-4 border-b border-border"
        role="tablist"
        aria-label="Relevance filter"
      >
        {[
          ["relevant", "Relevant"],
          ["all", "All scraped"],
          ["rejected", "Not relevant"],
        ].map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
            className={`border-b-2 py-2 text-xs ${filter === value ? "border-signal text-foreground" : "border-transparent text-muted-foreground"}`}
          >
            {label}{" "}
            <span className="ml-1 font-mono">
              {
                findings.filter(
                  (item) =>
                    value === "all" ||
                    (value === "relevant"
                      ? item.relevant === true
                      : item.relevant === false),
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      {!loaded ? (
        <p role="status" className="py-12 text-center text-muted-foreground">
          Loading explorations...
        </p>
      ) : !visible.length ? (
        <p className="py-12 text-center text-muted-foreground">
          {active
            ? "Exploring Reddit..."
            : findings.length
              ? "No matching threads"
              : "No scraped threads yet"}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {visible.map((item) => (
            <article key={item.url} className="py-4">
              <div className="flex items-start justify-between gap-3">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 font-medium break-words hover:text-signal"
                >
                  {item.title}
                  <ArrowUpRight size={13} className="ml-1 inline" />
                </a>
                <span className="shrink-0 font-mono text-xs text-signal">
                  {item.score === null ? "Pending" : `${item.score}%`}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.community} · {item.author || "Unknown author"} ·{" "}
                {new Date(item.scrapedAt).toLocaleString()}
              </p>
              <p className="mt-2 break-words text-xs text-muted-foreground">
                {item.reason}
              </p>
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-signal">
                  Scraped text
                </summary>
                <p className="mt-3 whitespace-pre-wrap break-words text-muted-foreground">
                  {item.text}
                </p>
              </details>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
