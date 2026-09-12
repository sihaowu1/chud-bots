import { cn } from "@/lib/utils";

export type Tone =
  "neutral" | "signal" | "success" | "warning" | "danger" | "muted";

const TONE_BG: Record<Tone, string> = {
  neutral: "bg-foreground/70",
  muted: "bg-fg-subtle",
  signal: "bg-signal",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-foreground",
  muted: "text-muted-foreground",
  signal: "text-signal",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

interface Props {
  tone: Tone;
  /** Only active computational states should pulse. */
  pulse?: boolean;
  className?: string;
  size?: "xs" | "sm";
}

export function StatusDot({ tone, pulse, className, size = "sm" }: Props) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 rounded-full",
        size === "xs" ? "size-1.5" : "size-2",
        TONE_BG[tone],
        pulse && "animate-pulse-soft",
        className,
      )}
    />
  );
}
