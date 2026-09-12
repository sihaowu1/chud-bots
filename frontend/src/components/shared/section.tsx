import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** Size of the title. `lg` for the four primary dashboard sections. */
  size?: "md" | "lg";
}

export function SectionHeader({
  title,
  subtitle,
  actions,
  className,
  size = "md",
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2
          className={cn(
            "font-medium tracking-[-0.01em] text-foreground",
            size === "lg" ? "text-[15px] leading-6" : "text-[13px] leading-5",
          )}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      )}
    </div>
  );
}

/** Bordered container. Use only where a boundary helps — never nest. */
export function Panel({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-lg border border-border bg-surface", className)}
      {...props}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("border-b border-border px-4 py-3", className)}>
      {children}
    </div>
  );
}

/** Label / value pair used in detail panels. */
export function Field({
  label,
  children,
  className,
  inline,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div
        className={cn(
          "flex items-baseline justify-between gap-4 py-1.5",
          className,
        )}
      >
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-right text-xs text-foreground">{children}</span>
      </div>
    );
  }
  return (
    <div className={cn("space-y-1", className)}>
      <div className="label-xs">{label}</div>
      <div className="text-[13px] leading-5 text-foreground">{children}</div>
    </div>
  );
}
