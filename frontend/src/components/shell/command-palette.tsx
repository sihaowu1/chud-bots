"use client";

import { useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bot,
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
import { ROLE_LABEL } from "@/lib/mock/agents";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const router = useRouter();
  const agents = useSim((s) => s.agents);
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
            <CommandItem onSelect={() => go("/activity")}>
              <Activity /> Activity <CommandShortcut>G A</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => go("/logs")}>
              <ScrollText /> Logs <CommandShortcut>G L</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => go("/opportunities")}>
              <Compass /> Opportunities <CommandShortcut>G O</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => go("/agents")}>
              <Bot /> Agents
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
          <CommandSeparator />
          <CommandGroup heading="Agents">
            {agents.map((a) => (
              <CommandItem
                key={a.id}
                value={`${a.name} ${ROLE_LABEL[a.role]}`}
                onSelect={() => go(`/agents?agent=${a.id}`)}
              >
                <span className="font-mono text-xs">{a.name}</span>
                <span className="text-muted-foreground">
                  {ROLE_LABEL[a.role]}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
