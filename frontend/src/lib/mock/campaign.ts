import type { Campaign, EntityType } from "@/lib/types";

export const ENTITY_TYPES: EntityType[] = [
  "Product",
  "Company",
  "Website",
  "Application",
  "Portfolio",
  "Open Source Project",
  "Research",
  "Event",
  "Service",
  "Creator",
  "Community",
  "Content",
  "Other",
];

export const CAMPAIGN: Campaign = {
  id: "cmp_flowpilot",
  name: "FlowPilot AI",
  type: "Product",
  typeLabel: "Software Product",
  url: "flowpilot.ai",
  description: "AI agents that automate repetitive business workflows.",
  audience: ["Startup founders", "Small businesses", "Operations teams"],
  whyCare:
    "Teams lose hours each week on copy-paste work between tools. FlowPilot runs those processes end-to-end with agents that adapt when the inputs change, instead of brittle trigger-action recipes.",
  problems: [
    "Repetitive admin and data-entry work",
    "Brittle Zap-style automations that break on edge cases",
    "Multi-step processes that need judgment, not just triggers",
  ],
  searchIntent: [
    "Zapier alternatives",
    "AI workflow automation",
    "automation for small business",
    "best tools for repetitive work",
  ],
  topics: [
    "AI agents",
    "Workflow automation",
    "Productivity",
    "Business automation",
  ],
  related: ["Zapier", "Make", "n8n"],
  avoid: ["Crypto", "MLM / get-rich-quick", "Political discussions"],
  status: "running",
  startedAt: 0, // set at hydration
};

export const OTHER_CAMPAIGNS: Pick<
  Campaign,
  "id" | "name" | "typeLabel" | "status"
>[] = [
  {
    id: "cmp_flowpilot",
    name: "FlowPilot AI",
    typeLabel: "Software Product",
    status: "running",
  },
  {
    id: "cmp_openbench",
    name: "OpenBench",
    typeLabel: "Open Source Project",
    status: "paused",
  },
  {
    id: "cmp_devdays",
    name: "DevDays Lisbon",
    typeLabel: "Event",
    status: "draft",
  },
];
