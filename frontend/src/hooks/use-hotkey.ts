"use client";

import { useEffect } from "react";

interface Options {
  meta?: boolean;
  shift?: boolean;
  enabled?: boolean;
  /** Fire even when focus is in an input. Default false. */
  allowInInput?: boolean;
}

export function useHotkey(
  key: string,
  handler: (e: KeyboardEvent) => void,
  opts: Options = {},
) {
  const {
    meta = false,
    shift = false,
    enabled = true,
    allowInInput = false,
  } = opts;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (meta !== (e.metaKey || e.ctrlKey)) return;
      if (shift !== e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inInput && !allowInInput) return;
      e.preventDefault();
      handler(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, handler, meta, shift, enabled, allowInInput]);
}
