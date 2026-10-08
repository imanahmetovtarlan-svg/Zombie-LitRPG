// Task board over tasks/<column>/<TASK-ID>.json. The folder is the status.
import fs from "node:fs";
import path from "node:path";
import { tasksDir } from "./paths.js";
import { RegistryError } from "./registry.js";

export const TASK_STATUSES = ["BACKLOG", "ACTIVE", "REVIEW", "DONE", "BLOCKED"];
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

export function moveTask(id, status) {
  if (!TASK_ID_RE.test(String(id))) throw new RegistryError(`Invalid task id "${id}"`);
  if (!TASK_STATUSES.includes(status)) throw new RegistryError(`status must be one of ${TASK_STATUSES.join(", ")}`);
  const hit = loadTasks().find((t) => t.task.id === id);
  if (!hit) throw new RegistryError(`Task ${id} not found`, 404);
  if (hit.task.status === status) return hit.task;
  write(status, hit.task);
  fs.unlinkSync(hit.file);
  return { ...hit.task, status };
}

export function createTask({ title, owner, acceptance_criteria, dependencies = [], out_of_scope = [] }) {
  if (!title || typeof title !== "string") throw new RegistryError("title is required");
  if (!owner || typeof owner !== "string") throw new RegistryError("owner is required");
  if (!Array.isArray(acceptance_criteria) || !acceptance_criteria.length ||
      acceptance_criteria.some((c) => typeof c !== "string")) {
    throw new RegistryError("acceptance_criteria must be a non-empty array of strings");
  }
  const tasks = loadTasks();
  for (const dep of dependencies) {
    if (!tasks.some((t) => t.task.id === dep)) throw new RegistryError(`Unknown dependency ${dep}`);
  }
  const next = 1 + Math.max(0, ...tasks.map((t) => Number(t.task.id.slice(5)) || 0));
  const task = {
    id: `TASK-${String(next).padStart(4, "0")}`,
    title,
    status: "BACKLOG",
    owner,
    dependencies,
    acceptance_criteria,
    out_of_scope,
  };
  write("BACKLOG", task);
  return task;
}
