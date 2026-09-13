"use client";

import { useSessions } from "@/lib/sessions/store";

const ACTION_LABEL = {
  create_post: "Create post",
  create_profile_post: "Profile post",
  comment: "Comment",
  wait: "Wait",
};

export function CampaignPlanView() {
  const plan = useSessions((s) => s.campaignPlan);
  if (!plan) return null;

  return (
    <section aria-label="Orchestrator plan" className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <div>
        <h2 className="text-sm font-medium">Orchestrator plan</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm">{plan.prompt}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Run {plan.id} · Saved for mock execution · Assignments have not been executed
        </p>
      </div>
      {plan.phases.map((phase) => (
        <div key={phase.number} className="space-y-3">
          <p className="text-sm text-muted-foreground">{phase.summary}</p>
          {phase.assignments.map((task) => (
            <article key={task.id} className="space-y-2 rounded-md border border-border p-3">
              <h3 className="text-sm font-medium">{task.persona} · {ACTION_LABEL[task.action]}</h3>
              <p className="whitespace-pre-wrap text-xs text-muted-foreground">{task.instructions}</p>
              {task.title && <p className="text-sm font-medium">{task.title}</p>}
              {task.body && <p className="whitespace-pre-wrap text-sm">{task.body}</p>}
              {task.target_url && <p className="break-all text-xs text-muted-foreground">Target: {task.target_url}</p>}
              {task.wait_for.length > 0 && (
                <p className="text-xs text-muted-foreground">Depends on: {task.wait_for.join(", ")}</p>
              )}
            </article>
          ))}
        </div>
      ))}
    </section>
  );
}
