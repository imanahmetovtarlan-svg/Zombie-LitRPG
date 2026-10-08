# Command Center (TASK-0001 MVP)

Local web UI for the Orchestrator: chat with the Director, browse `project_data/`, create DRAFT entities,
approve/reject them, and move tasks on a Kanban board.

## Run

```bash
cd orchestrator/command-center
npm install            # optional: only needed for the Claude-backed Director
npm start              # http://127.0.0.1:4317
npm test
```

Environment (put it in a local `.env`/shell, never commit keys):

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Enables the Claude Director. Without it the offline Director (command parser) is used. |
| `DIRECTOR_MODEL` | `claude-opus-5-5` | Model for the Director. |
| `PORT` / `HOST` | `4317` / `127.0.0.1` | Server bind. Keep it on localhost: the API writes files. |

## What it does

- **Director chat.** The Claude Director uses `orchestrator/prompts/DIRECTOR.md` as its system prompt and works through tools:
  `read_doc` (WORLD_BIBLE, world_rules, GAME_SYSTEMS, ORCHESTRATOR_SPEC, CANON_KEEPER, HISTORICAL_CONSISTENCY),
  `list_entities`, `read_entity`, `check_canon`, `create_draft`, `list_tasks`, `create_task`.
  The offline Director understands `list`, `find`, `show <ID>`, `draft <type> <ID> <name>`, `draft <type> {json}`, `tasks`, `doc <NAME>`
  (and Russian equivalents: `список`, `найди`, `покажи`, `черновик`, `задачи`, `док`).
- **Entities.** Reads `project_data/<type>/<ID>.json`, filter by type/status/text, shows the Canon Keeper verdict.
- **DRAFT creation.** From chat or the *New draft* tab. Status is always forced to `DRAFT`, version to `1`; existing IDs are never overwritten; ID prefix must match the type (`CHAR_`, `TRAIT_`, `ABILITY_`, `ITEM_`, `LOC_`, `RECIPE_`, `FACTION_`, `INFECTED_`, `PROF_`, `VEHICLE_`, `DISTRICT_`, `HIVE_`, `TECH_`).
- **Canon check (rule-based Canon Keeper).** Schema basics, ID prefix, duplicate names; for characters all seven attributes
  (`strength, agility, endurance, perception, intelligence, resolve, reaction`) are required and no others are allowed;
  references in `traits`, `abilities` and `profession` must exist (and be CANON before the character can be approved without warnings).
  Historical (1945/46) consistency is judged by the Claude Director using `HISTORICAL_CONSISTENCY.md`, not by code.
- **Approve / Reject.** *Review* tab. Approve sets `CANON` (blocked if the canon check returns `REJECT`; warnings are shown). Reject requires a reason and moves the file to `project_data/_rejected/<type>/`. Every decision is appended to `orchestrator/decisions.jsonl`.
- **No automatic CANON promotion.** The Director has no tool that changes status; only the user's Approve button does.
- **Task board.** Columns BACKLOG / ACTIVE / REVIEW / DONE (+ BLOCKED). The folder under `tasks/` is the status; drag a card or use its dropdown to move it.

## Layout

```
server.js                 HTTP server + JSON API (no framework)
lib/registry.js           entities, canon check, draft/approve/reject
lib/tasks.js              task board over tasks/<status>/
lib/director/tools.js     Director tool definitions (shared by both Directors)
lib/director/anthropic.js Claude Director (tool-use loop)
lib/director/offline.js   offline Director
public/                   UI (vanilla HTML/CSS/JS)
test/                     node:test suite (runs against a temp copy of the repo data)
```

## API

| Method | Path | Body |
|---|---|---|
| GET | `/api/health` | |
| GET | `/api/entities?type=&status=&q=` | |
| GET | `/api/entities/:id` | |
| POST | `/api/entities` | `{type, entity}` → new DRAFT |
| POST | `/api/check` | `{type, entity}` → canon verdict |
| POST | `/api/entities/:id/approve` | `{note?}` |
| POST | `/api/entities/:id/reject` | `{reason}` |
| GET | `/api/tasks` | |
| POST | `/api/tasks/:id/move` | `{status}` |
| POST | `/api/chat` | `{messages: [{role, content}]}` |
