import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cc-runtime-"));
for (const dir of ["project_data", "tasks", "orchestrator/prompts", "docs"]) {
  fs.cpSync(path.join(repo, dir), path.join(tmp, dir), { recursive: true });
}
process.env.CC_ROOT = tmp;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { runPipeline } = await import("../lib/runtime/pipeline.js");
const { offlineEngine } = await import("../lib/runtime/offlineEngine.js");
const { getRun, listRuns } = await import("../lib/runtime/runs.js");
const { listTasks, approveTask, rejectTask } = await import("../lib/tasks.js");
const { readEntity } = await import("../lib/registry.js");
const { chat } = await import("../lib/director/offline.js");

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const SEVEN = { strength: 1, agility: 1, endurance: 1, perception: 1, intelligence: 1, resolve: 1, reaction: 1 };
const report = (extra = {}) => ({ verdict: "INFO", summary: "ok", findings: [], entity_proposals: [], task_proposals: [], ...extra });

// Stands in for the Claude engine: records calls, returns scripted outputs.
function fakeEngine({ merge, specialist } = {}) {
  const calls = { specialists: [] };
  return {
    name: "fake",
    calls,
    async route() {
      return {
        reasoning: "test",
        assignments: [
          { role: "character", brief: "design a medic" },
          { role: "technical", brief: "tasks" },
          { role: "character", brief: "duplicate" },
          { role: "not_a_role", brief: "x" },
        ],
      };
    },
    async specialist(a, ctx) {
      calls.specialists.push(a.role);
      if (specialist) return specialist(a, ctx);
      return report();
    },
    async merge(ctx, reports) {
      calls.reports = reports;
      return merge ?? { summary: "merged", entity_proposals: [], task_proposals: [], conflicts: [], open_questions: [] };
    },
  };
}

test("router output is normalized: canon is mandatory, duplicates and unknown roles dropped", async () => {
  const engine = fakeEngine();
  const run = await runPipeline({ request: "сделай медика", engine });
  assert.deepEqual(run.route.assignments.map((a) => a.role), ["canon", "character", "technical"]);
  assert.deepEqual(engine.calls.specialists.sort(), ["canon", "character", "technical"]);
  assert.deepEqual(getRun(run.id).route, run.route);
});

test("merged proposals become DRAFT entities and PROPOSED tasks, never CANON/BACKLOG", async () => {
  const merge = {
    summary: "Медик-санитар",
    entity_proposals: [
      { type: "professions", entity_json: JSON.stringify({ id: "PROF_SANITAR", name: "Санитар", status: "CANON", version: 5 }), rationale: "r" },
      { type: "characters", entity_json: JSON.stringify({ id: "CHAR_NURSE_001", name: "Медсестра", attributes: SEVEN, profession: "PROF_SANITAR" }), rationale: "r" },
      { type: "characters", entity_json: JSON.stringify({ id: "CHAR_BAD", name: "Bad", attributes: { speed: 1 } }), rationale: "r" },
      { type: "professions", entity_json: "{not json", rationale: "r" },
    ],
    task_proposals: [
      { title: "Medic role data", owner: "Technical Agent", goal: "g", acceptance_criteria: ["loads"], dependencies: ["TASK-0001"], out_of_scope: [], rationale: "r" },
      { title: "Broken deps", owner: "Technical Agent", goal: "g", acceptance_criteria: ["x"], dependencies: ["TASK-9999"], out_of_scope: [], rationale: "r" },
    ],
    conflicts: ["character vs historical: field nurse uniform"],
    open_questions: ["механизм заражения"],
  };
  const run = await runPipeline({ request: "добавь медика", brief: "b", engine: fakeEngine({ merge }) });

  assert.deepEqual(run.created.entities.map((e) => e.id), ["PROF_SANITAR", "CHAR_NURSE_001"]);
  for (const { id } of run.created.entities) assert.equal(readEntity(id).entity.status, "DRAFT");
  assert.equal(readEntity("PROF_SANITAR").entity.version, 1);
  assert.equal(run.failed.filter((f) => f.kind === "entity").length, 2, "invalid entity and bad JSON are reported, not saved");
  assert.ok(run.failed.some((f) => f.kind === "task" && /TASK-9999/.test(f.error)));

  const [task] = run.created.tasks;
  const board = listTasks();
  assert.ok(board.PROPOSED.some((t) => t.id === task.id && t.source === run.id));
  assert.ok(!board.BACKLOG.some((t) => t.id === task.id));
  assert.equal(run.merge.open_questions[0], "механизм заражения");

  assert.equal(approveTask(task.id).status, "BACKLOG");
  assert.throws(() => approveTask(task.id), /Only PROPOSED/);
});

test("a failing specialist does not sink the run, and a failing merger falls back", async () => {
  const engine = fakeEngine({
    specialist: (a) => {
      if (a.role === "technical") throw new Error("boom");
      return report({ entity_proposals: a.role === "character"
        ? [{ type: "traits", entity_json: JSON.stringify({ id: "TRAIT_STEADY_HANDS", name: "Твёрдые руки" }), rationale: "r" }] : [] });
    },
  });
  engine.merge = async () => { throw new Error("merger down"); };
  const run = await runPipeline({ request: "x", engine });
  const tech = run.reports.find((r) => r.role === "technical");
  assert.equal(tech.verdict, "ERROR");
  assert.equal(tech.error, "boom");
  assert.equal(run.merge.error, "merger down");
  assert.deepEqual(run.created.entities.map((e) => e.id), ["TRAIT_STEADY_HANDS"]);
});

test("offline engine routes by keywords and blocks anachronisms", async () => {
  const route = await offlineEngine.route({ request: "Дай герою автомат Калашникова и грузовик", brief: "" });
  const roles = route.assignments.map((a) => a.role);
  for (const r of ["canon", "historical", "character"]) assert.ok(roles.includes(r), roles.join(","));

  const run = await runPipeline({
    request: 'Добавь предмет с калашниковым {"id":"ITEM_AK","name":"АК-47"}',
    engine: offlineEngine,
  });
  const hist = run.reports.find((r) => r.role === "historical");
  assert.equal(hist.verdict, "REJECT");
  assert.equal(run.created.entities.length, 0, "historical REJECT blocks drafts");
});

test("offline pipeline checks and drafts pasted entities", async () => {
  const res = await chat([{ role: "user", content: 'run добавь профессию {"id":"PROF_SAPER","name":"Сапёр","period":"1945-1946"}' }]);
  assert.match(res.reply, /PROF_SAPER \(DRAFT\)/);
  assert.equal(readEntity("PROF_SAPER").entity.status, "DRAFT");
  const action = res.actions.find((a) => a.tool === "delegate");
  assert.ok(action.ok && action.mutating && action.run.run_id);
  assert.ok(listRuns().some((r) => r.id === action.run.run_id));
});

test("rejecting a proposed task archives it and keeps its id reserved", async () => {
  const run = await runPipeline({
    request: "t",
    engine: fakeEngine({ merge: { summary: "", entity_proposals: [], conflicts: [], open_questions: [],
      task_proposals: [{ title: "T", owner: "QA Agent", goal: "", acceptance_criteria: ["a"], dependencies: [], out_of_scope: [], rationale: "" }] } }),
  });
  const id = run.created.tasks[0].id;
  assert.throws(() => rejectTask(id, {}), /reason/);
  rejectTask(id, { reason: "not now" });
  assert.ok(!Object.values(listTasks()).flat().some((t) => t.id === id));
  const next = await runPipeline({
    request: "t2",
    engine: fakeEngine({ merge: { summary: "", entity_proposals: [], conflicts: [], open_questions: [],
      task_proposals: [{ title: "T2", owner: "QA Agent", goal: "", acceptance_criteria: ["a"], dependencies: [], out_of_scope: [], rationale: "" }] } }),
  });
  assert.notEqual(next.created.tasks[0].id, id);
});
