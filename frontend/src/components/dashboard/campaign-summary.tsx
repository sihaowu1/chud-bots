"use client";

import Link from "next/link";
import { ArrowUpRight, Pencil, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSim } from "@/lib/store";
import { Panel, SectionHeader } from "@/components/shared/section";
import { cn } from "@/lib/utils";

export function CampaignSummary({ className }: { className?: string }) {
  const c = useSim((s) => s.campaign);

  return (
    <Panel className={cn("flex flex-col", className)}>
      <div className="px-5 pt-4">
        <SectionHeader
          size="lg"
          title="What do you want people to discover?"
          actions={
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href="/campaign">
                  <Pencil data-icon="inline-start" />
                  Edit
                </Link>
              </Button>
              <Button size="sm" variant="outline">
                <Repeat data-icon="inline-start" />
                Change campaign
              </Button>
            </>
          }
        />
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="flex items-baseline gap-3">
          <h3 className="text-[17px] font-medium tracking-[-0.015em]">
            {c.name}
          </h3>
          <span className="text-xs text-muted-foreground">{c.typeLabel}</span>
          <a
            href={`https://${c.url}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            {c.url}
            <ArrowUpRight className="size-3" />
          </a>
        </div>
        <p className="mt-1.5 max-w-[56ch] text-[13px] text-muted-foreground">
          “{c.description}”
        </p>

        <div className="mt-4 border-t border-border pt-4">
          <div className="label-xs">Target search intent</div>
          <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
            {c.searchIntent.map((q) => (
              <li key={q} className="font-mono text-xs text-foreground">
                “{q}”
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
