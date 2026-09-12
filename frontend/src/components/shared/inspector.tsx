"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "./kbd";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  className?: string;
}

/**
 * Right-side detail panel that lives inside the page layout (not a modal), so
 * the list stays visible and the user keeps their place.
 */
export function Inspector({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 420,
  className,
}: Props) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          key="inspector"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "relative shrink-0 overflow-hidden border-l border-border bg-surface",
            className,
          )}
        >
          <div className="flex h-full flex-col" style={{ width }}>
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-foreground">
                  {title}
                </div>
                {subtitle && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {subtitle}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Kbd>Esc</Kbd>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onClose}
                  aria-label="Close panel"
                >
                  <X />
                </Button>
              </div>
            </div>
            <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
              {children}
            </div>
            {footer && (
              <div className="border-t border-border px-5 py-3">{footer}</div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
