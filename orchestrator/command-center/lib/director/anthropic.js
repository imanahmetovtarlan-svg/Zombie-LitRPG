// Director backed by Claude (manual tool-use loop). It inspects with read-only tools and hands
// all content/design/implementation work to the multi-agent pipeline via `delegate`.
import fs from "node:fs";
import path from "node:path";
import { promptsDir } from "../paths.js";
import { TOOLS, MUTATING_TOOLS, runTool } from "./tools.js";
import { getClient, baseRequest, DIRECTOR_MODEL } from "../runtime/llm.js";

export { isAvailable } from "../runtime/llm.js";

const MAX_STEPS = 12;
const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

const RUNTIME_RULES = `
## Command Center runtime
You are the only agent the user talks to. You act on the project only through your tools.
- Questions about existing canon, entities or tasks: answer yourself with read_doc / list_entities / read_entity / list_tasks.
- Anything that creates or changes lore, mechanics, entities, assets or implementation work: call delegate once with the
  user's request and a precise brief (goal, constraints, relevant IDs and docs, what a good result looks like).
  The Router picks specialists, the Merger combines them, and results are saved as DRAFT entities / PROPOSED tasks.
- After delegate, report to the user: which agents ran and their verdicts, what was created (IDs), conflicts, open questions,
  and that they must approve or reject in the Review panel. Do not restate whole entities.
- You cannot approve, reject or promote anything. Never claim something is CANON unless its file says so.
- Answer in the user's language.`;

function systemPrompt() {
  const director = fs.readFileSync(path.join(promptsDir(), "DIRECTOR.md"), "utf8");
  return director + "\n" + RUNTIME_RULES;
}

// history: [{role: "user"|"assistant", content: string}], last entry is the new user message.
export async function chat(history) {
  const client = await getClient();
  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  const actions = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.beta.messages.create({
      ...baseRequest({ model: DIRECTOR_MODEL, effort: "medium" }),
      system: systemPrompt(),
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return { reply: "Director declined this request.", actions };
    }
    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter((b) => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !toolUses.length) {
      const reply = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      return { reply: reply || "(no reply)", actions };
    }

    const results = [];
    for (const block of toolUses) {
      try {
        if (!TOOL_NAMES.has(block.name)) throw new Error(`Unknown tool ${block.name}`);
        const result = await runTool(block.name, block.input);
        actions.push({
          tool: block.name, input: block.input, ok: true, mutating: MUTATING_TOOLS.has(block.name),
          ...(block.name === "delegate" ? { run: result } : {}),
        });
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      } catch (err) {
        actions.push({ tool: block.name, input: block.input, ok: false, error: err.message });
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: JSON.stringify({ error: err.message, details: err.details }),
        });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: "Director stopped after too many tool steps. Try a narrower request.", actions };
}
