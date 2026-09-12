"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  RefreshCw,
  SkipForward,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import type { Opportunity } from "@/lib/types";
import { useSim } from "@/lib/store";
import { Field } from "@/components/shared/section";
import { Score } from "@/components/shared/score";
import { RelativeTime } from "@/components/shared/relative-time";
import { toast } from "@/components/shared/toast";
import { Kbd } from "@/components/shared/kbd";
import { OpportunityStatusBadge, ActivityMeter } from "./opportunity-table";
import { cn } from "@/lib/utils";

function riskTone(v: number) {
  return v < 15 ? "text-success" : v < 30 ? "text-warning" : "text-danger";
}

function Meter({ value, invert }: { value: number; invert?: boolean }) {
  // invert: low is good (risk metrics)
  const tone = invert
    ? value < 15
      ? "bg-success"
      : value < 30
        ? "bg-warning"
        : "bg-danger"
    : value >= 85
      ? "bg-foreground"
      : "bg-foreground/60";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative h-[3px] w-16 overflow-hidden rounded-full bg-foreground/10">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", tone)}
          style={{ width: `${value}%` }}
        />
      </span>
      <span
        className={cn(
          "font-mono text-xs tnum",
          invert ? riskTone(value) : "text-foreground",
        )}
      >
        {value}%
      </span>
    </span>
  );
}

/** Mount with `key={opportunity.id}` so local edit state resets per opportunity. */
export function OpportunityPanel({
  opportunity: o,
}: {
  opportunity: Opportunity;
}) {
  const setStatus = useSim((s) => s.setOpportunityStatus);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(o.suggestedResponse);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);

  const approve = () => {
    setStatus(o.id, "approved");
    setConfirmApprove(false);
    toast({
      title: "Response approved",
      description: `Writer-01 will post to ${o.community} shortly.`,
      action: { label: "Undo", onClick: () => setStatus(o.id, "review") },
    });
  };

  const skip = () => {
    const prev = o.status;
    setStatus(o.id, "skipped");
    toast({
      title: "Opportunity skipped",
      description: "Agents will not engage with this thread.",
      action: { label: "Undo", onClick: () => setStatus(o.id, prev) },
    });
  };

  const regenerate = () => {
    setRegenerating(true);
    setTimeout(() => {
      setDraft(
        (d) =>
          d.replace(/^/, "").trim() +
          "\n\nEdit: happy to share a concrete example if useful.",
      );
      setRegenerating(false);
      toast({
        title: "Draft regenerated",
        description: "Writer-01 produced a new version.",
      });
    }, 1400);
  };

  const rules = o.analysis.communityRules;
  const canAct = o.status === "new" || o.status === "review";

  return (
    <div className="flex h-full flex-col">
      <div className="scroll-quiet min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {/* Original discussion */}
        <section>
          <div className="flex items-center justify-between">
            <div className="label-xs">Original discussion</div>
            <a
              href="#"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={(e) => e.preventDefault()}
            >
              Open on Reddit
              <ArrowUpRight className="size-3" />
            </a>
          </div>
          <div className="mt-2 rounded-md border border-border bg-background px-3.5 py-3">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono text-foreground">{o.community}</span>
              <span className="text-fg-subtle">·</span>
              <span>{o.author}</span>
              <span className="text-fg-subtle">·</span>
              <RelativeTime ts={o.createdAt} />
            </div>
            <p className="mt-1.5 text-[13px] font-medium text-foreground">
              {o.title}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              {o.excerpt}
            </p>
          </div>
        </section>

        {/* Decision summary */}
        <section className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Field label="Detected intent">{o.intent}</Field>
          <Field label="Entity relevance">
            <Score value={o.relevance} bar />
          </Field>
          <Field label="Why it matches" className="col-span-2">
            <p className="text-muted-foreground">{o.analysis.whyMatch}</p>
          </Field>
          <Field label="Status">
            <OpportunityStatusBadge status={o.status} />
          </Field>
          <Field label="Activity">
            <ActivityMeter level={o.activity} />
          </Field>
        </section>

        {/* Progressive disclosure: full analysis */}
        <section>
          <button
            onClick={() => setShowAnalysis((v) => !v)}
            className="flex w-full items-center justify-between text-left"
            aria-expanded={showAnalysis}
          >
            <span className="label-xs">Policy &amp; risk analysis</span>
            <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Spam{" "}
              <span className={cn("font-mono", riskTone(o.analysis.spamRisk))}>
                {o.analysis.spamRisk}%
              </span>
              <span className="text-fg-subtle">·</span>
              Promo{" "}
              <span
                className={cn("font-mono", riskTone(o.analysis.promoIntensity))}
              >
                {o.analysis.promoIntensity}%
              </span>
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform duration-200",
                  showAnalysis && "rotate-180",
                )}
              />
            </span>
          </button>
          <AnimatePresence initial={false}>
            {showAnalysis && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-3 divide-y divide-border border-t border-border">
                  <Field label="Entity relevance" inline>
                    <Meter value={o.analysis.entityRelevance} />
                  </Field>
                  <Field label="Spam risk" inline>
                    <Meter value={o.analysis.spamRisk} invert />
                  </Field>
                  <Field label="Promotional intensity" inline>
                    <Meter value={o.analysis.promoIntensity} invert />
                  </Field>
                  <Field label="Product mentions" inline>
                    <span
                      className={
                        rules.allowsProductMentions
                          ? "text-success"
                          : "text-danger"
                      }
                    >
                      {rules.allowsProductMentions ? "Allowed" : "Restricted"}
                    </span>
                  </Field>
                  <Field label="Disclosure" inline>
                    {rules.requiresDisclosure ? "Required" : "Not required"}
                  </Field>
                  <div className="py-2 text-xs text-muted-foreground">
                    {rules.note}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Suggested response */}
        {o.suggestedResponse && (
          <section>
            <div className="flex items-center justify-between">
              <div className="label-xs">Suggested response</div>
              <span className="text-[11px] text-fg-subtle">
                Writer-01 · {draft.split(/\s+/).length} words
              </span>
            </div>
            <div className="relative mt-2">
              {editing ? (
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={9}
                  className="resize-y text-[13px] leading-5"
                  autoFocus
                />
              ) : (
                <div
                  className={cn(
                    "whitespace-pre-wrap rounded-md border border-border bg-background px-3.5 py-3 text-[13px] leading-5 text-foreground transition-opacity",
                    regenerating && "opacity-40",
                  )}
                >
                  {draft}
                </div>
              )}
              {regenerating && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="flex items-center gap-2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-muted-foreground shadow-md">
                    <RefreshCw className="size-3 animate-spin" />
                    Regenerating…
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {o.engagement && (
          <section className="grid grid-cols-2 gap-x-6">
            <Field label="Replies">
              <span className="font-mono">{o.engagement.replies}</span>
            </Field>
            <Field label="Votes">
              <span className="font-mono">+{o.engagement.votes}</span>
            </Field>
          </section>
        )}
      </div>

      {/* Actions */}
      {canAct && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              onClick={() => setConfirmApprove(true)}
              disabled={regenerating}
            >
              <Check data-icon="inline-start" />
              Approve
              <Kbd className="ml-1 border-primary-foreground/20 bg-transparent text-primary-foreground/70">
                A
              </Kbd>
            </Button>
            {editing ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEditing(false)}
              >
                Done
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
                disabled={regenerating}
              >
                <Pencil data-icon="inline-start" />
                Edit
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={regenerate}
              disabled={regenerating}
            >
              <RefreshCw
                data-icon="inline-start"
                className={cn(regenerating && "animate-spin")}
              />
              Regenerate
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={skip}
          >
            <SkipForward data-icon="inline-start" />
            Skip
          </Button>
        </div>
      )}

      <AlertDialog open={confirmApprove} onOpenChange={setConfirmApprove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Post this reply to {o.community}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Writer-01 will post the suggested response as a reply to{" "}
              {o.author}. This is public and visible immediately. Disclosure is
              included.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={approve}>
              Approve and post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
