"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { Toaster } from "@/components/shared/toast";
import { useSimulation } from "@/lib/sim/use-simulation";
import { useHotkey } from "@/hooks/use-hotkey";

export function AppShell({ children }: { children: React.ReactNode }) {
  useSimulation();
  const router = useRouter();
  const [cmdOpen, setCmdOpen] = useState(false);

  useHotkey("k", () => setCmdOpen((o) => !o), {
    meta: true,
    allowInInput: true,
  });

  // "G then <key>" chords for navigation.
  useEffect(() => {
    let pendingG = false;
    let timer: ReturnType<typeof setTimeout>;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (pendingG) {
        pendingG = false;
        clearTimeout(timer);
        const map: Record<string, string> = {
          d: "/",
          c: "/campaign",
          l: "/logs",
          o: "/opportunities",
          v: "/discoverability",
          n: "/analytics",
          s: "/settings",
        };
        const href = map[e.key.toLowerCase()];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }
      if (e.key.toLowerCase() === "g") {
        pendingG = true;
        timer = setTimeout(() => (pendingG = false), 800);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const openCommand = useCallback(() => setCmdOpen(true), []);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenCommand={openCommand} />
        <main className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <Toaster />
    </div>
  );
}
