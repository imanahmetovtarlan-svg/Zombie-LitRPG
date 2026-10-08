// Shared Claude access for the Director and the runtime agents.
import { READ_TOOLS, isReadTool, runReadTool } from "./readTools.js";

export const DIRECTOR_MODEL = process.env.DIRECTOR_MODEL || "claude-opus-5-5";
export const AGENT_MODEL = process.env.AGENT_MODEL || DIRECTOR_MODEL;

let clientPromise;
export async function getClient() {
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

// Common request fields: adaptive thinking, explicit effort, server-side refusal fallback.
export function baseRequest({ model = AGENT_MODEL, effort = "medium" } = {}) {
  return {
    model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
}

export async function runToolBlocks(blocks, execute) {
  const results = [];
  for (const block of blocks) {
    try {
      const result = await execute(block.name, block.input);
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    } catch (err) {
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        is_error: true,
        content: JSON.stringify({ error: err.message, details: err.details }),
      });
    }
  }
  return results;
}

// One agent turn: optional read-only tool use, then a final answer constrained to `schema`.
export async function structuredCall({ system, user, schema, effort = "medium", tools = true, maxSteps = 8 }) {
  const client = await getClient();
  const messages = [{ role: "user", content: user }];
  const base = baseRequest({ effort });

  for (let step = 0; step < maxSteps; step++) {
    const lastStep = step === maxSteps - 1;
    const response = await client.beta.messages.create({
      ...base,
      output_config: { ...base.output_config, format: { type: "json_schema", schema } },
      system,
      // On the last step tools stay declared (history may hold tool_use blocks) but cannot be called.
      ...(tools ? { tools: READ_TOOLS, ...(lastStep ? { tool_choice: { type: "none" } } : {}) } : {}),
      messages,
    });

    if (response.stop_reason === "refusal") throw new Error("model declined the request");
    if (response.stop_reason === "max_tokens") throw new Error("response hit max_tokens");
    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter((b) => b.type === "tool_use");
    if (response.stop_reason === "tool_use" && toolUses.length) {
      const results = await runToolBlocks(toolUses, (name, input) => {
        if (!isReadTool(name)) throw new Error(`Tool ${name} is not available to agents`);
        return runReadTool(name, input);
      });
      messages.push({ role: "user", content: results });
      continue;
    }

    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return JSON.parse(text);
  }
  throw new Error("agent did not finish within its step budget");
}
