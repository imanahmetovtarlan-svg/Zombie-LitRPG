// Run records: one JSON file per pipeline run in orchestrator/runs/ (local, gitignored).
import fs from "node:fs";
import path from "node:path";
import { runsDir } from "../paths.js";
import { RegistryError } from "../registry.js";

const RUN_ID_RE = /^RUN-\d{8}-\d{6}-[a-z0-9]{4}$/;

export function newRunId(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `RUN-${stamp}-${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`;
}

export function saveRun(run) {
  fs.mkdirSync(runsDir(), { recursive: true });
  fs.writeFileSync(path.join(runsDir(), `${run.id}.json`), JSON.stringify(run, null, 2) + "\n");
}

export function getRun(id) {
  if (!RUN_ID_RE.test(String(id))) throw new RegistryError(`Invalid run id "${id}"`);
  const file = path.join(runsDir(), `${id}.json`);
  if (!fs.existsSync(file)) throw new RegistryError(`Run ${id} not found`, 404);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function listRuns({ limit = 50 } = {}) {
  if (!fs.existsSync(runsDir())) return [];
  return fs.readdirSync(runsDir())
    .filter((n) => RUN_ID_RE.test(n.replace(/\.json$/, "")))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((n) => {
      const run = JSON.parse(fs.readFileSync(path.join(runsDir(), n), "utf8"));
      return {
        id: run.id,
        at: run.at,
        engine: run.engine,
        request: run.request,
        route: run.route.assignments.map((a) => a.role),
        created: run.created,
        failed: run.failed.length,
      };
    });
}
