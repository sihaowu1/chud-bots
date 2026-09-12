import type { Opportunity } from "@/lib/types";

const m = (n: number) => n * 60 * 1000;
const h = (n: number) => n * 60 * 60 * 1000;

/** Built at hydration time so timestamps are relative to the client clock. */
export function buildOpportunities(now: number): Opportunity[] {
  return [
    {
      id: "opp_001",
      platform: "reddit",
      community: "r/productivity",
      title: "How do you automate repetitive admin tasks?",
      author: "u/ops_marcy",
      excerpt:
        "We're a 6-person agency. I spend maybe 2 hours a day moving data between our CRM, invoicing tool and Slack. Zapier gets expensive fast and the zaps keep breaking. What are people using in 2026?",
      intent: "Tool recommendation",
      relevance: 96,
      activity: "high",
      createdAt: now - m(38),
      discoveredAt: now - m(14),
      status: "new",
      analysis: {
        whyMatch:
          "Author explicitly asks for tools, names Zapier as the incumbent, and describes the exact failure mode (brittle zaps, cost) FlowPilot addresses. Team size matches the target audience.",
        entityRelevance: 96,
        communityRules: {
          allowsProductMentions: true,
          requiresDisclosure: true,
          note: "Product mentions allowed in replies when relevant; disclosure required if affiliated.",
        },
        spamRisk: 8,
        promoIntensity: 22,
      },
      suggestedResponse:
        "Two things worth separating: the integration count and the logic. For a 6-person agency the expensive part of Zapier is usually the task volume, not the features.\n\nFor 'zaps keep breaking' specifically, the newer agent-style tools handle field changes better because they reason about the record rather than mapping fields one-to-one. FlowPilot is one I've used for exactly the CRM → invoicing → Slack loop you describe (disclosure: I work on it). n8n is the other one I'd look at if you're comfortable self-hosting.\n\nEither way, start with the one workflow that breaks the most and rebuild just that.",
    },
    {
      id: "opp_002",
      platform: "reddit",
      community: "r/SaaS",
      title: "Best alternatives to Zapier in 2026?",
      author: "u/dan_builds",
      excerpt:
        "Pricing just jumped again. I don't need 500 integrations, I need something that handles branching logic without a mess of paths. Open to AI-based tools if they actually work.",
      intent: "Alternative comparison",
      relevance: 94,
      activity: "high",
      createdAt: now - h(2),
      discoveredAt: now - m(52),
      status: "review",
      analysis: {
        whyMatch:
          "Direct 'alternatives to Zapier' request with explicit openness to AI-based tools. Branching-logic pain is a core FlowPilot differentiator.",
        entityRelevance: 94,
        communityRules: {
          allowsProductMentions: true,
          requiresDisclosure: true,
          note: "Self-promotion limited to replies where the author asked for recommendations.",
        },
        spamRisk: 11,
        promoIntensity: 28,
      },
      suggestedResponse:
        "For branching-heavy flows: n8n if you're fine self-hosting, Make if you want a visual builder with cheaper ops pricing. If you'd rather describe the process than draw it, FlowPilot (I work there) runs the decisions with an agent instead of paths — works well when the branches depend on context rather than a field value.\n\nWhat's the messiest branch you have today? Might help narrow it.",
    },
    {
      id: "opp_003",
      platform: "reddit",
      community: "r/smallbusiness",
      title:
        "What do you use to automate repetitive tasks for a small business?",
      author: "u/localbiz_lou",
      excerpt:
        "Appointment confirmations, review requests, inventory reorder emails. Currently a mix of reminders and me forgetting.",
      intent: "Tool recommendation",
      relevance: 91,
      activity: "medium",
      createdAt: now - h(3),
      discoveredAt: now - h(1) - m(20),
      status: "approved",
      analysis: {
        whyMatch:
          "Small-business owner listing three repetitive processes, all of which are multi-step and time-based.",
        entityRelevance: 91,
        communityRules: {
          allowsProductMentions: false,
          requiresDisclosure: true,
          note: "r/smallbusiness restricts direct product links; mention by name only, no URLs.",
        },
        spamRisk: 14,
        promoIntensity: 18,
      },
      suggestedResponse:
        "The three you listed are all 'trigger + a few decisions', which is the sweet spot for automation. Appointment confirmations: your booking tool probably does this natively. Review requests: trigger 24h after the appointment, skip if they complained. Reorder emails: threshold on inventory count.\n\nI'd pick one tool for all three rather than three point solutions. Zapier or Make work; I use an agent-based one (FlowPilot, I'm on the team) for the 'skip if they complained' type of judgment.",
      engagement: { replies: 2, votes: 9 },
    },
    {
      id: "opp_004",
      platform: "reddit",
      community: "r/startups",
      title: "How are small teams handling ops without hiring?",
      author: "u/seedstage_sam",
      excerpt:
        "We're 4 people. Ops is eating founder time. What are you automating and with what?",
      intent: "Experience request",
      relevance: 84,
      activity: "high",
      createdAt: now - h(5),
      discoveredAt: now - h(2),
      status: "posted",
      analysis: {
        whyMatch:
          "Founder audience, explicit 'what are you automating and with what'. Experience-sharing thread; contribution should lead with the workflow, not the tool.",
        entityRelevance: 84,
        communityRules: {
          allowsProductMentions: true,
          requiresDisclosure: true,
          note: "Founders may mention their own product if disclosed and on-topic.",
        },
        spamRisk: 9,
        promoIntensity: 15,
      },
      suggestedResponse:
        "Automated so far: lead routing, weekly investor update draft, invoice chasing. All three used to be me on Friday afternoons.\n\nTooling: Zapier for the dumb triggers, FlowPilot (disclosure: I work on it) for the ones with a judgment call in the middle. The biggest win was invoice chasing — the agent reads the reply and decides whether to escalate.",
      engagement: { replies: 6, votes: 31 },
    },
    {
      id: "opp_005",
      platform: "reddit",
      community: "r/Entrepreneur",
      title: "Tired of building Zaps that break every week",
      author: "u/zapfatigue",
      excerpt:
        "Twelve zaps, three broke this week. Is this just the cost of automation or are there tools that handle change better?",
      intent: "Alternative comparison",
      relevance: 89,
      activity: "medium",
      createdAt: now - h(1) - m(10),
      discoveredAt: now - m(41),
      status: "review",
      analysis: {
        whyMatch:
          "Pain point is precisely brittleness under change. Author asks whether alternatives exist.",
        entityRelevance: 89,
        communityRules: {
          allowsProductMentions: true,
          requiresDisclosure: true,
          note: "No link drops; text mentions fine.",
        },
        spamRisk: 12,
        promoIntensity: 31,
      },
      suggestedResponse:
        "Some of that is unavoidable — upstream APIs change. But 3 of 12 in a week usually means the zaps depend on exact field shapes. Two fixes: (1) add a normalize step so every zap reads from one clean schema, (2) for the flows that keep breaking, try an agent-based tool that reasons about the record instead of mapping fields. I work on one (FlowPilot); n8n with a code step is the DIY version.",
    },
    {
      id: "opp_006",
      platform: "reddit",
      community: "r/nocode",
      title: "Which automation tool for non-technical founders?",
      author: "u/nontech_nina",
      excerpt:
        "I can describe what I want in plain English. I cannot write JavaScript in a code step. What should I look at?",
      intent: "Tool recommendation",
      relevance: 92,
      activity: "low",
      createdAt: now - h(7),
      discoveredAt: now - h(4),
      status: "monitoring",
      analysis: {
        whyMatch:
          "'Describe in plain English' is the exact interaction model. Non-technical founder is a primary audience.",
        entityRelevance: 92,
        communityRules: {
          allowsProductMentions: true,
          requiresDisclosure: false,
          note: "Recommendations encouraged.",
        },
        spamRisk: 6,
        promoIntensity: 20,
      },
      suggestedResponse:
        "Make has the friendliest visual builder. If you'd rather type the process than draw it, look at the agent-based tools — FlowPilot is the one I know best (I work on it). Whichever you pick, start with a single workflow you do more than once a day.",
      engagement: { replies: 3, votes: 12 },
    },
    {
      id: "opp_007",
      platform: "reddit",
      community: "r/operations",
      title: "Automating lead routing for a small sales team",
      author: "u/sales_ops_ben",
      excerpt:
        "Inbound leads → enrich → score → assign → Slack ping. Three reps. Zapier quote was more than a rep's tooling budget.",
      intent: "Solution request",
      relevance: 87,
      activity: "medium",
      createdAt: now - m(55),
      discoveredAt: now - m(23),
      status: "new",
      analysis: {
        whyMatch:
          "Multi-step process with a scoring decision. Budget sensitivity matches small-business positioning.",
        entityRelevance: 87,
        communityRules: {
          allowsProductMentions: true,
          requiresDisclosure: true,
          note: "Vendor replies must be flagged.",
        },
        spamRisk: 10,
        promoIntensity: 24,
      },
      suggestedResponse:
        'For three reps the enrich + score step is where the cost lives, not the routing. Cheapest path: Clearbit-style enrichment on a free tier, a scoring rule in a sheet, then any automation tool for assign + ping. If scoring needs judgment ("does this look like a real company"), an agent step handles that — I work on FlowPilot which does this, but n8n + an LLM node also works.',
    },
    {
      id: "opp_008",
      platform: "reddit",
      community: "r/zapier",
      title: "Zapier alternative that handles branching logic well?",
      author: "u/logicbranch",
      excerpt:
        "Zapier paths are painful past 3 branches. Need something that can decide based on context, not just field values.",
      intent: "Alternative comparison",
      relevance: 78,
      activity: "low",
      createdAt: now - h(9),
      discoveredAt: now - h(6),
      status: "skipped",
      analysis: {
        whyMatch:
          "Strong topical match, but r/zapier prohibits competitor promotion entirely.",
        entityRelevance: 90,
        communityRules: {
          allowsProductMentions: false,
          requiresDisclosure: true,
          note: "Competitor mentions removed by moderators. Skip.",
        },
        spamRisk: 35,
        promoIntensity: 40,
      },
      suggestedResponse: "",
    },
    {
      id: "opp_009",
      platform: "reddit",
      community: "r/artificial",
      title: "Any AI agents that can handle multi-step business processes?",
      author: "u/process_pete",
      excerpt:
        "Specifically things with judgment calls in the middle. 'If the vendor's reply looks like a delay, escalate.' That kind of thing.",
      intent: "Solution request",
      relevance: 93,
      activity: "high",
      createdAt: now - m(25),
      discoveredAt: now - m(6),
      status: "new",
      analysis: {
        whyMatch:
          "Asks for exactly the category FlowPilot occupies, with a concrete judgment-call example.",
        entityRelevance: 93,
        communityRules: {
          allowsProductMentions: true,
          requiresDisclosure: true,
          note: "Product mentions fine in replies; no top-level promo posts.",
        },
        spamRisk: 7,
        promoIntensity: 19,
      },
      suggestedResponse:
        "Yes — this is the category the agent-based automation tools are built for. The pattern you describe (classify the reply, then branch) is a two-step: LLM classification with a confidence threshold, then a normal action. FlowPilot does this out of the box (disclosure: I work on it); you can also assemble it in n8n with an LLM node. The thing to watch is the confidence threshold — start conservative and review the escalations for the first week.",
    },
    {
      id: "opp_010",
      platform: "reddit",
      community: "r/freelance",
      title: "Recommendations for automating invoice follow-ups?",
      author: "u/freelance_jo",
      excerpt:
        "Need something that checks payment status, sends the right follow-up, escalates after 30 days. Bonus if it doesn't need a developer.",
      intent: "Tool recommendation",
      relevance: 85,
      activity: "medium",
      createdAt: now - h(1) - m(40),
      discoveredAt: now - h(1),
      status: "review",
      analysis: {
        whyMatch:
          "Clear multi-step process with escalation logic and a non-developer constraint.",
        entityRelevance: 85,
        communityRules: {
          allowsProductMentions: true,
          requiresDisclosure: true,
          note: "Recommendations welcome; affiliations must be stated.",
        },
        spamRisk: 9,
        promoIntensity: 21,
      },
      suggestedResponse:
        "Most invoicing tools (Wave, FreshBooks) have basic reminders built in — check that first. The 'escalate after 30 days based on their reply' part is where they fall short; that needs a small agent reading the response. I work on FlowPilot which handles that; if you're comfortable with a bit of setup, n8n can do it too.",
    },
  ];
}
