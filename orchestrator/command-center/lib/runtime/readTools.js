// Read-only tools shared by the Director and every specialist agent.
import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../paths.js";
import { ENTITY_TYPES, listEntities, readEntity, checkEntity } from "../registry.js";
import { listTasks } from "../tasks.js";

// Canon sources (see docs/ORCHESTRATOR_SPEC.md "Canon sources").
export const DOCS = {
  WORLD_BIBLE: "docs/WORLD_BIBLE.md",
  WORLD_RULES: "docs/world_rules.json",
  GAME_SYSTEMS: "docs/GAME_SYSTEMS.md",
  ORCHESTRATOR_SPEC: "docs/ORCHESTRATOR_SPEC.md",
  CANON_KEEPER: "orchestrator/prompts/CANON_KEEPER.md",
  HISTORICAL_CONSISTENCY: "orchestrator/prompts/HISTORICAL_CONSISTENCY.md",
};

export function readDoc(name) {
  if (!Object.hasOwn(DOCS, name)) throw new Error(`Unknown doc ${name}. Known: ${Object.keys(DOCS).join(", ")}`);
  return { file: DOCS[name], content: fs.readFileSync(path.join(repoRoot(), DOCS[name]), "utf8") };
}

const typeEnum = Object.keys(ENTITY_TYPES);

export const READ_TOOLS = [
  {
    name: "read_doc",
    description:
      "Read a canon source document: WORLD_BIBLE and WORLD_RULES (setting rules, late 1945 / early 1946), GAME_SYSTEMS, " +
      "ORCHESTRATOR_SPEC, or the CANON_KEEPER / HISTORICAL_CONSISTENCY checklists. Open questions listed in the World Bible are not decided.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", enum: Object.keys(DOCS) } },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "list_entities",
    description:
      "List entities in project_data. Filter by type, status, and/or a free-text query matched against the whole entity JSON. " +
      "Use this to search for an existing equivalent before proposing a new entity.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: typeEnum },
        status: { type: "string", enum: ["DRAFT", "REVIEW", "CANON", "DEPRECATED"] },
        q: { type: "string", description: "Case-insensitive substring search" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "read_entity",
    description: "Read the full JSON of one entity by id, e.g. CHAR_MAIN_001.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "check_canon",
    description:
      "Run the rule-based Canon Keeper checks (schema, id prefix, seven attributes, duplicate names, references) on a candidate " +
      "entity without saving it. Returns PASS, PASS_WITH_WARNINGS or REJECT with reasons.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: typeEnum },
        entity: { type: "object", description: "Candidate entity JSON" },
      },
      required: ["type", "entity"],
      additionalProperties: false,
    },
  },
  {
    name: "list_tasks",
    description: "Show the task board grouped by PROPOSED / BACKLOG / ACTIVE / REVIEW / DONE / BLOCKED.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

const READ_NAMES = new Set(READ_TOOLS.map((t) => t.name));
export const isReadTool = (name) => READ_NAMES.has(name);

export function runReadTool(name, input = {}) {
  switch (name) {
    case "read_doc":
      return readDoc(input.name);
    case "list_entities":
      return listEntities(input);
    case "read_entity":
      return readEntity(input.id);
    case "check_canon":
      return checkEntity(input.type, { status: "DRAFT", version: 1, ...input.entity });
    case "list_tasks":
      return listTasks();
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}
