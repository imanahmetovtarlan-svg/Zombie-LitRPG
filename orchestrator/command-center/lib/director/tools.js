// Tools the Director may use. Deliberately no approve/reject/promote tool:
// CANON promotion is a user-only action in the Command Center UI.
import { ENTITY_TYPES, listEntities, readEntity, createDraft, checkEntity } from "../registry.js";
import { listTasks, createTask } from "../tasks.js";

const typeEnum = Object.keys(ENTITY_TYPES);

export const TOOLS = [
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
      "Run the Canon Keeper checks (schema, id prefix, duplicate names, references) on a candidate entity without saving it. " +
      "Returns PASS, PASS_WITH_WARNINGS or REJECT with reasons.",
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
    name: "create_draft",
    description:
      "Save a NEW entity as a DRAFT file in project_data/<type>/<id>.json. status is forced to DRAFT and version to 1. " +
      "Fails if the id already exists. The user must approve it in the Review panel before it becomes CANON.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: typeEnum },
        entity: {
          type: "object",
          description: "Entity JSON with at least id (prefixed per type, UPPER_SNAKE_CASE) and name",
        },
      },
      required: ["type", "entity"],
      additionalProperties: false,
    },
  },
  {
    name: "list_tasks",
    description: "Show the task board grouped by BACKLOG / ACTIVE / REVIEW / DONE / BLOCKED.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_task",
    description: "Add an atomic task to BACKLOG with an owner role, dependencies and acceptance criteria.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        owner: { type: "string", description: "Specialist role, e.g. Technical Agent" },
        acceptance_criteria: { type: "array", items: { type: "string" }, minItems: 1 },
        dependencies: { type: "array", items: { type: "string" } },
        out_of_scope: { type: "array", items: { type: "string" } },
      },
      required: ["title", "owner", "acceptance_criteria"],
      additionalProperties: false,
    },
  },
];

// Tools that change files; the UI refreshes its panels after these.
export const MUTATING_TOOLS = new Set(["create_draft", "create_task"]);

export function runTool(name, input = {}) {
  switch (name) {
    case "list_entities":
      return listEntities(input);
    case "read_entity":
      return readEntity(input.id);
    case "check_canon":
      return checkEntity(input.type, input.entity);
    case "create_draft":
      return createDraft(input.type, input.entity ?? {}, { author: "director" });
    case "list_tasks":
      return listTasks();
    case "create_task":
      return createTask(input);
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}
