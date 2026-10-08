// Director backed by Claude via the Anthropic SDK (manual tool-use loop).
import fs from "node:fs";
import path from "node:path";
import { promptsDir } from "../paths.js";
import { TOOLS, MUTATING_TOOLS, runTool } from "./tools.js";

const MODEL = process.env.DIRECTOR_MODEL || "claude-opus-5-5";
const MAX_STEPS = 12;

const RUNTIME_RULES = `
## Command Center runtime
You are running inside the Command Center. You act on the project only through your tools.
- Read the canon sources with read_doc (WORLD_BIBLE, WORLD_RULES) before proposing setting content, and apply the
  HISTORICAL_CONSISTENCY checklist to ordinary technology, weapons, transport, medicine and logistics.
- Search with list_entities / read_entity before creating anything new.
- Run check_canon on a candidate before create_draft and report the verdict.
- create_draft only saves DRAFT files. You cannot approve, reject or promote anything:
  the user does that in the Review panel. Never claim something is CANON unless its file says so.
- Answer in the user's language. End with the IDs/files affected, if any.`;

function systemPrompt() {
  const director = fs.readFileSync(path.join(promptsDir(), "DIRECTOR.md"), "utf8");
  return director + "\n" + RUNTIME_RULES;
}

let clientPromise;
async function getClient() {
  clientPromise ??= import("@anthropic-ai/sdk").then(({ default: Anthropic }) => new Anthropic());
  return clientPromise;
}

export async function isAvailable() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return false;
  try {
    await getClient();
    return true;
  } catch {
    return false;
  }
}

// history: [{role: "user"|"assistant", content: string}], last entry is the new user message.
export async function chat(history) {
  const client = await getClient();
  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  const actions = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
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
        const result = runTool(block.name, block.input);
        actions.push({ tool: block.name, input: block.input, ok: true, mutating: MUTATING_TOOLS.has(block.name) });
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
