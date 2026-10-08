// Orchestrator Command Center MVP — local web UI + JSON API. No runtime dependencies
// besides the optional Anthropic SDK for the LLM Director.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENTITY_TYPES, RegistryError, listEntities, readEntity, checkEntity,
  createDraft, approveEntity, rejectEntity,
} from "./lib/registry.js";
import { listTasks, moveTask, TASK_STATUSES } from "./lib/tasks.js";
import * as offlineDirector from "./lib/director/offline.js";
import * as claudeDirector from "./lib/director/anthropic.js";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
const MAX_BODY = 1_000_000;

async function director() {
  return (await claudeDirector.isAvailable())
    ? { name: "claude", impl: claudeDirector }
    : { name: "offline", impl: offlineDirector };
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new RegistryError("Request body too large", 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RegistryError("Body must be JSON");
  }
}

function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = path.join(publicDir, rel);
  if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404).end("Not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

export async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const { pathname } = url;
  const m = (re) => pathname.match(re);
  let match;

  try {
    if (req.method === "GET" && pathname === "/api/health") {
      return send(res, 200, {
        ok: true,
        director: (await director()).name,
        entityTypes: Object.keys(ENTITY_TYPES),
        entityPrefixes: ENTITY_TYPES,
        taskStatuses: TASK_STATUSES,
      });
    }
    if (req.method === "GET" && pathname === "/api/entities") {
      const q = Object.fromEntries(url.searchParams);
      return send(res, 200, listEntities({ type: q.type || undefined, status: q.status || undefined, q: q.q || undefined }));
    }
    if (req.method === "POST" && pathname === "/api/entities") {
      const { type, entity } = await readBody(req);
      return send(res, 201, createDraft(type, entity ?? {}, { author: "user" }));
    }
    if (req.method === "POST" && pathname === "/api/check") {
      const { type, entity } = await readBody(req);
      return send(res, 200, checkEntity(type, entity));
    }
    if (req.method === "GET" && (match = m(/^\/api\/entities\/([^/]+)$/))) {
      const found = readEntity(decodeURIComponent(match[1]));
      return send(res, 200, { ...found, check: checkEntity(found.type, found.entity, { forCanon: true }) });
    }
    if (req.method === "POST" && (match = m(/^\/api\/entities\/([^/]+)\/approve$/))) {
      const body = await readBody(req);
      return send(res, 200, approveEntity(decodeURIComponent(match[1]), body));
    }
    if (req.method === "POST" && (match = m(/^\/api\/entities\/([^/]+)\/reject$/))) {
      const body = await readBody(req);
      return send(res, 200, rejectEntity(decodeURIComponent(match[1]), body));
    }
    if (req.method === "GET" && pathname === "/api/tasks") {
      return send(res, 200, listTasks());
    }
    if (req.method === "POST" && (match = m(/^\/api\/tasks\/([^/]+)\/move$/))) {
      const { status } = await readBody(req);
      return send(res, 200, moveTask(decodeURIComponent(match[1]), status));
    }
    if (req.method === "POST" && pathname === "/api/chat") {
      const { messages } = await readBody(req);
      if (!Array.isArray(messages) || !messages.length || messages.at(-1).role !== "user" ||
          messages.some((msg) => !["user", "assistant"].includes(msg?.role) || typeof msg.content !== "string")) {
        throw new RegistryError("messages must be [{role, content}] ending with a user message");
      }
      const { name, impl } = await director();
      let result;
      try {
        result = await impl.chat(messages);
      } catch (err) {
        console.error(err);
        throw new RegistryError(`Director (${name}) failed: ${err.message}`, 502);
      }
      return send(res, 200, { director: name, ...result });
    }
    if (pathname.startsWith("/api/")) return send(res, 404, { error: "Not found" });
    if (req.method === "GET") return serveStatic(req, res, pathname);
    return send(res, 405, { error: "Method not allowed" });
  } catch (err) {
    const status = err instanceof RegistryError ? err.status : 500;
    if (status === 500) console.error(err);
    return send(res, status, { error: err.message, details: err.details });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 4317;
  const host = process.env.HOST || "127.0.0.1";
  http.createServer(handle).listen(port, host, async () => {
    console.log(`Command Center: http://${host}:${port}  (director: ${(await director()).name})`);
  });
}
