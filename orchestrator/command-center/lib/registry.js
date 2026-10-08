// Entity registry over project_data/. The filesystem is the source of truth:
// one JSON file per entity at project_data/<type>/<ID>.json.
import fs from "node:fs";
import path from "node:path";
import { dataDir, rejectedDir, decisionsLog } from "./paths.js";

export const ENTITY_TYPES = {
  characters: "CHAR_",
  traits: "TRAIT_",
  abilities: "ABILITY_",
  items: "ITEM_",
  locations: "LOC_",
  recipes: "RECIPE_",
  factions: "FACTION_",
};

export const STATUSES = ["DRAFT", "REVIEW", "CANON", "DEPRECATED"];
const ID_RE = /^[A-Z][A-Z0-9_]*$/;
const CHARACTER_ATTRIBUTES = [
  "strength", "speed", "endurance", "constitution", "agility",
  "reaction", "intelligence", "perception", "will",
];

export class RegistryError extends Error {
  constructor(message, status = 400, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function assertType(type) {
  if (!Object.hasOwn(ENTITY_TYPES, type)) {
    throw new RegistryError(`Unknown entity type "${type}". Known: ${Object.keys(ENTITY_TYPES).join(", ")}`);
  }
}

function assertId(id) {
  if (typeof id !== "string" || !ID_RE.test(id)) {
    throw new RegistryError(`Invalid id "${id}". Use UPPER_SNAKE_CASE, e.g. TRAIT_SMOKER`);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

function logDecision(entry) {
  const file = decisionsLog();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

function loadAll() {
  const out = [];
  for (const type of Object.keys(ENTITY_TYPES)) {
    const dir = path.join(dataDir(), type);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(dir, name);
      try {
        out.push({ type, file, entity: readJson(file) });
      } catch (err) {
        out.push({ type, file, entity: { id: name.slice(0, -5), name: "(unreadable)", status: "INVALID" }, error: err.message });
      }
    }
  }
  return out;
}

function summarize({ type, file, entity, error }) {
  return {
    type,
    id: entity.id,
    name: entity.name,
    status: entity.status,
    version: entity.version,
    file: path.relative(path.dirname(dataDir()), file),
    ...(error ? { error } : {}),
  };
}

export function listEntities({ type, status, q } = {}) {
  if (type) assertType(type);
  const needle = q ? String(q).toLowerCase() : null;
  return loadAll()
    .filter((r) => !type || r.type === type)
    .filter((r) => !status || r.entity.status === status)
    .filter((r) => !needle || JSON.stringify(r.entity).toLowerCase().includes(needle))
    .map(summarize);
}

function find(id) {
  assertId(id);
  const hit = loadAll().find((r) => r.entity.id === id);
  if (!hit) throw new RegistryError(`Entity ${id} not found`, 404);
  return hit;
}

export function readEntity(id) {
  const { type, file, entity } = find(id);
  return { type, file: path.relative(path.dirname(dataDir()), file), entity };
}

function typeOfId(id) {
  return Object.entries(ENTITY_TYPES).find(([, prefix]) => id.startsWith(prefix))?.[0];
}

// Canon Keeper (rule-based subset): returns a verdict in the CANON_KEEPER.md format.
export function checkEntity(type, entity, { forCanon = false } = {}) {
  const errors = [];
  const warnings = [];
  const all = loadAll();

  if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
    return { verdict: "REJECT", errors: ["Entity must be a JSON object"], warnings };
  }
  if (!Object.hasOwn(ENTITY_TYPES, type)) errors.push(`Unknown entity type "${type}"`);
  if (typeof entity.id !== "string" || !ID_RE.test(entity.id)) {
    errors.push(`id must be UPPER_SNAKE_CASE (got ${JSON.stringify(entity.id)})`);
  } else if (ENTITY_TYPES[type] && !entity.id.startsWith(ENTITY_TYPES[type])) {
    errors.push(`id for ${type} must start with ${ENTITY_TYPES[type]}`);
  }
  if (typeof entity.name !== "string" || !entity.name.trim()) errors.push("name is required");
  if (!STATUSES.includes(entity.status)) errors.push(`status must be one of ${STATUSES.join(", ")}`);
  if (!Number.isInteger(entity.version) || entity.version < 1) errors.push("version must be an integer >= 1");
  for (const key of ["tags"]) {
    if (key in entity && (!Array.isArray(entity[key]) || entity[key].some((v) => typeof v !== "string"))) {
      errors.push(`${key} must be an array of strings`);
    }
  }
  if ("notes" in entity && typeof entity.notes !== "string") errors.push("notes must be a string");

  if (type === "characters") {
    const attrs = entity.attributes;
    if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) {
      errors.push("characters require an attributes object");
    } else {
      for (const [k, v] of Object.entries(attrs)) {
        if (!CHARACTER_ATTRIBUTES.includes(k)) warnings.push(`unknown attribute "${k}"`);
        else if (typeof v !== "number" || v < 0) errors.push(`attribute ${k} must be a number >= 0`);
      }
    }
    for (const key of ["traits", "abilities", "conditions", "foreign_fragments"]) {
      if (key in entity && (!Array.isArray(entity[key]) || entity[key].some((v) => typeof v !== "string"))) {
        errors.push(`${key} must be an array of strings`);
      }
    }
    const refs = [...(entity.traits ?? []), ...(entity.abilities ?? [])].filter((r) => typeof r === "string");
    for (const ref of refs) {
      const target = all.find((r) => r.entity.id === ref);
      if (!target) warnings.push(`references missing entity ${ref}`);
      else if (forCanon && target.entity.status !== "CANON") {
        warnings.push(`references ${ref} which is ${target.entity.status}, not CANON`);
      }
    }
  }

  if (typeof entity.id === "string" && typeof entity.name === "string") {
    const sameName = all.filter(
      (r) => r.entity.id !== entity.id && r.type === type &&
        typeof r.entity.name === "string" &&
        r.entity.name.trim().toLowerCase() === entity.name.trim().toLowerCase(),
    );
    for (const r of sameName) warnings.push(`possible duplicate concept: ${r.entity.id} has the same name`);
  }

  const verdict = errors.length ? "REJECT" : warnings.length ? "PASS_WITH_WARNINGS" : "PASS";
  return { verdict, errors, warnings };
}

// New content always enters as DRAFT v1. Never overwrites an existing entity.
export function createDraft(type, input, { author = "user" } = {}) {
  assertType(type);
  const entity = { ...input, status: "DRAFT", version: 1 };
  assertId(entity.id);
  const existing = loadAll().find((r) => r.entity.id === entity.id);
  if (existing) {
    throw new RegistryError(`Entity ${entity.id} already exists (${existing.entity.status}); drafts never overwrite`, 409);
  }
  const typeFromPrefix = typeOfId(entity.id);
  if (typeFromPrefix && typeFromPrefix !== type) {
    throw new RegistryError(`id prefix suggests type "${typeFromPrefix}", not "${type}"`);
  }
  const check = checkEntity(type, entity);
  if (check.verdict === "REJECT") throw new RegistryError("Draft failed validation", 422, check);
  const file = path.join(dataDir(), type, `${entity.id}.json`);
  writeJson(file, entity);
  logDecision({ action: "create_draft", id: entity.id, type, author });
  return { type, file: path.relative(path.dirname(dataDir()), file), entity, check };
}

// Explicit user action only. The Director has no tool that reaches this.
export function approveEntity(id, { note } = {}) {
  const { type, file, entity } = find(id);
  if (!["DRAFT", "REVIEW"].includes(entity.status)) {
    throw new RegistryError(`Only DRAFT or REVIEW entities can be approved (${id} is ${entity.status})`, 409);
  }
  const promoted = { ...entity, status: "CANON" };
  const check = checkEntity(type, promoted, { forCanon: true });
  if (check.verdict === "REJECT") throw new RegistryError("Canon check failed; fix the draft first", 422, check);
  writeJson(file, promoted);
  logDecision({ action: "approve", id, type, from: entity.status, note: note || undefined });
  return { type, entity: promoted, check };
}

// Rejected drafts are moved out of the registry (kept for audit), not deleted.
export function rejectEntity(id, { reason } = {}) {
  const { type, file, entity } = find(id);
  if (!["DRAFT", "REVIEW"].includes(entity.status)) {
    throw new RegistryError(`Only DRAFT or REVIEW entities can be rejected (${id} is ${entity.status})`, 409);
  }
  if (!reason || !String(reason).trim()) throw new RegistryError("A rejection reason is required");
  const dest = path.join(rejectedDir(), type, `${id}.${Date.now()}.json`);
  writeJson(dest, { ...entity, rejection: { reason: String(reason), at: new Date().toISOString() } });
  fs.unlinkSync(file);
  logDecision({ action: "reject", id, type, reason: String(reason) });
  return { type, id, archived: path.relative(path.dirname(dataDir()), dest) };
}
