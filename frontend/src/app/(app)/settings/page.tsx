"use client";

import { useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
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
import { PageHeader } from "@/components/shared/page-header";
import { StatusDot } from "@/components/shared/status-dot";
import { Kbd } from "@/components/shared/kbd";
import { toast } from "@/components/shared/toast";
import { MAX_AGENTS } from "@/lib/mock/agents";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-[240px_minmax(0,1fr)] gap-8 border-b border-border py-8 first:pt-0 last:border-0">
      <div>
        <h2 className="text-[13px] font-medium">{title}</h2>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="max-w-[560px] divide-y divide-border">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3 first:pt-0 last:pb-0">
      <div>
        <div className="text-[13px] text-foreground">{label}</div>
        {hint && (
          <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const demoMode = useSim((s) => s.demoMode);
  const setDemoMode = useSim((s) => s.setDemoMode);
  const connection = useSim((s) => s.connection);
  const setConnection = useSim((s) => s.setConnection);
  const autoOptimize = useSim((s) => s.autoOptimize);
  const setAutoOptimize = useSim((s) => s.setAutoOptimize);
  const [approval, setApproval] = useState(true);
  const [notifyReview, setNotifyReview] = useState(true);
  const [notifyPause, setNotifyPause] = useState(true);
  const [notifyReplies, setNotifyReplies] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-12 pt-5">
      <PageHeader
        title="Settings"
        description="Workspace, agent behaviour and demo controls"
      />

      <div className="mt-8">
        <Section
          title="Agent behaviour"
          description="Guardrails that apply to every agent in this campaign."
        >
          <Row
            label="Require approval before posting"
            hint="Drafts always wait for you. Turning this off lets Writer agents post automatically after a policy check."
          >
            <Switch checked={approval} onCheckedChange={setApproval} />
          </Row>
          <Row
            label="Optimize allocation automatically"
            hint="Strategy-01 may move agents between roles."
          >
            <Switch checked={autoOptimize} onCheckedChange={setAutoOptimize} />
          </Row>
          <Row label="Maximum agents" hint={`Plan limit is ${MAX_AGENTS}.`}>
            <Input
              defaultValue={String(MAX_AGENTS)}
              className="w-20 font-mono text-right"
            />
          </Row>
          <Row
            label="Always include disclosure"
            hint="Adds an affiliation note to every contribution."
          >
            <Switch checked disabled />
          </Row>
        </Section>

        <Section
          title="Platforms"
          description="Where agents can search and contribute."
        >
          <Row label="Reddit" hint="u/flowpilot_team · read + comment">
            <span className="inline-flex items-center gap-1.5 text-xs text-success">
              <StatusDot tone="success" size="xs" />
              Connected
            </span>
          </Row>
          <Row label="Hacker News" hint="Search only">
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast({ title: "Not available in the demo" })}
            >
              Connect
            </Button>
          </Row>
          <Row label="X" hint="Search only">
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast({ title: "Not available in the demo" })}
            >
              Connect
            </Button>
          </Row>
        </Section>

        <Section title="Notifications">
          <Row label="Draft ready for review">
            <Switch checked={notifyReview} onCheckedChange={setNotifyReview} />
          </Row>
          <Row label="Agent paused by a community restriction">
            <Switch checked={notifyPause} onCheckedChange={setNotifyPause} />
          </Row>
          <Row label="New replies on posted contributions">
            <Switch
              checked={notifyReplies}
              onCheckedChange={setNotifyReplies}
            />
          </Row>
        </Section>

        <Section
          title="Demo mode"
          description="This build runs on simulated agents and mock data. Nothing reaches Reddit."
        >
          <Row
            label="Simulate agent activity"
            hint="Generates events every 2–5 seconds."
          >
            <Switch checked={demoMode} onCheckedChange={setDemoMode} />
          </Row>
          <Row
            label="Connection"
            hint="Simulate a dropped connection to see the reconnecting state."
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <StatusDot
                  tone={
                    connection === "connected"
                      ? "success"
                      : connection === "reconnecting"
                        ? "warning"
                        : "danger"
                  }
                  size="xs"
                />
                {connection === "connected"
                  ? "Connected"
                  : connection === "reconnecting"
                    ? "Reconnecting"
                    : "Offline"}
              </span>
              {connection === "connected" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setConnection("reconnecting");
                    setTimeout(() => setConnection("connected"), 4000);
                  }}
                >
                  <WifiOff data-icon="inline-start" />
                  Drop
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConnection("connected")}
                >
                  <Wifi data-icon="inline-start" />
                  Restore
                </Button>
              )}
            </div>
          </Row>
        </Section>

        <Section title="Keyboard shortcuts">
          <Row label="Command palette">
            <Kbd>⌘K</Kbd>
          </Row>
          <Row label="Go to Dashboard / Activity / Logs / Opportunities">
            <span className="flex items-center gap-1">
              <Kbd>G</Kbd>
              <span className="text-xs text-fg-subtle">then</span>
              <Kbd>D</Kbd>
              <Kbd>A</Kbd>
              <Kbd>L</Kbd>
              <Kbd>O</Kbd>
            </span>
          </Row>
          <Row label="Next / previous opportunity">
            <span className="flex items-center gap-1">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd>
            </span>
          </Row>
          <Row label="Approve selected opportunity">
            <Kbd>A</Kbd>
          </Row>
        </Section>

        <Section title="Danger zone">
          <Row
            label="Delete campaign"
            hint="Stops all agents and removes history. Cannot be undone."
          >
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
            >
              Delete campaign
            </Button>
          </Row>
        </Section>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete FlowPilot AI campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              All 12 agents will be stopped, 47 opportunities and every draft
              will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDelete(false);
                toast({
                  title: "Not available in the demo",
                  description: "Campaign deletion is disabled.",
                });
              }}
            >
              Delete campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
