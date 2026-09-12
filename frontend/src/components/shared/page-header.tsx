import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: Props) {
  return (
    <header className={cn("flex items-end justify-between gap-6", className)}>
      <div>
        <h1 className="text-lg font-medium tracking-[-0.015em] text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
