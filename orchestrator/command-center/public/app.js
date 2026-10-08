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

async function loadReview() {
  const box = $("#review-list");
  try {
    const [drafts, reviews] = await Promise.all([api("/api/entities?status=DRAFT"), api("/api/entities?status=REVIEW")]);
    const items = [...reviews, ...drafts];
    $("#review-count").textContent = items.length || "";
    if (!items.length) return box.replaceChildren(el("p", { class: "muted" }, "Nothing waiting for review."));
    const cards = await Promise.all(items.map(async (r) => {
      const data = await api(`/api/entities/${encodeURIComponent(r.id)}`);
      return el("div", { class: "card" },
        el("header", {}, el("span", {}, el("strong", {}, r.id), " ", r.name), statusTag(r.status)),
        el("details", {}, el("summary", { class: "muted" }, r.file), el("pre", {}, JSON.stringify(data.entity, null, 2))),
        checkView(data.check),
        reviewButtons(r.id));
    }));
    box.replaceChildren(...cards);
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
const PREFIX = { characters: "CHAR_", traits: "TRAIT_", abilities: "ABILITY_", items: "ITEM_", locations: "LOC_", recipes: "RECIPE_", factions: "FACTION_" };
$("#d-type").addEventListener("change", () => {
  try {
    const entity = JSON.parse($("#d-json").value);
    if (typeof entity.id === "string" && Object.values(PREFIX).some((p) => entity.id === p)) {
      entity.id = PREFIX[$("#d-type").value] ?? "";
      if ($("#d-type").value === "characters" && !entity.attributes) entity.attributes = {};
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

// ---------- chat ----------
const history = [];

function renderMessage(role, content, actions = []) {
  const node = el("div", { class: `msg ${role}` }, content);
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
$("#chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("#chat-form").requestSubmit();
});

// ---------- boot ----------
function refreshAll() {
  loadEntities();
  loadReview();
  loadTasks();
  if (selectedId) showEntity(selectedId);
}

(async () => {
  const health = await api("/api/health");
  $("#director-badge").textContent = `director: ${health.director}`;
  taskStatuses = health.taskStatuses;
  for (const t of health.entityTypes) {
    $("#f-type").append(el("option", { value: t }, t));
    $("#d-type").append(el("option", { value: t, selected: t === "traits" }, t));
  }
  renderMessage("assistant", health.director === "claude"
    ? "Director online. Что делаем?"
    : "Director в офлайн-режиме (нет ANTHROPIC_API_KEY). Напиши «help», чтобы увидеть команды.");
  refreshAll();
})();
