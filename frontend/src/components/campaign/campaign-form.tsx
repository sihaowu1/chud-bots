"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSim } from "@/lib/store";
import { ENTITY_TYPES } from "@/lib/mock/campaign";
import type { EntityType } from "@/lib/types";
import { TagInput } from "./tag-input";
import { toast } from "@/components/shared/toast";
import { capacityFor } from "@/lib/mock/agents";
import { cn } from "@/lib/utils";

function FieldRow({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-6 py-4">
      <div className="pt-1.5">
        <Label
          htmlFor={htmlFor}
          className="text-[13px] font-normal text-foreground"
        >
          {label}
        </Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="max-w-[560px]">{children}</div>
    </div>
  );
}

function SectionTitle({
  n,
  title,
  subtitle,
}: {
  n: number;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border pb-3 pt-8 first:pt-0">
      <span className="font-mono text-[11px] text-fg-subtle">0{n}</span>
      <h2 className="text-[15px] font-medium tracking-[-0.01em]">{title}</h2>
      <span className="text-xs text-muted-foreground">{subtitle}</span>
    </div>
  );
}

const TYPE_LABEL: Partial<Record<EntityType, string>> = {
  Product: "Software Product",
};

export function CampaignForm() {
  const campaign = useSim((s) => s.campaign);
  const update = useSim((s) => s.updateCampaign);
  const agentCount = useSim((s) => s.agentCount);

  const [form, setForm] = useState({
    type: campaign.type,
    name: campaign.name,
    url: campaign.url,
    description: campaign.description,
    audience: campaign.audience.join(", "),
    whyCare: campaign.whyCare,
    problems: campaign.problems.join("\n"),
    searchIntent: campaign.searchIntent,
    topics: campaign.topics,
    related: campaign.related,
    avoid: campaign.avoid,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const [generating, setGenerating] = useState(false);
  const [strategy, setStrategy] = useState<null | {
    queries: { q: string; volume: string }[];
    communities: string[];
    approach: string[];
  }>(null);

  const generate = () => {
    setGenerating(true);
    setStrategy(null);
    setTimeout(() => {
      setStrategy({
        queries: [
          ...form.searchIntent.map((q, i) => ({
            q,
            volume: ["High", "High", "Medium", "Medium", "Low"][i % 5],
          })),
          { q: "n8n alternatives", volume: "Medium" },
          { q: "automate client onboarding", volume: "Low" },
        ],
        communities: [
          "r/SaaS",
          "r/productivity",
          "r/startups",
          "r/smallbusiness",
          "r/Entrepreneur",
          "r/nocode",
          "r/automation",
          "r/operations",
        ],
        approach: [
          "Lead with the answer; mention FlowPilot once, with disclosure.",
          "Prioritize threads asking for alternatives or naming Zapier.",
          "Skip communities that restrict vendor replies (r/zapier, r/sysadmin).",
          "Revisit every posted reply after 2h for follow-up questions.",
        ],
      });
      setGenerating(false);
    }, 1800);
  };

  const apply = () => {
    update({
      type: form.type,
      typeLabel: TYPE_LABEL[form.type] ?? form.type,
      name: form.name,
      url: form.url,
      description: form.description,
      audience: form.audience
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      whyCare: form.whyCare,
      problems: form.problems
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      searchIntent: strategy
        ? strategy.queries.map((q) => q.q)
        : form.searchIntent,
      topics: form.topics,
      related: form.related,
      avoid: form.avoid,
    });
    toast({
      title: "Strategy applied",
      description: "Strategy-01 is redistributing queries to the scouts.",
    });
  };

  const cap = capacityFor(agentCount);

  return (
    <div className="grid grid-cols-12 gap-8">
      <form
        className="col-span-12 xl:col-span-8"
        onSubmit={(e) => {
          e.preventDefault();
          generate();
        }}
      >
        <SectionTitle
          n={1}
          title="What is it?"
          subtitle="The thing you want people to find"
        />
        <div className="divide-y divide-border">
          <FieldRow label="Type">
            <div
              className="flex flex-wrap gap-1.5"
              role="radiogroup"
              aria-label="Entity type"
            >
              {ENTITY_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={form.type === t}
                  onClick={() => set("type", t)}
                  className={cn(
                    "h-7 rounded-md border px-2.5 text-xs transition-colors",
                    form.type === t
                      ? "border-foreground/60 bg-accent text-foreground"
                      : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </FieldRow>
          <FieldRow label="Name" htmlFor="name">
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="URL" htmlFor="url">
            <Input
              id="url"
              value={form.url}
              onChange={(e) => set("url", e.target.value)}
              className="font-mono"
            />
          </FieldRow>
          <FieldRow
            label="Description"
            htmlFor="desc"
            hint="One sentence. Agents quote this when relevant."
          >
            <Textarea
              id="desc"
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </FieldRow>
        </div>

        <SectionTitle
          n={2}
          title="Who is it for?"
          subtitle="Helps agents judge relevance"
        />
        <div className="divide-y divide-border">
          <FieldRow
            label="Who should discover this?"
            htmlFor="aud"
            hint="Comma-separated"
          >
            <Input
              id="aud"
              value={form.audience}
              onChange={(e) => set("audience", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Why would they care?" htmlFor="why">
            <Textarea
              id="why"
              rows={3}
              value={form.whyCare}
              onChange={(e) => set("whyCare", e.target.value)}
            />
          </FieldRow>
          <FieldRow
            label="What problems does it solve?"
            htmlFor="problems"
            hint="One per line"
          >
            <Textarea
              id="problems"
              rows={3}
              value={form.problems}
              onChange={(e) => set("problems", e.target.value)}
              className="font-mono text-xs"
            />
          </FieldRow>
        </div>

        <SectionTitle
          n={3}
          title="How should people find it?"
          subtitle="What agents search for and avoid"
        />
        <div className="divide-y divide-border">
          <FieldRow
            label="What should people be searching for?"
            hint="Target search intent. Press Enter to add."
          >
            <TagInput
              mono
              value={form.searchIntent}
              onChange={(v) => set("searchIntent", v)}
              placeholder="e.g. Zapier alternatives"
            />
          </FieldRow>
          <FieldRow label="Topics to associate with">
            <TagInput
              value={form.topics}
              onChange={(v) => set("topics", v)}
              placeholder="e.g. Workflow automation"
            />
          </FieldRow>
          <FieldRow
            label="Related products / projects"
            hint="Agents watch comparison threads naming these."
          >
            <TagInput
              value={form.related}
              onChange={(v) => set("related", v)}
              placeholder="e.g. Zapier"
            />
          </FieldRow>
          <FieldRow
            label="Topics to avoid"
            hint="Agents will never engage here."
          >
            <TagInput
              value={form.avoid}
              onChange={(v) => set("avoid", v)}
              placeholder="e.g. Crypto"
            />
          </FieldRow>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" disabled={generating}>
            {generating ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <Sparkles data-icon="inline-start" />
            )}
            {generating ? "Generating…" : "Generate Discoverability Strategy"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Nothing is deployed until you apply the strategy.
          </span>
        </div>
      </form>

      {/* Strategy output */}
      <aside className="col-span-12 xl:col-span-4">
        <div className="sticky top-5 rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-[13px] font-medium">
              Discoverability strategy
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Generated from the campaign above
            </p>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {generating ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3 px-5 py-5"
              >
                {[
                  "Reading campaign",
                  "Expanding search intent",
                  "Ranking communities",
                  "Estimating agent capacity",
                ].map((s, i) => (
                  <motion.div
                    key={s}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.35 }}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <Loader2 className="size-3 animate-spin text-fg-subtle" />
                    {s}…
                  </motion.div>
                ))}
              </motion.div>
            ) : strategy ? (
              <motion.div
                key="strategy"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="space-y-5 px-5 py-5">
                  <div>
                    <div className="label-xs">Discovery queries</div>
                    <ul className="mt-2 divide-y divide-border/60">
                      {strategy.queries.map((q) => (
                        <li
                          key={q.q}
                          className="flex items-center justify-between py-1.5 text-xs"
                        >
                          <span className="font-mono">“{q.q}”</span>
                          <span className="text-fg-subtle">
                            {q.volume} volume
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="label-xs">Communities to watch</div>
                    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5">
                      {strategy.communities.map((c) => (
                        <li key={c} className="font-mono text-foreground">
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="label-xs">Approach</div>
                    <ul className="mt-2 space-y-1.5">
                      {strategy.approach.map((a) => (
                        <li
                          key={a}
                          className="flex gap-2 text-xs text-muted-foreground"
                        >
                          <Check className="mt-0.5 size-3 shrink-0 text-success" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-md border border-border bg-background px-3.5 py-3 text-xs">
                    <div className="flex items-baseline justify-between">
                      <span className="text-muted-foreground">
                        Recommended swarm
                      </span>
                      <span className="font-mono text-foreground">
                        {agentCount} agents
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-muted-foreground">Estimated</span>
                      <span className="font-mono text-foreground">
                        {cap.discussionsPerHour}/hr · {cap.opportunitiesPerHour}{" "}
                        opps/hr
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-border px-5 py-3">
                  <Button size="sm" variant="ghost" onClick={generate}>
                    Regenerate
                  </Button>
                  <Button size="sm" onClick={apply}>
                    Apply strategy
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-5 py-10 text-center"
              >
                <p className="text-xs text-muted-foreground">
                  Fill in the campaign and generate a strategy to see suggested
                  queries, communities and approach.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>
    </div>
  );
}
