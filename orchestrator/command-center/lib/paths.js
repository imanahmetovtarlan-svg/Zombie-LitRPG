import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Repo root. Overridable so tests can run against a temporary copy.
export function repoRoot() {
  return process.env.CC_ROOT ? path.resolve(process.env.CC_ROOT) : path.resolve(here, "../../..");
}

export const dataDir = () => path.join(repoRoot(), "project_data");
export const rejectedDir = () => path.join(dataDir(), "_rejected");
export const tasksDir = () => path.join(repoRoot(), "tasks");
export const decisionsLog = () => path.join(repoRoot(), "orchestrator", "decisions.jsonl");
export const promptsDir = () => path.join(repoRoot(), "orchestrator", "prompts");
export const runsDir = () => path.join(repoRoot(), "orchestrator", "runs");
