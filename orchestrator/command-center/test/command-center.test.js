import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cc-test-"));
for (const dir of ["project_data", "tasks", "orchestrator/prompts"]) {
  fs.cpSync(path.join(repo, dir), path.join(tmp, dir), { recursive: true });
}
process.env.CC_ROOT = tmp;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { handle } = await import("../server.js");
let server;
let base;

before(async () => {
  server = http.createServer(handle);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function call(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

const chat = (text) => call("POST", "/api/chat", { messages: [{ role: "user", content: text }] });

test("lists and reads entities from project_data", async () => {
  const list = await call("GET", "/api/entities?type=traits");
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((e) => e.id), ["TRAIT_ATHLETE", "TRAIT_OLD_LEG_INJURY", "TRAIT_SMOKER"]);
  const one = await call("GET", "/api/entities/CHAR_MAIN_001");
  assert.equal(one.body.entity.name, "Main Survivor");
  assert.equal(one.body.type, "characters");
  assert.equal((await call("GET", "/api/entities/NOPE_X")).status, 404);
  assert.equal((await call("GET", "/api/entities/..%2F..%2Fetc")).status, 400);
});

test("Director (offline) can list, read and create a DRAFT", async () => {
  const list = await chat("list abilities");
  assert.equal(list.body.director, "offline");
  assert.match(list.body.reply, /ABILITY_ELECTRIC_001/);
  assert.match((await chat("покажи TRAIT_SMOKER")).body.reply, /stress_without_nicotine/);

  const created = await chat("draft traits TRAIT_NIGHT_OWL Night Owl");
  assert.match(created.body.reply, /Created DRAFT TRAIT_NIGHT_OWL/);
  assert.ok(created.body.actions.some((a) => a.tool === "create_draft" && a.ok && a.mutating));
  const file = JSON.parse(fs.readFileSync(path.join(tmp, "project_data/traits/TRAIT_NIGHT_OWL.json"), "utf8"));
  assert.equal(file.status, "DRAFT");
  assert.equal(file.version, 1);
});

test("drafts never overwrite and cannot smuggle in CANON status", async () => {
  const dup = await call("POST", "/api/entities", { type: "traits", entity: { id: "TRAIT_SMOKER", name: "x" } });
  assert.equal(dup.status, 409);
  const sneaky = await call("POST", "/api/entities", {
    type: "items", entity: { id: "ITEM_CROWBAR", name: "Crowbar", status: "CANON", version: 7 },
  });
  assert.equal(sneaky.status, 201);
  assert.equal(sneaky.body.entity.status, "DRAFT");
  assert.equal(sneaky.body.entity.version, 1);
  const badPrefix = await call("POST", "/api/entities", { type: "items", entity: { id: "TRAIT_FOO", name: "x" } });
  assert.equal(badPrefix.status, 400);
  const invalid = await call("POST", "/api/entities", { type: "characters", entity: { id: "CHAR_X", name: "X" } });
  assert.equal(invalid.status, 422);
  assert.equal(invalid.body.details.verdict, "REJECT");
});

test("user can approve a DRAFT to CANON, and only DRAFT/REVIEW", async () => {
  await call("POST", "/api/entities", { type: "items", entity: { id: "ITEM_BANDAGE", name: "Bandage" } });
  const ok = await call("POST", "/api/entities/ITEM_BANDAGE/approve", { note: "looks good" });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.entity.status, "CANON");
  assert.equal((await call("POST", "/api/entities/ITEM_BANDAGE/approve")).status, 409);
  assert.equal((await call("POST", "/api/entities/ITEM_BANDAGE/reject", { reason: "x" })).status, 409);
  const log = fs.readFileSync(path.join(tmp, "orchestrator/decisions.jsonl"), "utf8");
  assert.match(log, /"action":"approve","id":"ITEM_BANDAGE"/);
});

test("user can reject a DRAFT; it is archived, not deleted", async () => {
  await call("POST", "/api/entities", { type: "items", entity: { id: "ITEM_JUNK", name: "Junk" } });
  assert.equal((await call("POST", "/api/entities/ITEM_JUNK/reject", {})).status, 400);
  const res = await call("POST", "/api/entities/ITEM_JUNK/reject", { reason: "duplicate of scrap" });
  assert.equal(res.status, 200);
  assert.equal((await call("GET", "/api/entities/ITEM_JUNK")).status, 404);
  const archived = JSON.parse(fs.readFileSync(path.join(tmp, res.body.archived), "utf8"));
  assert.equal(archived.rejection.reason, "duplicate of scrap");
});

test("no automatic CANON promotion: the Director has no approve path", async () => {
  const { TOOLS } = await import("../lib/director/tools.js");
  const names = TOOLS.map((t) => t.name);
  assert.ok(!names.some((n) => /approve|reject|promote|canon_set|status/.test(n)), names.join(","));
  const res = await chat("approve TRAIT_NIGHT_OWL");
  const file = JSON.parse(fs.readFileSync(path.join(tmp, "project_data/traits/TRAIT_NIGHT_OWL.json"), "utf8"));
  assert.equal(file.status, "DRAFT");
  assert.ok(!res.body.actions.some((a) => a.mutating));
});

test("task board shows columns and moves tasks between folders", async () => {
  const board = await call("GET", "/api/tasks");
  for (const col of ["BACKLOG", "ACTIVE", "REVIEW", "DONE"]) assert.ok(Array.isArray(board.body[col]));
  const from = Object.keys(board.body).find((col) => board.body[col].some((t) => t.id === "TASK-0001"));
  assert.ok(from, "TASK-0001 is on the board");
  const to = from === "ACTIVE" ? "DONE" : "ACTIVE";

  const moved = await call("POST", "/api/tasks/TASK-0001/move", { status: to });
  assert.equal(moved.body.status, to);
  assert.ok(fs.existsSync(path.join(tmp, `tasks/${to.toLowerCase()}/TASK-0001.json`)));
  assert.ok(!fs.existsSync(path.join(tmp, `tasks/${from.toLowerCase()}/TASK-0001.json`)));
  assert.equal((await call("POST", "/api/tasks/TASK-0001/move", { status: "LOL" })).status, 400);

  const { createTask } = await import("../lib/tasks.js");
  const t = createTask({ title: "Inventory grid", owner: "Technical Agent", acceptance_criteria: ["grid renders"], dependencies: ["TASK-0001"] });
  assert.equal(t.id, "TASK-0002");
  assert.equal((await call("GET", "/api/tasks")).body.BACKLOG[0].id, "TASK-0002");
});

test("canon check flags non-CANON references when approving a character", async () => {
  const res = await call("GET", "/api/entities/CHAR_MAIN_001");
  assert.equal(res.body.check.verdict, "PASS_WITH_WARNINGS");
  assert.ok(res.body.check.warnings.some((w) => w.includes("TRAIT_ATHLETE")));
});
