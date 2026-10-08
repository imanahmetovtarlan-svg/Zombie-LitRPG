const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  for (const child of children.flat()) {
    if (child != null) node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.details = data.details;
    throw err;
  }
  return data;
}

const errorText = (err) =>
  [err.message, ...(err.details?.errors ?? [])].join("\n");

const statusTag = (s) => el("span", { class: `status ${s}` }, s);

function checkView(check) {
  if (!check) return null;
  return el("div", {},
    el("strong", { class: `verdict ${check.verdict}` }, `Canon check: ${check.verdict}`),
    check.errors.length ? el("ul", {}, check.errors.map((e) => el("li", { class: "verdict REJECT" }, e))) : null,
    check.warnings.length ? el("ul", {}, check.warnings.map((w) => el("li", {}, w))) : null,
  );
}

// ---------- tabs ----------
const tabs = document.querySelectorAll("[role=tab]");
function showTab(name) {
  tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
  document.querySelectorAll(".tab").forEach((p) => { p.hidden = p.id !== `tab-${name}`; });
  try { localStorage.setItem("cc-tab", name); } catch {}
}
tabs.forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));
try { showTab(localStorage.getItem("cc-tab") || "entities"); } catch { showTab("entities"); }

// ---------- entities ----------
let selectedId = null;

async function loadEntities() {
  const params = new URLSearchParams({ type: $("#f-type").value, status: $("#f-status").value, q: $("#f-q").value });
  const list = $("#entity-list");
  try {
    const rows = await api(`/api/entities?${params}`);
    list.replaceChildren(...rows.map((r) =>
      el("li", { class: r.id === selectedId ? "active" : "", onclick: () => showEntity(r.id) },
        el("span", {}, el("span", { class: "id" }, r.id), " ", r.name),
        statusTag(r.status)),
    ));
    if (!rows.length) list.replaceChildren(el("li", { class: "muted" }, "No entities."));
  } catch (err) {
    list.replaceChildren(el("li", { class: "verdict REJECT" }, errorText(err)));
  }
}

async function showEntity(id) {
  selectedId = id;
  const detail = $("#entity-detail");
  detail.classList.remove("muted");
  try {
    const data = await api(`/api/entities/${encodeURIComponent(id)}`);
    const reviewable = ["DRAFT", "REVIEW"].includes(data.entity.status);
    detail.replaceChildren(
      el("div", { class: "row" }, el("strong", {}, data.entity.id), statusTag(data.entity.status), el("span", { class: "muted" }, data.file)),
      el("pre", {}, JSON.stringify(data.entity, null, 2)),
      checkView(data.check),
      reviewable ? reviewButtons(id) : null,
    );
  } catch (err) {
    detail.replaceChildren(el("div", { class: "verdict REJECT" }, errorText(err)));
  }
  loadEntities();
}

let filterTimer;
$("#f-type").addEventListener("change", loadEntities);
$("#f-status").addEventListener("change", loadEntities);
$("#f-q").addEventListener("input", () => { clearTimeout(filterTimer); filterTimer = setTimeout(loadEntities, 200); });

// ---------- review ----------
function reviewButtons(id) {
  const out = el("div", { class: "row" });
  const approve = el("button", { class: "primary", onclick: async () => {
    const note = prompt(`Approve ${id} → CANON?\nOptional note:`, "");
    if (note === null) return;
    try {
      const res = await api(`/api/entities/${encodeURIComponent(id)}/approve`, { method: "POST", body: { note } });
      flash(out, `${id} is now CANON${res.check.warnings.length ? ` (warnings: ${res.check.warnings.join("; ")})` : ""}`);
      refreshAll();
    } catch (err) { flash(out, errorText(err), true); }
  } }, "Approve → CANON");
  const reject = el("button", { class: "danger", onclick: async () => {
    const reason = prompt(`Reject ${id}. Reason (required):`, "");
    if (!reason) return;
    try {
      const res = await api(`/api/entities/${encodeURIComponent(id)}/reject`, { method: "POST", body: { reason } });
      flash(out, `${id} rejected → ${res.archived}`);
      if (selectedId === id) { selectedId = null; $("#entity-detail").replaceChildren("Select an entity."); }
      refreshAll();
    } catch (err) { flash(out, errorText(err), true); }
  } }, "Reject");
  out.append(approve, reject);
  return out;
}

function flash(container, text, isError = false) {
  container.querySelector(".flash")?.remove();
  container.append(el("div", { class: `flash ${isError ? "verdict REJECT" : "muted"}` }, text));
}

function taskReviewButtons(id) {
  const out = el("div", { class: "row" });
  out.append(
    el("button", { class: "primary", onclick: async () => {
      try {
        await api(`/api/tasks/${encodeURIComponent(id)}/approve`, { method: "POST", body: {} });
        flash(out, `${id} → BACKLOG`);
        refreshAll();
      } catch (err) { flash(out, errorText(err), true); }
    } }, "Approve → BACKLOG"),
    el("button", { class: "danger", onclick: async () => {
      const reason = prompt(`Reject ${id}. Reason (required):`, "");
      if (!reason) return;
      try {
        await api(`/api/tasks/${encodeURIComponent(id)}/reject`, { method: "POST", body: { reason } });
        flash(out, `${id} rejected`);
        refreshAll();
      } catch (err) { flash(out, errorText(err), true); }
    } }, "Reject"),
  );
  return out;
}

function taskCard(t) {
  return el("div", { class: "card" },
    el("header", {}, el("span", {}, el("strong", {}, t.id), " ", t.title), statusTag("PROPOSED")),
    el("div", { class: "muted" }, `${t.owner}${t.source ? ` · from ${t.source}` : ""}${t.dependencies?.length ? ` · deps: ${t.dependencies.join(", ")}` : ""}`),
    t.goal ? el("p", {}, t.goal) : null,
    el("details", {}, el("summary", {}, "acceptance criteria"),
      el("ul", {}, (t.acceptance_criteria ?? []).map((c) => el("li", {}, c))),
      t.out_of_scope?.length ? el("div", { class: "muted" }, `out of scope: ${t.out_of_scope.join("; ")}`) : null),
    taskReviewButtons(t.id));
}

async function loadReview() {
  const box = $("#review-list");
  try {
    const [drafts, reviews, board] = await Promise.all([
      api("/api/entities?status=DRAFT"), api("/api/entities?status=REVIEW"), api("/api/tasks"),
    ]);
    const items = [...reviews, ...drafts];
    const proposed = board.PROPOSED ?? [];
    $("#review-count").textContent = items.length + proposed.length || "";
    if (!items.length && !proposed.length) return box.replaceChildren(el("p", { class: "muted" }, "Nothing waiting for review."));
    const cards = await Promise.all(items.map(async (r) => {
      const data = await api(`/api/entities/${encodeURIComponent(r.id)}`);
      return el("div", { class: "card" },
        el("header", {}, el("span", {}, el("strong", {}, r.id), " ", r.name), statusTag(r.status)),
        el("details", {}, el("summary", { class: "muted" }, r.file), el("pre", {}, JSON.stringify(data.entity, null, 2))),
        checkView(data.check),
        reviewButtons(r.id));
    }));
    box.replaceChildren(
      proposed.length ? el("h3", {}, `Proposed code tasks (${proposed.length})`) : null,
      ...proposed.map(taskCard),
      items.length ? el("h3", {}, `Entities (${items.length})`) : null,
      ...cards,
    );
  } catch (err) {
    box.replaceChildren(el("p", { class: "verdict REJECT" }, errorText(err)));
  }
}

// ---------- new draft ----------
function parseDraft() {
  try {
    return { type: $("#d-type").value, entity: JSON.parse($("#d-json").value) };
  } catch (err) {
    $("#d-result").replaceChildren(el("div", { class: "verdict REJECT" }, `Invalid JSON: ${err.message}`));
    return null;
  }
}
$("#d-check").addEventListener("click", async () => {
  const body = parseDraft();
  if (!body) return;
  body.entity = { ...body.entity, status: "DRAFT", version: 1 };
  try { $("#d-result").replaceChildren(checkView(await api("/api/check", { method: "POST", body }))); }
  catch (err) { $("#d-result").replaceChildren(el("div", { class: "verdict REJECT" }, errorText(err))); }
});
$("#draft-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = parseDraft();
  if (!body) return;
  try {
    const res = await api("/api/entities", { method: "POST", body });
    $("#d-result").replaceChildren(el("div", {}, `Created ${res.entity.id} → ${res.file}`), checkView(res.check));
    refreshAll();
  } catch (err) {
    $("#d-result").replaceChildren(el("div", { class: "verdict REJECT" }, errorText(err)));
  }
});
let PREFIX = {};
const CHARACTER_ATTRIBUTES = ["strength", "agility", "endurance", "perception", "intelligence", "resolve", "reaction"];
$("#d-type").addEventListener("change", () => {
  try {
    const entity = JSON.parse($("#d-json").value);
    if (typeof entity.id === "string" && Object.values(PREFIX).some((p) => entity.id === p)) {
      entity.id = PREFIX[$("#d-type").value] ?? "";
      if ($("#d-type").value === "characters" && !entity.attributes) {
        entity.attributes = Object.fromEntries(CHARACTER_ATTRIBUTES.map((a) => [a, 1]));
      }
      $("#d-json").value = JSON.stringify(entity, null, 2);
    }
  } catch {}
});

// ---------- tasks ----------
let taskStatuses = ["BACKLOG", "ACTIVE", "REVIEW", "DONE", "BLOCKED"];

async function moveTask(id, status) {
  try { await api(`/api/tasks/${encodeURIComponent(id)}/move`, { method: "POST", body: { status } }); }
  catch (err) { alert(errorText(err)); }
  loadTasks();
}

async function loadTasks() {
  const board = $("#board");
  try {
    const data = await api("/api/tasks");
    board.replaceChildren(...taskStatuses.map((status) => {
      const col = el("div", { class: "column", "data-status": status },
        el("h3", {}, `${status} (${data[status].length})`),
        data[status].map((t) => el("div", { class: "task", draggable: "true",
          ondragstart: (e) => e.dataTransfer.setData("text/plain", t.id) },
          el("div", { class: "tid" }, `${t.id} · ${t.owner}`),
          el("div", {}, t.title),
          el("details", {}, el("summary", {}, "acceptance criteria"),
            el("ul", {}, (t.acceptance_criteria ?? []).map((c) => el("li", {}, c)))),
          el("select", { "aria-label": `Move ${t.id}`, onchange: (e) => moveTask(t.id, e.target.value) },
            taskStatuses.map((s) => el("option", { value: s, selected: s === status }, s))),
        )));
      col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("over"); });
      col.addEventListener("dragleave", () => col.classList.remove("over"));
      col.addEventListener("drop", (e) => {
        e.preventDefault();
        col.classList.remove("over");
        moveTask(e.dataTransfer.getData("text/plain"), status);
      });
      return col;
    }));
  } catch (err) {
    board.replaceChildren(el("p", { class: "verdict REJECT" }, errorText(err)));
  }
}

// ---------- runs ----------
let roleLabels = {};

function verdictTag(v) {
  return el("span", { class: `verdict ${v}` }, v);
}

function runCard(run, { compact = false } = {}) {
  // Accepts a full run (from /api/runs/:id) or the Director's summary of one.
  const id = run.id ?? run.run_id;
  const route = run.route?.assignments ? run.route.assignments.map((a) => a.role) : run.route ?? [];
  const merge = run.merge ?? { summary: run.summary, conflicts: run.conflicts ?? [], open_questions: run.open_questions ?? [] };
  const created = [
    ...(run.created?.entities ?? []).map((e) => el("li", {}, el("a", { href: "#", onclick: (ev) => { ev.preventDefault(); showTab("entities"); showEntity(e.id); } }, e.id), " DRAFT ", verdictTag(e.verdict))),
    ...(run.created?.tasks ?? []).map((t) => el("li", {}, `${t.id} PROPOSED — ${t.title}`)),
  ];
  return el("div", { class: "run" },
    el("div", { class: "row" }, el("strong", {}, id), el("span", { class: "muted" }, `${run.engine}${run.ms ? ` · ${(run.ms / 1000).toFixed(1)}s` : ""}`)),
    el("div", { class: "route" }, ["Director", "Router", ...route.map((r) => roleLabels[r] ?? r), "Merger"].flatMap((step, i, arr) =>
      [el("span", { class: "chip" }, step), i < arr.length - 1 ? el("span", { class: "muted" }, "→") : null])),
    el("ul", { class: "reports" }, (run.reports ?? []).map((r) => el("li", {},
      el("strong", {}, roleLabels[r.role] ?? r.role), " ", verdictTag(r.verdict), r.summary ? ` — ${r.summary}` : "", r.error ? ` — ${r.error}` : "",
      !compact && r.findings?.length ? el("ul", {}, r.findings.map((f) => el("li", { class: f.severity === "blocking" ? "verdict REJECT" : "" },
        `[${f.severity}] ${f.issue}${f.ids?.length ? ` (${f.ids.join(", ")})` : ""}`))) : null))),
    !compact && merge.summary ? el("div", { class: "merge" }, el("strong", {}, "Merger: "), merge.summary) : null,
    merge.error ? el("div", { class: "verdict REJECT" }, `merge failed, mechanical merge used: ${merge.error}`) : null,
    merge.conflicts?.length ? el("div", {}, el("strong", {}, "Conflicts"), el("ul", {}, merge.conflicts.map((c) => el("li", {}, c)))) : null,
    merge.open_questions?.length ? el("div", {}, el("strong", {}, "Open questions"), el("ul", {}, merge.open_questions.map((q) => el("li", {}, q)))) : null,
    el("div", {}, el("strong", {}, created.length ? "Waiting for your approval:" : "Nothing created."), created.length ? el("ul", {}, created) : null),
    (run.failed ?? []).length ? el("ul", {}, run.failed.map((f) => el("li", { class: "verdict REJECT" }, `✗ ${f.kind} ${f.title ?? f.type ?? ""}: ${f.error}`))) : null,
    compact ? el("button", { onclick: () => { showTab("runs"); showRun(id); } }, "Open run") : null,
  );
}

async function loadRuns() {
  const list = $("#run-list");
  try {
    const runs = await api("/api/runs");
    if (!runs.length) return list.replaceChildren(el("li", { class: "muted" }, "No runs yet."));
    list.replaceChildren(...runs.map((r) => el("li", { onclick: () => showRun(r.id) },
      el("span", {}, el("span", { class: "id" }, r.id), " ", r.request.slice(0, 80)),
      el("span", { class: "muted" }, `${r.created.entities.length}+${r.created.tasks.length}`))));
  } catch (err) {
    list.replaceChildren(el("li", { class: "verdict REJECT" }, errorText(err)));
  }
}

async function showRun(id) {
  const box = $("#run-detail");
  try {
    const run = await api(`/api/runs/${encodeURIComponent(id)}`);
    box.replaceChildren(el("p", {}, el("strong", {}, "Request: "), run.request), runCard(run));
  } catch (err) {
    box.replaceChildren(el("div", { class: "verdict REJECT" }, errorText(err)));
  }
}

// ---------- chat ----------
const history = [];

function renderMessage(role, content, actions = []) {
  const node = el("div", { class: `msg ${role}` }, content);
  for (const a of actions) if (a.run) node.append(runCard(a.run, { compact: true }));
  if (actions.length) {
    node.append(el("div", { class: "actions" }, actions.map((a) =>
      el("div", { class: a.ok ? "" : "err" }, `${a.ok ? "✓" : "✗"} ${a.tool}${a.input?.id ? ` ${a.input.id}` : a.input?.entity?.id ? ` ${a.input.entity.id}` : ""}${a.error ? ` — ${a.error}` : ""}`))));
  }
  $("#chat-log").append(node);
  node.scrollIntoView({ block: "end" });
}

$("#chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  history.push({ role: "user", content: text });
  renderMessage("user", text);
  $("#chat-send").disabled = true;
  try {
    const res = await api("/api/chat", { method: "POST", body: { messages: history } });
    history.push({ role: "assistant", content: res.reply });
    renderMessage("assistant", res.reply, res.actions);
    if (res.actions.some((a) => a.mutating && a.ok)) refreshAll();
  } catch (err) {
    history.pop();
    renderMessage("assistant", `Error: ${errorText(err)}`);
  } finally {
    $("#chat-send").disabled = false;
    input.focus();
  }
});
$("#run-agents").addEventListener("click", async () => {
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text) return input.focus();
  input.value = "";
  renderMessage("user", `▶ ${text}`);
  const btn = $("#run-agents");
  btn.disabled = $("#chat-send").disabled = true;
  const pending = el("div", { class: "msg assistant muted" }, "Agents are working… (Router → specialists → Merger)");
  $("#chat-log").append(pending);
  try {
    const run = await api("/api/runs", { method: "POST", body: { request: text } });
    pending.remove();
    $("#chat-log").append(el("div", { class: "msg assistant" }, runCard(run, { compact: true })));
    refreshAll();
  } catch (err) {
    pending.replaceChildren(`Error: ${errorText(err)}`);
  } finally {
    btn.disabled = $("#chat-send").disabled = false;
  }
});
$("#chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("#chat-form").requestSubmit();
});

// ---------- boot ----------
function refreshAll() {
  loadRuns();
  loadEntities();
  loadReview();
  loadTasks();
  if (selectedId) showEntity(selectedId);
}

(async () => {
  const health = await api("/api/health");
  $("#director-badge").textContent = `director: ${health.director}`;
  taskStatuses = health.taskStatuses;
  PREFIX = health.entityPrefixes;
  roleLabels = health.roles;
  for (const t of health.entityTypes) {
    $("#f-type").append(el("option", { value: t }, t));
    $("#d-type").append(el("option", { value: t, selected: t === "traits" }, t));
  }
  renderMessage("assistant", health.director === "claude"
    ? "Director online. Вопросы — отвечу сам; работу над контентом отдам агентам (или жми ▶ Agents, чтобы запустить их напрямую)."
    : "Director в офлайн-режиме (нет ANTHROPIC_API_KEY). Напиши «help», чтобы увидеть команды. ▶ Agents запускает пайплайн в офлайн-режиме.");
  refreshAll();
})();
