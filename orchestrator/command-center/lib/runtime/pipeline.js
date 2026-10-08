// Multi-agent runtime: DIRECTOR -> ROUTER -> specialists (parallel) -> MERGER -> DRAFT / PROPOSED.
// Nothing here can produce CANON or BACKLOG items: entities are saved as DRAFT, tasks as PROPOSED,
// and only the user's approve in the Review panel promotes them.
import { ROLES, ROLE_KEYS } from "./roles.js";
import { createDraft } from "../registry.js";
import { createTask } from "../tasks.js";
import { isAvailable } from "./llm.js";
import { claudeEngine } from "./claudeEngine.js";
import { offlineEngine } from "./offlineEngine.js";
import { newRunId, saveRun } from "./runs.js";

export async function defaultEngine() {
  return (await isAvailable()) ? claudeEngine : offlineEngine;
}

// Canon Keeper is mandatory; unknown roles and duplicates are dropped.
function normalizeRoute(route) {
  const seen = new Set();
  const assignments = [];
  for (const a of [{ role: "canon", brief: "Check IDs, duplicates, contradictions and chronology." }, ...(route?.assignments ?? [])]) {
    if (!ROLE_KEYS.includes(a?.role)) continue;
    if (seen.has(a.role)) {
      // Keep the router's more specific brief for canon if it gave one.
      if (a.role === "canon" && a.brief) assignments[0].brief = a.brief;
      continue;
    }
    seen.add(a.role);
    assignments.push({ role: a.role, brief: String(a.brief ?? "") });
  }
  return { reasoning: String(route?.reasoning ?? ""), assignments };
}

const asArray = (v) => (Array.isArray(v) ? v : []);

function applyMerge(runId, merge) {
  const created = { entities: [], tasks: [] };
  const failed = [];
  for (const p of asArray(merge.entity_proposals)) {
    try {
      const entity = typeof p.entity_json === "string" ? JSON.parse(p.entity_json) : p.entity;
      const res = createDraft(p.type, entity, { author: `runtime:${runId}` });
      created.entities.push({ id: res.entity.id, type: res.type, file: res.file, verdict: res.check.verdict });
    } catch (err) {
      failed.push({ kind: "entity", type: p.type, proposal: p.entity_json ?? p.entity, error: err.message, details: err.details });
    }
  }
  for (const t of asArray(merge.task_proposals)) {
    try {
      const task = createTask(
        {
          title: t.title,
          owner: t.owner,
          goal: t.goal,
          acceptance_criteria: t.acceptance_criteria,
          dependencies: asArray(t.dependencies),
          out_of_scope: asArray(t.out_of_scope),
        },
        { status: "PROPOSED", source: runId },
      );
      created.tasks.push({ id: task.id, title: task.title });
    } catch (err) {
      failed.push({ kind: "task", title: t.title, error: err.message });
    }
  }
  return { created, failed };
}

export async function runPipeline({ request, brief = "", engine } = {}) {
  if (!request || typeof request !== "string" || !request.trim()) throw new Error("request is required");
  engine ??= await defaultEngine();
  const ctx = { request: request.trim(), brief: String(brief ?? "") };
  const id = newRunId();
  const started = Date.now();

  const route = normalizeRoute(await engine.route(ctx));

  const reports = await Promise.all(route.assignments.map(async (assignment) => {
    const t0 = Date.now();
    try {
      const report = await engine.specialist(assignment, ctx);
      return { role: assignment.role, label: ROLES[assignment.role].label, ms: Date.now() - t0, ...report };
    } catch (err) {
      return {
        role: assignment.role, label: ROLES[assignment.role].label, ms: Date.now() - t0,
        verdict: "ERROR", summary: "", error: err.message, findings: [], entity_proposals: [], task_proposals: [],
      };
    }
  }));

  let merge;
  let mergeError;
  try {
    merge = await engine.merge(ctx, reports);
  } catch (err) {
    // A failed merge must not lose the specialists' work: fall back to the mechanical merge.
    mergeError = err.message;
    merge = await offlineEngine.merge(ctx, reports);
  }

  const { created, failed } = applyMerge(id, merge);
  const run = {
    id,
    at: new Date(started).toISOString(),
    ms: Date.now() - started,
    engine: engine.name,
    request: ctx.request,
    brief: ctx.brief,
    route,
    reports,
    merge: {
      summary: String(merge.summary ?? ""),
      conflicts: asArray(merge.conflicts),
      open_questions: asArray(merge.open_questions),
      ...(mergeError ? { error: mergeError } : {}),
    },
    created,
    failed,
  };
  saveRun(run);
  return run;
}
