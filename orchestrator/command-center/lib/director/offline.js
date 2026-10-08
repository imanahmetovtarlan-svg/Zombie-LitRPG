// Offline Director: a small command parser so the Command Center works without an API key.
// It uses the same tools as the LLM Director, so it can never approve anything either.
import { ENTITY_TYPES } from "../registry.js";
import { runTool, MUTATING_TOOLS, DOCS } from "./tools.js";

const HELP = `Offline Director (no ANTHROPIC_API_KEY set). Commands:
• list [type] [status]  /  список [тип] — list entities (types: ${Object.keys(ENTITY_TYPES).join(", ")})
• find <text>  /  найди <текст> — search entities
• show <ID>  /  покажи <ID> — read one entity (or just type the ID)
• draft <type> <ID> <name…>  /  черновик … — create a minimal DRAFT
• draft <type> {json} — create a DRAFT from JSON
• tasks  /  задачи — show the task board
• doc <${Object.keys(DOCS).join("|")}>  /  док … — read a canon document
Approve/Reject happens only in the Review panel.`;

const ID_RE = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/;

function call(actions, tool, input) {
  try {
    const result = runTool(tool, input);
    actions.push({ tool, input, ok: true, mutating: MUTATING_TOOLS.has(tool) });
    return result;
  } catch (err) {
    actions.push({ tool, input, ok: false, error: err.message });
    throw err;
  }
}

const fmtList = (rows) =>
  rows.length ? rows.map((r) => `• ${r.id} — ${r.name} [${r.status}] (${r.type})`).join("\n") : "Nothing found.";

export async function chat(history) {
  const text = String(history.at(-1)?.content ?? "").trim();
  const [cmd = "", ...rest] = text.split(/\s+/);
  const word = cmd.toLowerCase();
  const actions = [];

  try {
    if (["list", "ls", "список"].includes(word)) {
      const type = rest.find((w) => Object.hasOwn(ENTITY_TYPES, w.toLowerCase()))?.toLowerCase();
      const status = rest.find((w) => ["DRAFT", "REVIEW", "CANON", "DEPRECATED"].includes(w.toUpperCase()))?.toUpperCase();
      return { reply: fmtList(call(actions, "list_entities", { type, status })), actions };
    }
    if (["find", "search", "найди", "поиск"].includes(word)) {
      return { reply: fmtList(call(actions, "list_entities", { q: rest.join(" ") })), actions };
    }
    if (["tasks", "board", "задачи"].includes(word)) {
      const board = call(actions, "list_tasks", {});
      const reply = Object.entries(board)
        .map(([col, tasks]) => `${col}: ${tasks.length ? tasks.map((t) => `${t.id} ${t.title}`).join("; ") : "—"}`)
        .join("\n");
      return { reply, actions };
    }
    if (["doc", "док"].includes(word)) {
      const name = String(rest[0] ?? "").toUpperCase().replace(/\.(MD|JSON)$/, "");
      return { reply: call(actions, "read_doc", { name }).content, actions };
    }
    if (["draft", "черновик"].includes(word)) {
      const type = rest[0]?.toLowerCase();
      const body = rest.slice(1).join(" ");
      let entity;
      if (body.startsWith("{")) {
        try {
          entity = JSON.parse(body);
        } catch (err) {
          return { reply: `Invalid JSON: ${err.message}`, actions };
        }
      } else {
        const [id, ...name] = rest.slice(1);
        entity = { id, name: name.join(" ") };
      }
      const res = call(actions, "create_draft", { type, entity });
      const warn = res.check.warnings.length ? `\nWarnings: ${res.check.warnings.join("; ")}` : "";
      return {
        reply: `Created DRAFT ${res.entity.id} → ${res.file}\nCanon check: ${res.check.verdict}${warn}\nApprove or reject it in the Review panel.`,
        actions,
      };
    }
    const id = ["show", "покажи", "read"].includes(word) ? rest[0] : text.match(ID_RE)?.[0];
    if (id) {
      const res = call(actions, "read_entity", { id });
      return { reply: `${res.file}\n${JSON.stringify(res.entity, null, 2)}`, actions };
    }
  } catch (err) {
    const details = err.details?.errors?.length ? `\n${err.details.errors.join("\n")}` : "";
    return { reply: `Error: ${err.message}${details}`, actions };
  }
  return { reply: HELP, actions };
}
