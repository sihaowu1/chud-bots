"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bot,
  Compass,
  LayoutGrid,
  Radar,
  ScrollText,
  Settings,
  Target,
} from "lucide-react";
import { LogoMark } from "./logo";
import { useSim } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/campaign", label: "Campaign", icon: Target },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/opportunities", label: "Opportunities", icon: Compass },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/discoverability", label: "Discoverability", icon: Radar },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const reviewCount = useSim(
    (s) => s.opportunities.filter((o) => o.status === "review").length,
  );

  return (
    <aside className="flex h-full w-12 shrink-0 flex-col border-r border-border bg-background lg:w-[200px]">
      <div className="flex h-12 items-center gap-2 px-4">
        <LogoMark className="shrink-0 text-foreground" />
        <span className="hidden text-[13px] font-semibold tracking-[-0.01em] lg:inline">
          Inception
        </span>
      </div>

      <nav className="mt-2 flex-1 px-2">
        <ul className="space-y-px">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  title={label}
                  className={cn(
                    "group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors duration-150",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      active
                        ? "text-foreground"
                        : "text-fg-subtle group-hover:text-muted-foreground",
                    )}
                    strokeWidth={1.75}
                  />
                  <span className="hidden flex-1 lg:inline">{label}</span>
                  {href === "/opportunities" && reviewCount > 0 && (
                    <span className="hidden tnum font-mono text-[11px] text-muted-foreground lg:inline">
                      {reviewCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-2">
        <button className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-accent/60">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] font-medium text-foreground">
            SW
          </span>
          <span className="hidden min-w-0 flex-1 lg:block">
            <span className="block truncate text-xs font-medium text-foreground">
              Sylvia Wang
            </span>
            <span className="block truncate text-[11px] text-fg-subtle">
              FlowPilot · Pro
            </span>
          </span>
        </button>
      </div>
    </aside>
  );
}
