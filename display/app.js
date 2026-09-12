// Display only. Talks to the backend over /api/*, never to Steel directly.

const $ = (s, el = document) => el.querySelector(s);
const grid = $("#grid");
const tpl = $("#card");
const cards = new Map(); // agent id -> <article>

// ---- SSE ------------------------------------------------------------------

function connect() {
  const es = new EventSource("/api/events");
  const conn = $("#conn");
  es.onopen = () => { conn.textContent = "live"; conn.className = "conn on"; };
  es.onerror = () => { conn.textContent = "reconnecting…"; conn.className = "conn off"; };
  es.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    if (ev.kind === "snapshot") {
      $("#max-count").textContent = ev.max;
      const count = $("#launch [name=count]");
      count.max = ev.max;
      if (Number(count.value) > ev.max) count.value = ev.max;
      ev.agents.forEach(render);
    } else if (ev.kind === "agent") {
      render(ev.agent);
    } else if (ev.kind === "log") {
      log(ev.msg);
    }
    updateCounts();
  };
}

// ---- cards ----------------------------------------------------------------

function render(a) {
  let card = cards.get(a.id);
  if (!card) {
    card = tpl.content.firstElementChild.cloneNode(true);
    card.dataset.id = a.id;
    $(".persona", card).textContent = a.persona;
    $(".traits", card).textContent = a.traits.join(" · ");
    $(".query", card).textContent = a.query ? `"${a.query}"` : "login only";
    card.dataset.mobile = a.traits.includes("mobile");
    $(".stop", card).onclick = () => fetch(`/api/agents/${a.id}/stop`, { method: "POST" });
    $(".empty", grid)?.remove();
    grid.prepend(card);
    cards.set(a.id, card);
  }

  card.dataset.status = a.status;

  const link = $(".url a", card);
  link.textContent = a.url || "";
  if (a.url) link.href = a.url;

  const viewer = $(".viewer", card);
  const frame = $("iframe", viewer);
  if (a.session?.debug_url && a.session.status !== "released" && !frame.src) {
    frame.src = a.session.debug_url;
    viewer.classList.add("live");
    $(".open", card).href = a.session.viewer_url;
  }
  if (a.session?.status === "released" && frame.src) {
    frame.removeAttribute("src");
    viewer.classList.remove("live");
    $(".placeholder", viewer).textContent = "session released";
  }
}

function updateCounts() {
  const n = [...cards.values()].filter((c) => c.dataset.status === "running").length;
  $("#live-count").textContent = n;
}

// ---- log ------------------------------------------------------------------

const logEl = $("#log");
let lastLine = "";
function log(msg, err = false) {
  if (msg === lastLine) return;
  lastLine = msg;
  const li = document.createElement("li");
  if (err) li.className = "err";
  const t = document.createElement("span");
  t.className = "t";
  t.textContent = new Date().toLocaleTimeString([], { hour12: false });
  li.append(t, msg);
  logEl.prepend(li);
  while (logEl.children.length > 80) logEl.lastChild.remove();
}

// ---- controls -------------------------------------------------------------

$("#launch").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = $("button.primary", f);
  btn.disabled = true;
  const subreddit = f.subreddit.value
    .trim()
    .replace(/^https?:\/\/(?:www\.)?reddit\.com\/r\//i, "")
    .replace(/^\/?r\//i, "")
    .replace(/^\/+|\/+$/g, "");
  const body = {
    target: subreddit
      ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}`
      : "https://www.reddit.com",
    queries: f.queries.value.split("\n").map((s) => s.trim()).filter(Boolean),
    count: Number(f.count.value),
  };
  const r = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) log(`launch failed: ${(await r.json()).detail}`, true);
  btn.disabled = false;
};

$("#stop-all").onclick = () => fetch("/api/stop-all", { method: "POST" });
$("#clear").onclick = async () => {
  await fetch("/api/clear", { method: "POST" });
  for (const [id, card] of cards) {
    if (card.dataset.status !== "running" && card.dataset.status !== "queued") { card.remove(); cards.delete(id); }
  }
  if (!cards.size) grid.innerHTML = '<p class="empty">No one is dreaming yet.</p>';
  updateCounts();
};

connect();
