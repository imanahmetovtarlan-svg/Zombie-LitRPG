// Task board over tasks/<column>/<TASK-ID>.json. The folder is the status.
// PROPOSED tasks come from agents and enter BACKLOG only through the user's approve.
import fs from "node:fs";
import path from "node:path";
import { tasksDir, decisionsLog } from "./paths.js";
import { RegistryError } from "./registry.js";

export const BOARD_STATUSES = ["BACKLOG", "ACTIVE", "REVIEW", "DONE", "BLOCKED"];
export const TASK_STATUSES = ["PROPOSED", ...BOARD_STATUSES];
const TASK_ID_RE = /^TASK-\d{4,}$/;

const folderOf = (status) => path.join(tasksDir(), status.toLowerCase());

function loadTasks() {
  const out = [];
  for (const status of TASK_STATUSES) {
    const dir = folderOf(status);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(dir, name);
      const task = JSON.parse(fs.readFileSync(file, "utf8"));
      out.push({ file, task: { ...task, status } });
    }
  }
  return out;
}

function logDecision(entry) {
  const file = decisionsLog();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

export function listTasks() {
  const board = Object.fromEntries(TASK_STATUSES.map((s) => [s, []]));
  for (const { task } of loadTasks()) board[task.status].push(task);
  return board;
}

function write(status, task) {
  const file = path.join(folderOf(status), `${task.id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...task, status }, null, 2) + "\n");
  return file;
}

function find(id) {
  if (!TASK_ID_RE.test(String(id))) throw new RegistryError(`Invalid task id "${id}"`);
  const hit = loadTasks().find((t) => t.task.id === id);
  if (!hit) throw new RegistryError(`Task ${id} not found`, 404);
  return hit;
}

function relocate(hit, status) {
  write(status, hit.task);
  fs.unlinkSync(hit.file);
  return { ...hit.task, status };
}

export function moveTask(id, status) {
  if (!BOARD_STATUSES.includes(status)) throw new RegistryError(`status must be one of ${BOARD_STATUSES.join(", ")}`);
  const hit = find(id);
  if (hit.task.status === "PROPOSED") {
    throw new RegistryError(`${id} is PROPOSED; approve or reject it in the Review panel`, 409);
  }
  if (hit.task.status === status) return hit.task;
  return relocate(hit, status);
}

export function approveTask(id, { note } = {}) {
  const hit = find(id);
  if (hit.task.status !== "PROPOSED") throw new RegistryError(`Only PROPOSED tasks can be approved (${id} is ${hit.task.status})`, 409);
  const missing = (hit.task.dependencies ?? []).filter((dep) => !loadTasks().some((t) => t.task.id === dep));
  if (missing.length) throw new RegistryError(`Unknown dependencies: ${missing.join(", ")}`, 422);
  logDecision({ action: "approve_task", id, note: note || undefined });
  return relocate(hit, "BACKLOG");
}

export function rejectTask(id, { reason } = {}) {
  const hit = find(id);
  if (hit.task.status !== "PROPOSED") throw new RegistryError(`Only PROPOSED tasks can be rejected (${id} is ${hit.task.status})`, 409);
  if (!reason || !String(reason).trim()) throw new RegistryError("A rejection reason is required");
  const dest = path.join(tasksDir(), "_rejected", `${id}.${Date.now()}.json`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify({ ...hit.task, rejection: { reason: String(reason), at: new Date().toISOString() } }, null, 2) + "\n");
  fs.unlinkSync(hit.file);
  logDecision({ action: "reject_task", id, reason: String(reason) });
  return { id, archived: path.relative(path.dirname(tasksDir()), dest) };
}

// Agents can only propose; status BACKLOG is reserved for the user's own task creation.
export function createTask(
  { title, owner, acceptance_criteria, dependencies = [], out_of_scope = [], ...extra },
  { status = "PROPOSED", source } = {},
) {
  if (!["PROPOSED", "BACKLOG"].includes(status)) throw new RegistryError("New tasks start as PROPOSED or BACKLOG");
  if (!title || typeof title !== "string") throw new RegistryError("title is required");
  if (!owner || typeof owner !== "string") throw new RegistryError("owner is required");
  if (!Array.isArray(acceptance_criteria) || !acceptance_criteria.length ||
      acceptance_criteria.some((c) => typeof c !== "string")) {
    throw new RegistryError("acceptance_criteria must be a non-empty array of strings");
  }
  if (!Array.isArray(dependencies) || !Array.isArray(out_of_scope)) {
    throw new RegistryError("dependencies and out_of_scope must be arrays");
  }
  const tasks = loadTasks();
  const archived = fs.existsSync(path.join(tasksDir(), "_rejected"))
    ? fs.readdirSync(path.join(tasksDir(), "_rejected")).map((n) => n.slice(0, n.indexOf(".")))
    : [];
  for (const dep of dependencies) {
    if (!tasks.some((t) => t.task.id === dep)) throw new RegistryError(`Unknown dependency ${dep}`);
  }
  const ids = [...tasks.map((t) => t.task.id), ...archived];
  const next = 1 + Math.max(0, ...ids.map((id) => Number(id.slice(5)) || 0));
  const allowedExtra = Object.fromEntries(
    Object.entries(extra).filter(([k]) => ["goal", "notes", "expected_files", "tests"].includes(k)),
  );
  const task = {
    id: `TASK-${String(next).padStart(4, "0")}`,
    title,
    status,
    owner,
    dependencies,
    acceptance_criteria,
    out_of_scope,
    ...allowedExtra,
    ...(source ? { source } : {}),
  };
  write(status, task);
  logDecision({ action: status === "PROPOSED" ? "propose_task" : "create_task", id: task.id, source });
  return task;
}
