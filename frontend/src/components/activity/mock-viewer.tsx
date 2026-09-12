"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Lock, Search } from "lucide-react";
import type { BrowserAgent } from "@/lib/sessions/types";
import { stageOf } from "@/lib/sessions/types";
import { cn } from "@/lib/utils";

/** Reveals `text` over ~1.2s whenever it changes — stands in for the per-keystroke typing the real agent does. */
function Typewriter({ text, className }: { text: string; className?: string }) {
  const [n, setN] = useState(0);
  // Restart the reveal when the text changes (adjust-state-during-render).
  const [seen, setSeen] = useState(text);
  if (seen !== text) {
    setSeen(text);
    setN(0);
  }
  useEffect(() => {
    if (!text) return;
    const step = Math.max(25, 1200 / text.length);
    const t = setInterval(
      () => setN((v) => (v >= text.length ? v : v + 1)),
      step,
    );
    return () => clearInterval(t);
  }, [text]);
  return (
    <span className={className}>
      {text.slice(0, n)}
      {n < text.length && (
        <span className="ml-px inline-block h-[1em] w-px translate-y-[2px] bg-current" />
      )}
    </span>
  );
}

function Field({
  label,
  value,
  filled,
  secret,
}: {
  label: string;
  value?: string;
  filled?: boolean;
  secret?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-[9px] text-black/45">{label}</div>
      <div
        className={cn(
          "flex h-7 items-center rounded-[4px] border bg-white px-2 text-[10px]",
          filled
            ? "border-black/30 text-black/80"
            : "border-black/15 text-black/30",
        )}
      >
        {filled ? (
          secret ? (
            "••••••••••"
          ) : (
            <Typewriter text={value ?? ""} />
          )
        ) : (
          ""
        )}
      </div>
    </div>
  );
}

/**
 * A stand-in for Steel's live viewer. Renders a neutral, logo-free sketch of
 * the page the agent is on so the login flow is legible without a backend.
 */
export function MockViewer({ agent }: { agent: BrowserAgent }) {
  const stage = stageOf(agent);
  const note = agent.note.toLowerCase();
  const url = agent.url ?? "";
  const sub = agent.target.split("/r/")[1] ?? "SaaS";

  let page: React.ReactNode;
  switch (stage) {
    case "wake":
      page = (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-[10px] text-black/40">
          <Loader2 className="size-3.5 animate-spin" />
          Starting cloud browser
        </div>
      );
      break;
    case "email":
      page = (
        <div className="p-4">
          <div className="text-[11px] font-semibold text-black/70">
            Temporary email
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex h-7 flex-1 items-center rounded-[4px] border border-black/20 bg-white px-2 font-mono text-[10px] text-black/80">
              {agent.email ?? <Typewriter text="generating…" />}
            </div>
            <div
              className={cn(
                "flex h-7 items-center rounded-[4px] px-2.5 text-[10px] font-medium",
                note.includes("copied")
                  ? "bg-black text-white"
                  : "bg-black/10 text-black/60",
              )}
            >
              {note.includes("copied") ? "Copied" : "Copy"}
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            {[0.9, 0.7, 0.8].map((w, i) => (
              <div
                key={i}
                className="h-2 rounded bg-black/[0.07]"
                style={{ width: `${w * 100}%` }}
              />
            ))}
          </div>
        </div>
      );
      break;
    case "signup":
    case "login":
    case "captcha": {
      const emailIn =
        note.includes("pasted") ||
        note.includes("saved") ||
        note.includes("password") ||
        note.includes("submitted") ||
        note.includes("captcha");
      const pwIn =
        note.includes("password") ||
        note.includes("submitted") ||
        note.includes("captcha") ||
        note.includes("saved reddit login");
      const submitted = note.includes("submitted") || note.includes("captcha");
      page = (
        <div className="relative flex h-full items-center justify-center">
          <div className="w-44 rounded-md border border-black/10 bg-white p-3 shadow-sm">
            <div className="text-[11px] font-semibold text-black/80">
              {stage === "signup" ? "Create your account" : "Log in"}
            </div>
            <div className="mt-2.5 space-y-2">
              <Field label="Email" value={agent.email ?? ""} filled={emailIn} />
              <Field label="Password" filled={pwIn} secret />
            </div>
            <div
              className={cn(
                "mt-3 flex h-7 items-center justify-center rounded-full text-[10px] font-medium",
                submitted ? "bg-black text-white" : "bg-black/10 text-black/50",
              )}
            >
              {stage === "signup" ? "Continue" : "Log in"}
            </div>
          </div>
          {stage === "captcha" && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-md border border-black/15 bg-white px-3 py-2 text-[10px] text-black/70 shadow-sm">
                <Loader2 className="size-3 animate-spin" />
                Verifying you are human
              </div>
            </div>
          )}
          {note.includes("solved") && (
            <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[9px] text-white">
              <Check className="size-2.5" /> CAPTCHA solved
            </div>
          )}
        </div>
      );
      break;
    }
    case "search": {
      const serp = url.includes("/search");
      page = serp ? (
        <div className="p-4">
          <div className="flex h-7 w-2/3 items-center gap-2 rounded-full border border-black/15 bg-white px-3 text-[10px] text-black/80">
            <Search className="size-3 text-black/40" />
            {agent.query}
          </div>
          <div className="mt-4 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  "space-y-1",
                  i === 2 && "rounded-[4px] bg-black/[0.05] p-1.5 -m-1.5",
                )}
              >
                <div className="h-2 w-1/3 rounded bg-black/[0.12]" />
                <div className="h-2.5 w-3/4 rounded bg-black/[0.25]" />
                <div className="h-2 w-full rounded bg-black/[0.07]" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <div className="flex gap-1">
            {["#4285f4", "#ea4335", "#fbbc05", "#34a853"].map((c) => (
              <span
                key={c}
                className="size-2 rounded-full opacity-40"
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="flex h-8 w-3/4 items-center gap-2 rounded-full border border-black/15 bg-white px-3 text-[10px] text-black/80 shadow-sm">
            <Search className="size-3 text-black/40" />
            <Typewriter text={agent.query} />
          </div>
        </div>
      );
      break;
    }
    case "land":
    case "browse":
      page = (
        <div className="flex h-full flex-col">
          <div className="flex h-7 items-center gap-2 border-b border-black/10 bg-white px-3 text-[10px]">
            <span className="size-3.5 rounded-full bg-black/15" />
            <span className="font-semibold text-black/70">
              {note.includes("dwelling") ? "Home" : `r/${sub}`}
            </span>
            <span className="ml-auto h-5 w-16 rounded-full bg-black/[0.07]" />
          </div>
          {stage === "land" || note.includes("dwelling") ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-[4px] border border-black/10 bg-white p-2"
                >
                  <div className="h-2 w-1/4 rounded bg-black/[0.12]" />
                  <div className="mt-1.5 h-2.5 w-2/3 rounded bg-black/[0.3]" />
                  <div className="mt-1.5 h-2 w-full rounded bg-black/[0.07]" />
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3">
              <div className="text-[11px] font-semibold leading-4 text-black/80">
                {agent.note.replace(/^reading /, "").replace(/^"|"$/g, "")}
              </div>
              <div className="mt-2 space-y-1">
                {[1, 0.95, 0.6].map((w, i) => (
                  <div
                    key={i}
                    className="h-2 rounded bg-black/[0.07]"
                    style={{ width: `${w * 100}%` }}
                  />
                ))}
              </div>
              <div className="mt-3 space-y-2 border-t border-black/10 pt-2">
                {[0, 1].map((i) => (
                  <div key={i} className="flex gap-2">
                    <span className="size-3 shrink-0 rounded-full bg-black/15" />
                    <div className="flex-1 space-y-1">
                      <div className="h-2 w-1/5 rounded bg-black/[0.12]" />
                      <div className="h-2 w-5/6 rounded bg-black/[0.07]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
      break;
    default:
      page = (
        <div className="flex h-full items-center justify-center text-[10px] text-black/40">
          Session released
        </div>
      );
  }

  const host = url ? new URL(url).host : "";

  return (
    <div className="flex h-full flex-col bg-[#f3f3f1] text-black">
      {/* browser chrome */}
      <div className="flex h-6 shrink-0 items-center gap-2 border-b border-black/10 bg-[#e9e9e6] px-2">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-1.5 rounded-full bg-black/15" />
          ))}
        </span>
        <span className="flex h-4 flex-1 items-center gap-1 rounded-[3px] bg-white/80 px-1.5 font-mono text-[9px] text-black/55">
          {host && <Lock className="size-2 text-black/35" />}
          <span className="truncate">
            {url ? url.replace(/^https?:\/\/(www\.)?/, "") : ""}
          </span>
        </span>
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-hidden",
          stage === "done" && "opacity-60",
        )}
      >
        {page}
      </div>
    </div>
  );
}
