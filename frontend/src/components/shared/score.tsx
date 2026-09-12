import { cn } from "@/lib/utils";

interface Props {
  value: number;
  /** Show the micro bar. Off by default; enable in detail panels where there is room. */
  bar?: boolean;
  className?: string;
}

/**
 * Compact percentage. High scores read in the foreground colour, low scores
 * fall back to muted so weak results recede without adding a new colour.
 */
export function Score({ value, bar = false, className }: Props) {
  const v = Math.round(value);
  const strong = v >= 85;
  const weak = v < 60;
  return (
    <span
      className={cn("inline-flex items-center gap-2 tnum text-xs", className)}
    >
      {bar && (
        <span className="relative h-[3px] w-16 overflow-hidden rounded-full bg-foreground/10">
          <span
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              weak
                ? "bg-fg-subtle"
                : strong
                  ? "bg-foreground"
                  : "bg-foreground/60",
            )}
            style={{ width: `${v}%` }}
          />
        </span>
      )}
      <span
        className={cn(
          "font-mono",
          weak ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {v}%
      </span>
    </span>
  );
}
