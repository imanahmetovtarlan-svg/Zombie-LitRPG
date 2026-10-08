// Runtime engine backed by Claude: every role is a separate agent call with its own system prompt.
import fs from "node:fs";
import path from "node:path";
import { promptsDir, repoRoot } from "../paths.js";
import { ROLES } from "./roles.js";
import { ROUTE_SCHEMA, REPORT_SCHEMA, MERGE_SCHEMA } from "./schemas.js";
import { structuredCall } from "./llm.js";

const prompt = (file) => fs.readFileSync(path.join(promptsDir(), file), "utf8");
const worldRules = () => fs.readFileSync(path.join(repoRoot(), "docs", "world_rules.json"), "utf8");

const AGENT_CONTRACT = `
## Runtime contract
You are one specialist in a multi-agent pipeline (Director -> Router -> specialists -> Merger -> user approval).
- You can only read: read_doc, list_entities, read_entity, check_canon, list_tasks. You cannot write or approve anything.
- Stay inside your role's ownership. Leave other areas to the other specialists.
- Entity proposals: put the full entity JSON in entity_json (a JSON string). Use UPPER_SNAKE_CASE IDs with the type prefix
  (characters CHAR_, traits TRAIT_, abilities ABILITY_, items ITEM_, locations LOC_, recipes RECIPE_, factions FACTION_,
  infected INFECTED_, professions PROF_, vehicles VEHICLE_, districts DISTRICT_, hives HIVE_, technology TECH_).
  Characters use exactly seven attributes: strength, agility, endurance, perception, intelligence, resolve, reaction (human baseline 1.0).
  Run check_canon on each candidate and search for existing equivalents first.
- Task proposals are atomic implementation tasks with acceptance criteria; dependencies must be existing TASK-xxxx ids.
- Verdict: PASS / PASS_WITH_WARNINGS / NEEDS_RESEARCH / REJECT for checking roles; INFO when you only contribute content.
- Never resolve World Bible open questions; report them as findings.
- Write summary and findings in the user's language.`;

const SETTING = () => `\n## Setting rules (docs/world_rules.json)\n${worldRules()}`;

function context({ request, brief }) {
  return `User request:\n${request}\n\nDirector brief:\n${brief || "(none)"}`;
}

export const claudeEngine = {
  name: "claude",

  async route(ctx) {
    return structuredCall({
      system: prompt("ROUTER.md"),
      user: context(ctx),
      schema: ROUTE_SCHEMA,
      effort: "low",
      tools: false,
    });
  },

  async specialist(assignment, ctx) {
    const role = ROLES[assignment.role];
    return structuredCall({
      system: prompt(role.prompt) + "\n" + AGENT_CONTRACT + SETTING(),
      user: `${context(ctx)}\n\nYour assignment (${role.label}):\n${assignment.brief}`,
      schema: REPORT_SCHEMA,
      effort: "medium",
    });
  },

  async merge(ctx, reports) {
    return structuredCall({
      system: prompt("MERGER.md") + SETTING(),
      user: `${context(ctx)}\n\nSpecialist reports:\n${JSON.stringify(reports, null, 2)}`,
      schema: MERGE_SCHEMA,
      effort: "medium",
    });
  },
};
