// Rule-based engine used without an API key (and in tests). Routing by keywords; only the
// Canon Keeper and Historical checks do real work, other roles report that they need Claude.
import { ROLES, ROLE_KEYS } from "./roles.js";
import { ENTITY_TYPES, checkEntity, listEntities } from "../registry.js";

// Ordinary technology/terms that do not exist in late 1945 / early 1946.
const ANACHRONISMS = [
  [/калашников|ак-47|ak-47/i, "АК-47 принят на вооружение в 1949 г."],
  [/транзистор|transistor/i, "транзистор изобретён в конце 1947 г."],
  [/смартфон|мобильн\S* телефон|сотов|smartphone|cell ?phone/i, "мобильная связь — после 1946 г."],
  [/интернет|internet|компьютер|computer|ноутбук|laptop/i, "компьютеры/сети недоступны в 1945–46 гг."],
  [/хрущ[её]вк|панельн/i, "панельное жильё — с конца 1950-х"],
  [/дрон|квадрокоптер|drone/i, "дроны — анахронизм"],
  [/кевлар|kevlar|пластиков\S* бутыл/i, "материал появился значительно позже"],
  [/вертол[её]т|helicopter/i, "вертолёты в 1945–46 гг. — единичные опытные машины; нужна сверка"],
  [/птср|ptsd/i, "термин «ПТСР» в среде героя не используется (World Bible)"],
];

const prefixType = (id) => Object.entries(ENTITY_TYPES).find(([, p]) => id.startsWith(p))?.[0];

// Pull JSON objects with an "id" out of free text, e.g. a pasted entity.
function extractEntities(text) {
  const out = [];
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) {
        try {
          const obj = JSON.parse(text.slice(start, i + 1));
          if (obj && typeof obj.id === "string") {
            out.push(obj);
            start = i;
          }
        } catch {}
        break;
      }
    }
  }
  return out;
}

const empty = (verdict, summary, extra = {}) =>
  ({ verdict, summary, findings: [], entity_proposals: [], task_proposals: [], ...extra });

export const offlineEngine = {
  name: "offline",

  async route({ request, brief }) {
    const text = `${request}\n${brief ?? ""}`.toLowerCase();
    const roles = ROLE_KEYS.filter((k) => k === "canon" || ROLES[k].keywords.some((w) => text.includes(w)));
    if ((roles.includes("technical") || roles.includes("game_design")) && !roles.includes("qa")) roles.push("qa");
    return {
      reasoning: "offline keyword routing",
      assignments: roles.map((role) => ({ role, brief: `Review the request from the ${ROLES[role].label} perspective.` })),
    };
  },

  async specialist({ role }, { request }) {
    if (role === "canon") {
      const findings = [];
      const proposals = [];
      const known = new Set(listEntities().map((e) => e.id));
      for (const id of new Set(request.match(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g) ?? [])) {
        if (known.has(id)) findings.push({ severity: "note", issue: `${id} already exists`, ids: [id] });
      }
      for (const entity of extractEntities(request)) {
        const type = prefixType(entity.id);
        if (!type) {
          findings.push({ severity: "blocking", issue: `unknown id prefix for ${entity.id}`, ids: [entity.id] });
          continue;
        }
        const check = checkEntity(type, { ...entity, status: "DRAFT", version: 1 });
        for (const e of check.errors) findings.push({ severity: "blocking", issue: e, ids: [entity.id] });
        for (const w of check.warnings) findings.push({ severity: "warning", issue: w, ids: [entity.id] });
        if (known.has(entity.id)) findings.push({ severity: "blocking", issue: `${entity.id} already exists`, ids: [entity.id] });
        else if (check.verdict !== "REJECT") {
          proposals.push({ type, entity_json: JSON.stringify(entity), rationale: "entity supplied in the request" });
        }
      }
      const verdict = findings.some((f) => f.severity === "blocking") ? "REJECT"
        : findings.some((f) => f.severity === "warning") ? "PASS_WITH_WARNINGS" : "PASS";
      return empty(verdict, `${proposals.length} entity candidate(s) checked`, { findings, entity_proposals: proposals });
    }
    if (role === "historical") {
      const findings = ANACHRONISMS.filter(([re]) => re.test(request))
        .map(([re, why]) => ({ severity: "blocking", issue: `${request.match(re)[0]}: ${why}`, ids: [] }));
      return empty(findings.length ? "REJECT" : "PASS",
        findings.length ? "найдены анахронизмы" : "явных анахронизмов не найдено (офлайн-проверка по словарю)", { findings });
    }
    return empty("INFO", `${ROLES[role].label}: needs the Claude engine (set ANTHROPIC_API_KEY)`);
  },

  async merge(ctx, reports) {
    const historicalReject = reports.some((r) => r.role === "historical" && r.verdict === "REJECT");
    return {
      summary: reports.map((r) => `${ROLES[r.role]?.label ?? r.role}: ${r.verdict} — ${r.summary}`).join("\n"),
      entity_proposals: historicalReject ? [] : reports.flatMap((r) => r.entity_proposals ?? []),
      task_proposals: reports.flatMap((r) => r.task_proposals ?? []),
      conflicts: historicalReject ? ["Historical Consistency rejected the request; no drafts were created"] : [],
      open_questions: [],
    };
  },
};
