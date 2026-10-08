import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cc-test-"));
for (const dir of ["project_data", "tasks", "orchestrator/prompts", "docs"]) {
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
  const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, "project_data/characters/CHAR_MAIN_001.json"), "utf8"));
  assert.deepEqual(one.body.entity, onDisk);
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
  const maxId = Math.max(...Object.values(board.body).flat().map((x) => Number(x.id.slice(5))));
  const t = createTask({ title: "Inventory grid", owner: "Technical Agent", acceptance_criteria: ["grid renders"], dependencies: ["TASK-0001"] });
  assert.equal(t.id, `TASK-${String(maxId + 1).padStart(4, "0")}`);
  assert.ok((await call("GET", "/api/tasks")).body.BACKLOG.some((x) => x.id === t.id));
});

const SEVEN = { strength: 1, agility: 1, endurance: 1, perception: 1, intelligence: 1, resolve: 1, reaction: 1 };

test("canon check flags non-CANON references (incl. profession) when approving a character", async () => {
  await call("POST", "/api/entities", {
    type: "professions", entity: { id: "PROF_TEST_MEDIC", name: "Test medic" },
  });
  const created = await call("POST", "/api/entities", {
    type: "characters",
    entity: { id: "CHAR_TEST_REF", name: "Ref test", attributes: SEVEN, profession: "PROF_TEST_MEDIC", traits: ["TRAIT_NOPE"] },
  });
  assert.equal(created.status, 201);
  const res = await call("GET", "/api/entities/CHAR_TEST_REF");
  assert.equal(res.body.check.verdict, "PASS_WITH_WARNINGS");
  assert.ok(res.body.check.warnings.some((w) => w.includes("PROF_TEST_MEDIC") && w.includes("not CANON")));
  assert.ok(res.body.check.warnings.some((w) => w.includes("missing entity TRAIT_NOPE")));
});

test("characters must use exactly the seven canonical attributes", async () => {
  const { checkEntity } = await import("../lib/registry.js");
  const base = { id: "CHAR_T", name: "T", status: "DRAFT", version: 1 };
  assert.equal(checkEntity("characters", { ...base, attributes: SEVEN }).verdict, "PASS");
  const old = checkEntity("characters", { ...base, attributes: { ...SEVEN, speed: 1, will: 1 } });
  assert.equal(old.verdict, "REJECT");
  assert.ok(old.errors.some((e) => e.includes('"speed"')));
  const { resolve, ...six } = SEVEN;
  assert.ok(checkEntity("characters", { ...base, attributes: six }).errors.some((e) => e.includes('"resolve"')));
});

test("new Zaraza entity types are accepted with their prefixes", async () => {
  for (const [type, id] of [["infected", "INFECTED_T1"], ["vehicles", "VEHICLE_T1"], ["districts", "DISTRICT_T1"],
    ["hives", "HIVE_T1"], ["technology", "TECH_T1"]]) {
    const res = await call("POST", "/api/entities", { type, entity: { id, name: id } });
    assert.equal(res.status, 201, `${type}: ${JSON.stringify(res.body)}`);
  }
  assert.equal((await call("POST", "/api/entities", { type: "hives", entity: { id: "TECH_X", name: "x" } })).status, 400);
});

test("repo data passes the canon check", async () => {
  const all = (await call("GET", "/api/entities")).body;
  assert.ok(all.length > 0);
  for (const e of all) {
    const res = await call("GET", `/api/entities/${e.id}`);
    assert.notEqual(res.body.check.verdict, "REJECT", `${e.id}: ${res.body.check.errors.join("; ")}`);
  }
});

test("Director can read canon docs, but nothing outside the allowlist", async () => {
  const res = await chat("doc world_rules");
  assert.match(res.body.reply, /core_attributes/);
  const bad = await chat("doc ../../etc/passwd");
  assert.match(bad.body.reply, /^Error: Unknown doc/);
});
