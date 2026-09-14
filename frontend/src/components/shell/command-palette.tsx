"use client";

import { useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Compass,
  LayoutGrid,
  Pause,
  Play,
  Radar,
  ScrollText,
  Settings,
  Target,
  Zap,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useSim } from "@/lib/store";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const router = useRouter();
  const paused = useSim((s) => s.paused);
  const setPaused = useSim((s) => s.setPaused);
  const reallocate = useSim((s) => s.reallocate);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Jump to a page, agent, or action"
    >
      <Command>
        <CommandInput placeholder="Type a command or search…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Navigate">
            <CommandItem onSelect={() => go("/")}>
              <LayoutGrid /> Dashboard <CommandShortcut>G D</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => go("/campaign")}>
              <Target /> Campaign <CommandShortcut>G C</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => go("/logs")}>
              <ScrollText /> Logs <CommandShortcut>G L</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => go("/library")}>
              <BookOpen /> Library <CommandShortcut>G B</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => go("/opportunities")}>
              <Compass /> Opportunities <CommandShortcut>G O</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => go("/discoverability")}>
              <Radar /> Discoverability
            </CommandItem>
            <CommandItem onSelect={() => go("/analytics")}>
              <BarChart3 /> Analytics
            </CommandItem>
            <CommandItem onSelect={() => go("/settings")}>
              <Settings /> Settings
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            {paused ? (
              <CommandItem
                onSelect={() => {
                  setPaused(false);
                  onOpenChange(false);
                }}
              >
                <Play /> Resume all agents
              </CommandItem>
            ) : (
              <CommandItem
                onSelect={() => {
                  setPaused(true);
                  onOpenChange(false);
                }}
              >
                <Pause /> Pause all agents
              </CommandItem>
            )}
            <CommandItem
              onSelect={() => {
                reallocate();
                onOpenChange(false);
              }}
            >
              <Zap /> Reallocate agents
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
