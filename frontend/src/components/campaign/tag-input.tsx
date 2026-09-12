"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  mono?: boolean;
  id?: string;
}

/** Enter-to-add list editor. Items render as quiet bordered tokens. */
export function TagInput({ value, onChange, placeholder, mono, id }: Props) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || value.includes(v)) return;
    onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 transition-colors focus-within:border-ring">
      {value.map((v) => (
        <span
          key={v}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded border border-border bg-surface pl-2 pr-1 text-xs",
            mono && "font-mono",
          )}
        >
          {mono ? `“${v}”` : v}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== v))}
            className="rounded p-0.5 text-fg-subtle hover:text-foreground"
            aria-label={`Remove ${v}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        className={cn(
          "h-6 min-w-32 flex-1 bg-transparent text-xs outline-none placeholder:text-fg-subtle",
          mono && "font-mono",
        )}
      />
    </div>
  );
}
