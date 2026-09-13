import type { BrowserAgent, SessionLogLine } from "@/lib/sessions/types";

/** A `SessionLogLine` joined against its agent (matched by persona), if any. */
export interface LogRow extends SessionLogLine {
  agent?: BrowserAgent;
}
