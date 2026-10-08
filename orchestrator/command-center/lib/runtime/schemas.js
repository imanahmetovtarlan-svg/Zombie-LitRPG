// JSON schemas for structured outputs. Strict structured outputs require additionalProperties: false
// on every object, so free-form entity bodies travel as JSON strings (entity_json).
import { ROLE_KEYS } from "./roles.js";

const str = { type: "string" };
const strArr = { type: "array", items: str };

export const ROUTE_SCHEMA = {
  type: "object",
  properties: {
    reasoning: str,
    assignments: {
      type: "array",
      items: {
        type: "object",
        properties: { role: { type: "string", enum: ROLE_KEYS }, brief: str },
        required: ["role", "brief"],
        additionalProperties: false,
      },
    },
  },
  required: ["reasoning", "assignments"],
  additionalProperties: false,
};

const ENTITY_PROPOSAL = {
  type: "object",
  properties: {
    type: str,
    entity_json: { type: "string", description: "The full entity as a JSON object string" },
    rationale: str,
  },
  required: ["type", "entity_json", "rationale"],
  additionalProperties: false,
};

const TASK_PROPOSAL = {
  type: "object",
  properties: {
    title: str,
    owner: str,
    goal: str,
    acceptance_criteria: strArr,
    dependencies: strArr,
    out_of_scope: strArr,
    rationale: str,
  },
  required: ["title", "owner", "goal", "acceptance_criteria", "dependencies", "out_of_scope", "rationale"],
  additionalProperties: false,
};

export const REPORT_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["PASS", "PASS_WITH_WARNINGS", "NEEDS_RESEARCH", "REJECT", "INFO"] },
    summary: str,
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["blocking", "warning", "note"] },
          issue: str,
          ids: strArr,
        },
        required: ["severity", "issue", "ids"],
        additionalProperties: false,
      },
    },
    entity_proposals: { type: "array", items: ENTITY_PROPOSAL },
    task_proposals: { type: "array", items: TASK_PROPOSAL },
  },
  required: ["verdict", "summary", "findings", "entity_proposals", "task_proposals"],
  additionalProperties: false,
};

export const MERGE_SCHEMA = {
  type: "object",
  properties: {
    summary: str,
    entity_proposals: { type: "array", items: ENTITY_PROPOSAL },
    task_proposals: { type: "array", items: TASK_PROPOSAL },
    conflicts: strArr,
    open_questions: strArr,
  },
  required: ["summary", "entity_proposals", "task_proposals", "conflicts", "open_questions"],
  additionalProperties: false,
};
