// Tools the Director may use: read-only inspection plus delegate, which runs the multi-agent
// pipeline (Router -> specialists -> Merger). The Director never writes files itself and has
// no approve/reject/promote tool: CANON promotion is a user-only action in the Review panel.
import { READ_TOOLS, isReadTool, runReadTool, DOCS } from "../runtime/readTools.js";
import { runPipeline } from "../runtime/pipeline.js";

export { DOCS };

export const TOOLS = [
  ...READ_TOOLS,
  {
    name: "delegate",
    description:
      "Run the multi-agent pipeline for a request that needs new or changed content, design, or implementation work: " +
      "the Router picks specialists (canon, historical, game_design, character, level, asset, technical, qa), they work in " +
      "parallel, the Merger combines their reports. Results are saved as DRAFT entities and PROPOSED tasks for the user to " +
      "approve. Returns the run with each agent's verdict and what was created.",
    input_schema: {
      type: "object",
      properties: {
        request: { type: "string", description: "The user's request, verbatim or lightly cleaned up" },
        brief: { type: "string", description: "Your brief: goal, constraints, relevant IDs/docs, what a good result looks like" },
      },
      required: ["request", "brief"],
      additionalProperties: false,
    },
  },
];

// Tools whose results change files; the UI refreshes its panels after these.
export const MUTATING_TOOLS = new Set(["delegate"]);

export async function runTool(name, input = {}) {
  if (isReadTool(name)) return runReadTool(name, input);
  if (name === "delegate") return summarizeRun(await runPipeline({ request: input.request, brief: input.brief }));
  throw new Error(`Unknown tool ${name}`);
}

// Compact view of a run for the Director's context.
export function summarizeRun(run) {
  return {
    run_id: run.id,
    engine: run.engine,
    route: run.route.assignments.map((a) => a.role),
    reports: run.reports.map((r) => ({ role: r.role, verdict: r.verdict, summary: r.summary, error: r.error })),
    summary: run.merge.summary,
    conflicts: run.merge.conflicts,
    open_questions: run.merge.open_questions,
    created: run.created,
    failed: run.failed,
  };
}
