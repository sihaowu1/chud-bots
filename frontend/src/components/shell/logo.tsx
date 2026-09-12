import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4", className)} aria-hidden>
      <rect
        x="1"
        y="9"
        width="3"
        height="6"
        rx="0.75"
        fill="currentColor"
        opacity="0.45"
      />
      <rect
        x="6.5"
        y="5.5"
        width="3"
        height="9.5"
        rx="0.75"
        fill="currentColor"
        opacity="0.7"
      />
      <rect x="12" y="1" width="3" height="14" rx="0.75" fill="currentColor" />
    </svg>
  );
}
