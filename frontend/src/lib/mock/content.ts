// Content pools used by the simulator. Enough variety that a five-minute
// demo doesn't visibly repeat.

export const SUBREDDITS = [
  "r/SaaS",
  "r/productivity",
  "r/startups",
  "r/smallbusiness",
  "r/Entrepreneur",
  "r/automation",
  "r/nocode",
  "r/operations",
  "r/artificial",
  "r/ecommerce",
  "r/marketing",
  "r/webdev",
  "r/Notion",
  "r/freelance",
];

/** Threads that are genuinely asking for something FlowPilot addresses. */
export const RELEVANT_THREADS: {
  title: string;
  intent: string;
  author: string;
  excerpt: string;
}[] = [
  {
    title: "How do you automate repetitive admin work?",
    intent: "Tool recommendation",
    author: "u/ops_marcy",
    excerpt:
      "We're a 6-person agency. I spend maybe 2 hours a day moving data between our CRM, invoicing tool and Slack. Zapier gets expensive fast and the zaps keep breaking. What are people using in 2026?",
  },
  {
    title: "Best alternatives to Zapier in 2026?",
    intent: "Alternative comparison",
    author: "u/dan_builds",
    excerpt:
      "Pricing just jumped again. I don't need 500 integrations, I need something that handles branching logic without a mess of paths. Open to AI-based tools if they actually work.",
  },
  {
    title: "Zapier pricing is getting out of hand — what are you switching to?",
    intent: "Alternative comparison",
    author: "u/lisa_founder",
    excerpt:
      "Went from $49 to $189/mo for the same workflows. Looked at Make and n8n. Anyone tried the newer AI agent tools for this?",
  },
  {
    title: "Looking for a tool to auto-triage support emails",
    intent: "Solution request",
    author: "u/supportlead",
    excerpt:
      "Small SaaS, ~200 tickets a week. Want something that reads, tags, and routes without me writing 40 rules.",
  },
  {
    title: "Anyone using AI agents for back-office ops?",
    intent: "Experience request",
    author: "u/finops_guy",
    excerpt:
      "Curious if anyone has actually replaced manual ops work with agents. Not looking for hype, looking for what worked.",
  },
  {
    title: "What's your stack for automating client onboarding?",
    intent: "Tool recommendation",
    author: "u/agency_kim",
    excerpt:
      "Contracts → folders → Slack channel → welcome email → kickoff calendar. Currently doing this by hand every single time.",
  },
  {
    title: "n8n vs Make for a 5-person team?",
    intent: "Alternative comparison",
    author: "u/tinyteamcto",
    excerpt:
      "Both look fine. The problem is maintenance — every time a form field changes something breaks. Is there something that just... adapts?",
  },
  {
    title: "I spend 2 hrs/day copying data between tools. Help.",
    intent: "Solution request",
    author: "u/burntout_ops",
    excerpt:
      "HubSpot → Sheets → QuickBooks → Notion. Not technical. Tried Zapier, gave up after week two.",
  },
  {
    title: "Recommendations for automating invoice follow-ups?",
    intent: "Tool recommendation",
    author: "u/freelance_jo",
    excerpt:
      "Need something that checks payment status, sends the right follow-up, escalates after 30 days. Bonus if it doesn't need a developer.",
  },
  {
    title: "How are small teams handling ops without hiring?",
    intent: "Experience request",
    author: "u/seedstage_sam",
    excerpt:
      "We're 4 people. Ops is eating founder time. What are you automating and with what?",
  },
  {
    title: "Is there anything that actually automates workflows end to end?",
    intent: "Solution request",
    author: "u/skeptical_pm",
    excerpt:
      "Every tool automates 80% and then I'm babysitting the last 20%. Genuinely asking if anything does the whole thing.",
  },
  {
    title: "Tired of building Zaps that break every week",
    intent: "Alternative comparison",
    author: "u/zapfatigue",
    excerpt:
      "Twelve zaps, three broke this week. Is this just the cost of automation or are there tools that handle change better?",
  },
  {
    title: "Automating Slack → Notion → Sheets, what do you use?",
    intent: "Tool recommendation",
    author: "u/notion_nerd",
    excerpt:
      "Weekly updates get posted in Slack, need them in a Notion db and summarized in a sheet. Tried Make, it's fine but fiddly.",
  },
  {
    title: "AI tools that are actually useful for operations?",
    intent: "Tool recommendation",
    author: "u/opsmanager_t",
    excerpt:
      "Not ChatGPT-writes-my-emails. Things that run a process. Lead routing, follow-ups, reporting. What's real?",
  },
  {
    title: "How do you keep CRM data clean without manual work?",
    intent: "Solution request",
    author: "u/revops_ana",
    excerpt:
      "Duplicates, missing fields, stale owners. We spend a day a month cleaning. Looking for something smarter than validation rules.",
  },
  {
    title: "Best way to automate weekly reporting?",
    intent: "Tool recommendation",
    author: "u/reporting_ray",
    excerpt:
      "Pull from Stripe, HubSpot and Sheets, write a summary, post to Slack every Monday. Currently 90 minutes of my life every week.",
  },
  {
    title: "Zapier alternative that handles branching logic well?",
    intent: "Alternative comparison",
    author: "u/logicbranch",
    excerpt:
      "Zapier paths are painful past 3 branches. Need something that can decide based on context, not just field values.",
  },
  {
    title: "Which automation tool for non-technical founders?",
    intent: "Tool recommendation",
    author: "u/nontech_nina",
    excerpt:
      "I can describe what I want in plain English. I cannot write JavaScript in a code step. What should I look at?",
  },
  {
    title: "Automating lead routing for a small sales team",
    intent: "Solution request",
    author: "u/sales_ops_ben",
    excerpt:
      "Inbound leads → enrich → score → assign → Slack ping. Three reps. Zapier quote was more than a rep's tooling budget.",
  },
  {
    title: "Any AI agents that can handle multi-step business processes?",
    intent: "Solution request",
    author: "u/process_pete",
    excerpt:
      "Specifically things with judgment calls in the middle. 'If the vendor's reply looks like a delay, escalate.' That kind of thing.",
  },
  {
    title: "What do you use to automate repetitive tasks for a small business?",
    intent: "Tool recommendation",
    author: "u/localbiz_lou",
    excerpt:
      "Appointment confirmations, review requests, inventory reorder emails. Currently a mix of reminders and me forgetting.",
  },
  {
    title: "Replacing a VA with automation — realistic?",
    intent: "Experience request",
    author: "u/solo_saas",
    excerpt:
      "My VA does inbox triage, calendar, and data entry. Can tooling do 70% of that today?",
  },
];

/** Threads that look promising by keyword but are not actually opportunities. */
export const IRRELEVANT_THREADS: { title: string; reason: string }[] = [
  {
    title: "Zapier stock — worth holding after the earnings call?",
    reason: "Not relevant · investing discussion",
  },
  {
    title: "Rant: my coworker uses Excel for literally everything",
    reason: "Venting, no request",
  },
  {
    title: "Automating my house lights with Home Assistant",
    reason: "Not relevant · home automation",
  },
  {
    title: "Selling my Zapier masterclass (50% off this week)",
    reason: "Promotional post",
  },
  {
    title: "[Hiring] Automation engineer, remote, US only",
    reason: "Job posting",
  },
  {
    title: "How do I cancel my Zapier subscription?",
    reason: "Support question, no intent",
  },
  {
    title: "Best keyboard for productivity?",
    reason: "Not relevant · hardware",
  },
  {
    title: "Workflow automation is overrated, change my mind",
    reason: "Debate thread · high risk",
  },
  {
    title: "Automated my entire job and got fired (long)",
    reason: "Story, too old (2y)",
  },
  { title: "Zapier vs Make megathread (2024)", reason: "Too old · archived" },
  {
    title: "Looking for enterprise RPA for 2,000 seats",
    reason: "Enterprise-only need",
  },
  {
    title: "AI agents are going to replace all of us",
    reason: "Speculative discussion",
  },
];

export const QUERIES = [
  "best alternatives to Zapier",
  "AI workflow automation",
  "automate repetitive business tasks",
  "automation for small business",
  "best tools for repetitive work",
  "Zapier too expensive",
  "n8n alternatives",
  "AI agents for operations",
  "automate admin tasks",
  "workflow automation small team",
  "make.com vs zapier",
  "automate client onboarding",
  "automate invoice follow ups",
  "AI tools for operations team",
];

/** Intent-specific draft templates. Every draft answers first and discloses. */
export const DRAFT_BY_INTENT: Record<string, string> = {
  "Tool recommendation":
    "Before picking a tool, write down the two or three steps in this process that currently need a human decision. That's what separates trigger-action tools (Zapier, Make) from agent-based ones.\n\nFor the decision steps I use FlowPilot (disclosure: I work on it). For pure triggers, Make is cheaper and fine. Happy to sketch the flow if you share the steps.",
  "Alternative comparison":
    "Depends what's actually breaking. If it's cost, Make or self-hosted n8n are the usual moves. If it's brittleness — flows failing whenever a field changes — that's where agent-based tools do better, because they reason about the record instead of mapping fields one-to-one.\n\nFlowPilot is the one I know best (I work on it). What's failing most often today?",
  "Solution request":
    "You can get most of the way with a normal automation tool plus one 'judgment' step. Trigger on the event; for the part that needs a decision, run a small agent to classify it before branching.\n\nI work on FlowPilot, which does this end-to-end. n8n with an LLM node is the DIY version. Either way, start with the single case that costs you the most time each week.",
  "Experience request":
    "What worked for us: automate the follow-up loops first (invoice chasing, onboarding checklists), because they have a clear state and a clear decision point.\n\nTooling: Zapier for the dumb triggers, FlowPilot (disclosure: I'm on the team) for steps with a judgment call. Biggest lesson was reviewing the first 20 runs by hand before trusting it.",
};

export function draftFor(intent: string) {
  return DRAFT_BY_INTENT[intent] ?? DRAFT_BY_INTENT["Tool recommendation"];
}
