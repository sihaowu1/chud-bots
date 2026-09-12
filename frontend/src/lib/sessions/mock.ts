import type { BrowserAgent, SessionLogLine } from "./types";

// ---------------------------------------------------------------------------
// Mock dreamers. Plays the same script the backend's Dreamer walks through
// (Temp-Mail → Reddit signup/login → CAPTCHA → Google → land → deepen → kick)
// so the Activity page demos without Steel. Notes are the backend's wording.
// ---------------------------------------------------------------------------

const PERSONAS: { name: string; traits: string[] }[] = [
  { name: "Cobb", traits: ["thorough", "desktop"] },
  { name: "Arthur", traits: ["fast typist", "desktop"] },
  { name: "Ariadne", traits: ["desktop", "scroller"] },
  { name: "Eames", traits: ["skimmer", "desktop"] },
  { name: "Saito", traits: ["deliberate", "desktop"] },
  { name: "Mal", traits: ["deep diver", "desktop"] },
  { name: "Fischer", traits: ["desktop", "skimmer"] },
  { name: "Yusuf", traits: ["desktop", "curious"] },
];

const QUERIES = [
  "best alternatives to Zapier",
  "AI workflow automation",
  "automate repetitive business tasks",
  "automation for small business",
  "",
];
const SUBS = [
  "SaaS",
  "productivity",
  "startups",
  "smallbusiness",
  "automation",
];
const POSTS = [
  "How do you automate repetitive admin work?",
  "Zapier pricing is getting out of hand — what are you switching to?",
  "Anyone using AI agents for back-office ops?",
  "Best way to automate weekly reporting?",
];

interface Step {
  level?: number;
  note: string;
  url?: string;
  email?: boolean;
  status?: BrowserAgent["status"];
  /** seconds until the next step */
  dwell: [number, number];
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const hex = (n: number) =>
  Array.from(
    { length: n },
    () => "0123456789abcdef"[Math.floor(Math.random() * 16)],
  ).join("");

function script(query: string, target: string): Step[] {
  const sub = target.split("/r/")[1] ?? "SaaS";
  const login = Math.random() < 0.4;
  const steps: Step[] = [
    { level: 0, note: "waking up a Steel session", dwell: [1.5, 2.5] },
    { level: 0, note: `session ${hex(8)} live`, dwell: [0.8, 1.4] },
  ];
  if (login) {
    steps.push({ note: "using saved email", email: true, dwell: [1, 1.6] });
    steps.push({
      note: "opening Reddit login",
      url: "https://www.reddit.com/login/",
      dwell: [2, 3],
    });
    steps.push({
      note: "submitted saved Reddit login",
      url: "https://www.reddit.com/login/",
      dwell: [1.5, 2.5],
    });
  } else {
    steps.push({
      note: "opening Temp-Mail for an email address",
      url: "https://temp-mail.org/en/",
      dwell: [2.5, 3.5],
    });
    steps.push({
      note: "copied Temp-Mail address",
      url: "https://temp-mail.org/en/",
      email: true,
      dwell: [1.5, 2.5],
    });
    steps.push({
      note: "opening Reddit signup",
      url: "https://www.reddit.com/register/",
      dwell: [2.5, 3.5],
    });
    steps.push({
      note: "pasted email into Reddit signup",
      url: "https://www.reddit.com/register/",
      dwell: [1.5, 2.5],
    });
    steps.push({
      note: "entered password from local agent state",
      url: "https://www.reddit.com/register/",
      dwell: [1.5, 2],
    });
    steps.push({
      note: "submitted Reddit credentials",
      url: "https://www.reddit.com/register/",
      dwell: [1.5, 2.5],
    });
  }
  if (Math.random() < 0.6) {
    steps.push({
      note: "CAPTCHA detected on Reddit login",
      url: "https://www.reddit.com/login/",
      dwell: [2.5, 4],
    });
    steps.push({
      note: "Steel solved the Reddit CAPTCHA",
      url: "https://www.reddit.com/login/",
      dwell: [1.2, 2],
    });
  } else {
    steps.push({
      note: "Reddit login loaded; no CAPTCHA detected",
      url: "https://www.reddit.com/login/",
      dwell: [1.2, 2],
    });
  }
  if (!query) {
    steps.push({
      note: "login only — dwelling on Reddit",
      url: "https://www.reddit.com/",
      dwell: [6, 9],
    });
  } else {
    steps.push({
      level: 1,
      note: `typing "${query}" into Google`,
      url: "https://www.google.com/?hl=en",
      dwell: [3, 4.5],
    });
    steps.push({
      level: 1,
      note: "reading the results page",
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      dwell: [2.5, 4],
    });
    steps.push({
      level: 2,
      note: `clicked r/${sub} from result #${Math.ceil(rnd(1, 5))}`,
      url: `https://www.reddit.com/r/${sub}/`,
      dwell: [6, 10],
    });
    steps.push({
      level: 3,
      note: `reading "${pick(POSTS)}"`,
      url: `https://www.reddit.com/r/${sub}/comments/${hex(6)}/`,
      dwell: [6, 10],
    });
    if (Math.random() < 0.6)
      steps.push({
        level: 4,
        note: "followed an internal link",
        url: `https://www.reddit.com/r/${sub}/comments/${hex(6)}/`,
        dwell: [5, 8],
      });
  }
  steps.push({ note: "kicked back to reality", status: "done", dwell: [0, 0] });
  return steps;
}

interface Runner {
  agent: BrowserAgent;
  steps: Step[];
  i: number;
  nextAt: number;
}

export interface MockTick {
  agents: BrowserAgent[];
  logs: SessionLogLine[];
}

/**
 * Drives a small fleet of mock dreamers. Call `tick()` on an interval; it
 * returns the current snapshots and any new log lines.
 */
export class MockFleet {
  private runners: Runner[] = [];
  private personaCursor = 0;
  private seq = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent = 4) {
    this.maxConcurrent = maxConcurrent;
    for (let i = 0; i < 3; i++) this.spawn(Date.now() + i * 1800);
  }

  launch(target: string, queries: string[], count: number) {
    const now = Date.now();
    for (let i = 0; i < count; i++)
      this.spawn(
        now + i * 1200,
        target,
        queries.length ? queries[i % queries.length] : "",
      );
  }

  stop(id: string) {
    const r = this.runners.find((x) => x.agent.id === id);
    if (!r || r.agent.status !== "running") return;
    r.agent.status = "stopped";
    r.agent.note = "kicked early by operator";
    if (r.agent.session) r.agent.session.status = "released";
    r.steps = [];
  }

  stopAll() {
    for (const r of this.runners) this.stop(r.agent.id);
  }

  clear() {
    const before = this.runners.length;
    this.runners = this.runners.filter(
      (r) => r.agent.status === "running" || r.agent.status === "queued",
    );
    return before - this.runners.length;
  }

  private spawn(startAt: number, target?: string, query?: string) {
    const p = PERSONAS[this.personaCursor++ % PERSONAS.length];
    const q = query ?? pick(QUERIES);
    const t = target ?? `https://www.reddit.com/r/${pick(SUBS)}`;
    const id = hex(8);
    this.runners.push({
      agent: {
        id,
        persona: p.name,
        query: q,
        target: t,
        level: 0,
        status: "queued",
        session: null,
        email: null,
        url: null,
        note: "",
        traits: p.traits,
      },
      steps: script(q, t),
      i: -1,
      nextAt: startAt,
    });
  }

  tick(): MockTick {
    const now = Date.now();
    const logs: SessionLogLine[] = [];
    for (const r of this.runners) {
      if (r.agent.status !== "queued" && r.agent.status !== "running") continue;
      if (now < r.nextAt) continue;
      const step = r.steps[++r.i];
      if (!step) continue;
      const a = r.agent;
      if (a.status === "queued") {
        a.status = "running";
        a.session = {
          id: hex(24),
          status: "live",
          debug_url: null,
          viewer_url: null,
          created_at: new Date().toISOString(),
        };
      }
      if (step.level !== undefined) a.level = step.level;
      if (step.url) a.url = step.url;
      if (step.email && !a.email)
        a.email = `${a.persona.toLowerCase()}.${hex(4)}@tmpmail.org`;
      a.note =
        step.email && step.note.startsWith("using")
          ? `using saved email ${a.email}`
          : step.note;
      if (step.status) {
        a.status = step.status;
        if (a.session) a.session.status = "released";
      }
      logs.push({
        id: `l_${this.seq++}`,
        ts: now,
        persona: a.persona,
        level: a.level,
        msg: a.note,
        error: a.status === "failed",
      });
      r.nextAt = now + rnd(step.dwell[0], step.dwell[1]) * 1000;
    }
    // Keep the wall alive: replace finished dreamers after a pause.
    const running = this.runners.filter(
      (r) => r.agent.status === "running" || r.agent.status === "queued",
    ).length;
    if (running < this.maxConcurrent && Math.random() < 0.08)
      this.spawn(now + 1500);
    // Drop very old finished ones so the grid doesn't grow forever.
    const finished = this.runners.filter(
      (r) => r.agent.status !== "running" && r.agent.status !== "queued",
    );
    if (finished.length > 4) {
      const drop = finished[0];
      this.runners = this.runners.filter((r) => r !== drop);
    }
    return {
      agents: this.runners.map((r) => ({
        ...r.agent,
        session: r.agent.session ? { ...r.agent.session } : null,
      })),
      logs,
    };
  }
}
